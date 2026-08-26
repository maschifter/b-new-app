const ENV_FILE = new URL("../apps/server/.env", import.meta.url);
const BUCKET = "dance-media";
const DEFAULT_SOURCE_HOST = "amazonaws.com";
const READ_BATCH_SIZE = 1_000;
const CONCURRENCY = 6;
const DOWNLOAD_TIMEOUT_MS = 120_000;
const MAX_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [1_000, 5_000];
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
const PROGRESS_INTERVAL = 100;

const MEDIA_TABLES = [
  {
    table: "dance_moves",
    prefix: "moves",
    fields: {
      thumbnail_url: "thumbnail",
      main_video_url: "main",
      pro_dancer_video_url: "pro-dancer",
      pro_dancer_image_url: "pro-dancer-image",
      dancer_tip_video_url: "dancer-tip",
      dancer_tip_image_url: "dancer-tip-image",
      presentation_video_url: "presentation",
      film_yourself_video_url: "film-yourself",
    },
  },
  {
    table: "music_tracks",
    prefix: "tracks",
    fields: {
      audio_url: "audio",
      thumbnail_url: "cover",
    },
  },
];

const CONTENT_TYPE_BY_EXTENSION = {
  mp4: "video/mp4",
  mov: "video/quicktime",
  mp3: "audio/mpeg",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

function parseArguments(arguments_) {
  let dryRun = false;
  let sourceHost = DEFAULT_SOURCE_HOST;

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];

    if (argument === "--dry-run") {
      dryRun = true;
    } else if (argument === "--source-host") {
      const value = arguments_[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("--source-host requires a host value");
      }
      sourceHost = value;
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  return { dryRun, sourceHost };
}

function loadEnvironment() {
  process.loadEnvFile(ENV_FILE);

  const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl || !secretKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SECRET_KEY are required in apps/server/.env");
  }

  return {
    supabaseUrl,
    authHeaders: { apikey: secretKey, Authorization: `Bearer ${secretKey}` },
  };
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function fetchWithRetry(url, options, label) {
  for (let attempt = 1; ; attempt += 1) {
    let response;

    try {
      response = await fetch(url, options);
    } catch (error) {
      if (attempt >= MAX_ATTEMPTS) {
        throw new Error(`${label} failed after ${attempt} attempts: ${error.message}`);
      }
      await sleep(RETRY_DELAYS_MS[attempt - 1]);
      continue;
    }

    if (!RETRYABLE_STATUSES.has(response.status) || attempt >= MAX_ATTEMPTS) {
      return response;
    }

    await response.body?.cancel();
    await sleep(RETRY_DELAYS_MS[attempt - 1]);
  }
}

function matchesSourceHost(value, sourceHost) {
  let parsed;

  try {
    parsed = new URL(value);
  } catch {
    return false;
  }

  return parsed.hostname === sourceHost || parsed.hostname.endsWith(`.${sourceHost}`);
}

function extensionOf(url) {
  const match = new URL(url).pathname.match(/\.([a-zA-Z0-9]+)$/);
  return match ? match[1].toLowerCase() : null;
}

async function readRows(environment, table, columns) {
  const rows = [];

  for (let offset = 0; ; offset += READ_BATCH_SIZE) {
    const response = await fetchWithRetry(
      `${environment.supabaseUrl}/rest/v1/${table}?select=${columns.join(",")}` +
        `&order=id.asc&limit=${READ_BATCH_SIZE}&offset=${offset}`,
      { headers: environment.authHeaders },
      `read ${table}`,
    );

    if (!response.ok) {
      throw new Error(`Reading ${table} failed (${response.status}): ${await response.text()}`);
    }

    const batch = await response.json();
    rows.push(...batch);

    if (batch.length < READ_BATCH_SIZE) {
      return rows;
    }
  }
}

async function buildWorkGroups(environment, sourceHost, failures) {
  const groupsBySourceUrl = new Map();

  for (const { table, prefix, fields } of MEDIA_TABLES) {
    const rows = await readRows(environment, table, ["id", "legacy_id", ...Object.keys(fields)]);

    for (const row of rows) {
      for (const [field, objectName] of Object.entries(fields)) {
        const sourceUrl = row[field];

        if (typeof sourceUrl !== "string" || !matchesSourceHost(sourceUrl, sourceHost)) {
          continue;
        }

        const target = {
          table,
          field,
          rowId: row.id,
          legacyId: row.legacy_id,
          sourceUrl,
        };

        const extension = extensionOf(sourceUrl);
        const contentType = extension === null ? undefined : CONTENT_TYPE_BY_EXTENSION[extension];

        if (!contentType) {
          failures.push({ ...target, reason: `unsupported extension in ${sourceUrl}` });
          continue;
        }

        target.objectPath = `${prefix}/${row.legacy_id ?? row.id}/${objectName}.${extension}`;
        target.contentType = contentType;

        const group = groupsBySourceUrl.get(sourceUrl) ?? { sourceUrl, targets: [] };
        group.targets.push(target);
        groupsBySourceUrl.set(sourceUrl, group);
      }
    }
  }

  return [...groupsBySourceUrl.values()];
}

async function ensureBucket(environment) {
  const bucketUrl = `${environment.supabaseUrl}/storage/v1/bucket/${BUCKET}`;
  const response = await fetchWithRetry(
    bucketUrl,
    { headers: environment.authHeaders },
    `read bucket ${BUCKET}`,
  );

  if (response.ok) {
    const bucket = await response.json();
    if (bucket.public !== true) {
      throw new Error(`Bucket ${BUCKET} exists but is not public — make it public first`);
    }
    return;
  }

  if (response.status !== 404 && response.status !== 400) {
    throw new Error(`Reading bucket failed (${response.status}): ${await response.text()}`);
  }

  await response.body?.cancel();
  const creation = await fetchWithRetry(
    `${environment.supabaseUrl}/storage/v1/bucket`,
    {
      method: "POST",
      headers: { ...environment.authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true }),
    },
    `create bucket ${BUCKET}`,
  );

  if (!creation.ok) {
    throw new Error(`Creating bucket failed (${creation.status}): ${await creation.text()}`);
  }

  console.log(`Created public bucket ${BUCKET}`);
}

function publicUrlFor(environment, objectPath) {
  return `${environment.supabaseUrl}/storage/v1/object/public/${BUCKET}/${objectPath}`;
}

async function downloadSource(sourceUrl) {
  const response = await fetchWithRetry(
    sourceUrl,
    { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) },
    `download ${sourceUrl}`,
  );

  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`download failed with status ${response.status}`);
  }

  return new Uint8Array(await response.arrayBuffer());
}

async function objectExistsWithSize(environment, objectPath, size) {
  const response = await fetchWithRetry(
    publicUrlFor(environment, objectPath),
    { method: "HEAD" },
    `head ${objectPath}`,
  );

  return response.ok && Number(response.headers.get("content-length")) === size;
}

async function uploadObject(environment, target, bytes) {
  const response = await fetchWithRetry(
    `${environment.supabaseUrl}/storage/v1/object/${BUCKET}/${target.objectPath}`,
    {
      method: "POST",
      headers: {
        ...environment.authHeaders,
        "Content-Type": target.contentType,
        "Cache-Control": "max-age=31536000",
        "x-upsert": "true",
      },
      body: bytes,
    },
    `upload ${target.objectPath}`,
  );

  if (!response.ok) {
    throw new Error(`upload failed (${response.status}): ${await response.text()}`);
  }
}

// Commits one migrated field. Filtering on the old value keeps a concurrent admin
// edit intact; an empty representation means the value changed mid-run ("stale").
async function updateRowField(environment, target) {
  const response = await fetchWithRetry(
    `${environment.supabaseUrl}/rest/v1/${target.table}?id=eq.${target.rowId}` +
      `&${target.field}=eq.${encodeURIComponent(target.sourceUrl)}`,
    {
      method: "PATCH",
      headers: {
        ...environment.authHeaders,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        [target.field]: publicUrlFor(environment, target.objectPath),
      }),
    },
    `update ${target.table}.${target.field}`,
  );

  if (!response.ok) {
    throw new Error(`db update failed (${response.status}): ${await response.text()}`);
  }

  const updatedRows = await response.json();
  return updatedRows.length > 0;
}

async function runPool(items, concurrency, worker) {
  let nextIndex = 0;

  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    for (;;) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) {
        return;
      }
      await worker(items[index], index);
    }
  });

  await Promise.all(runners);
}

async function migrateGroups(environment, groups, failures) {
  const counters = { migrated: 0, stale: 0, uploaded: 0, alreadyUploaded: 0, processed: 0 };

  await runPool(groups, CONCURRENCY, async (group) => {
    let bytes;

    try {
      bytes = await downloadSource(group.sourceUrl);
    } catch (error) {
      for (const target of group.targets) {
        failures.push({ ...target, reason: error.message });
      }
      return;
    } finally {
      counters.processed += 1;
      if (counters.processed % PROGRESS_INTERVAL === 0) {
        console.log(`Processed ${counters.processed}/${groups.length} source files`);
      }
    }

    for (const target of group.targets) {
      try {
        if (await objectExistsWithSize(environment, target.objectPath, bytes.length)) {
          counters.alreadyUploaded += 1;
        } else {
          await uploadObject(environment, target, bytes);
          counters.uploaded += 1;
        }

        if (await updateRowField(environment, target)) {
          counters.migrated += 1;
        } else {
          counters.stale += 1;
        }
      } catch (error) {
        failures.push({ ...target, reason: error.message });
      }
    }
  });

  return counters;
}

function summarizeWorkList(groups) {
  const fieldCounts = new Map();

  for (const group of groups) {
    for (const target of group.targets) {
      const key = `${target.table}.${target.field}`;
      fieldCounts.set(key, (fieldCounts.get(key) ?? 0) + 1);
    }
  }

  const totalFields = [...fieldCounts.values()].reduce((sum, count) => sum + count, 0);
  console.log(`Pending fields: ${totalFields} across ${groups.length} unique source files`);
  for (const [key, count] of [...fieldCounts.entries()].sort()) {
    console.log(`  ${key}: ${count}`);
  }
}

function printFailures(failures) {
  if (failures.length === 0) {
    return;
  }

  console.warn(`${failures.length} field(s) failed and keep their legacy URL:`);
  for (const failure of failures) {
    console.warn(
      `  ${failure.table}.${failure.field} legacy_id=${failure.legacyId ?? failure.rowId} ` +
        `${failure.sourceUrl} — ${failure.reason}`,
    );
  }
}

const { dryRun, sourceHost } = parseArguments(process.argv.slice(2));
const environment = loadEnvironment();
const failures = [];
const groups = await buildWorkGroups(environment, sourceHost, failures);

summarizeWorkList(groups);

if (dryRun) {
  printFailures(failures);
  console.log("Dry run: no storage or database writes performed");
} else {
  await ensureBucket(environment);
  const counters = await migrateGroups(environment, groups, failures);
  console.log(`Migrated ${counters.migrated} fields (${counters.stale} stale, skipped)`);
  console.log(
    `Uploaded ${counters.uploaded} objects (${counters.alreadyUploaded} already present)`,
  );
  printFailures(failures);
}
