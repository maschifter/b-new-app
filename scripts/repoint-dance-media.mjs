// Repoints catalog URL columns at the objects migrate-dance-media.mjs already uploaded.
// Needed because import-boogiz-dancemoves.mjs upserts every column from the Mongo backup,
// so re-running the catalog import restores the legacy URLs over migrated ones.
// Storage is not written; a field whose object is absent keeps its legacy URL.

const ENV_FILE = new URL("../apps/server/.env", import.meta.url);
const BUCKET = "dance-media";
const DEFAULT_SOURCE_HOST = "amazonaws.com";
const READ_BATCH_SIZE = 1_000;
const LIST_BATCH_SIZE = 100;
const CONCURRENCY = 8;
const MAX_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [1_000, 5_000];
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
const PROGRESS_INTERVAL = 200;

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

function publicUrlFor(environment, objectPath) {
  return `${environment.supabaseUrl}/storage/v1/object/public/${BUCKET}/${objectPath}`;
}

function baseNameOf(fileName) {
  const dotIndex = fileName.lastIndexOf(".");
  return dotIndex <= 0 ? fileName : fileName.slice(0, dotIndex);
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

// Lists one object folder. The migrated file name is the field's object name plus the
// extension of whichever source URL was migrated, which need not be the extension the
// row holds today, so the stored file name is read rather than reconstructed.
async function listFolder(environment, folderPrefix) {
  const names = [];

  for (let offset = 0; ; offset += LIST_BATCH_SIZE) {
    const response = await fetchWithRetry(
      `${environment.supabaseUrl}/storage/v1/object/list/${BUCKET}`,
      {
        method: "POST",
        headers: { ...environment.authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ prefix: folderPrefix, limit: LIST_BATCH_SIZE, offset }),
      },
      `list ${folderPrefix}`,
    );

    if (!response.ok) {
      throw new Error(`Listing ${folderPrefix} failed (${response.status}): ${await response.text()}`);
    }

    const batch = await response.json();
    names.push(...batch.filter((entry) => entry.id !== null).map((entry) => entry.name));

    if (batch.length < LIST_BATCH_SIZE) {
      return names;
    }
  }
}

// Commits one field. Filtering on the old value keeps a concurrent admin edit intact;
// an empty representation means the value changed mid-run ("stale").
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
      body: JSON.stringify({ [target.field]: publicUrlFor(environment, target.objectPath) }),
    },
    `update ${target.table}.${target.field}`,
  );

  if (!response.ok) {
    throw new Error(`db update failed (${response.status}): ${await response.text()}`);
  }

  return (await response.json()).length > 0;
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

function classifyRow(environment, row, definition, sourceHost, counters) {
  const targets = [];
  const folderKey = row.legacy_id ?? row.id;

  for (const [field, objectName] of Object.entries(definition.fields)) {
    const sourceUrl = row[field];

    if (typeof sourceUrl !== "string" || sourceUrl === "") {
      counters.empty += 1;
      continue;
    }

    if (sourceUrl.startsWith(`${environment.supabaseUrl}/storage/v1/object/public/`)) {
      counters.alreadyRepointed += 1;
      continue;
    }

    if (!matchesSourceHost(sourceUrl, sourceHost)) {
      counters.foreignHost += 1;
      continue;
    }

    targets.push({
      table: definition.table,
      field,
      rowId: row.id,
      legacyId: row.legacy_id,
      sourceUrl,
      objectName,
      folderPrefix: `${definition.prefix}/${folderKey}/`,
    });
  }

  return targets;
}

async function resolveRowTargets(environment, targets) {
  const fileNames = await listFolder(environment, targets[0].folderPrefix);
  const fileNameByBase = new Map(fileNames.map((name) => [baseNameOf(name), name]));
  const resolved = [];
  const missing = [];

  for (const target of targets) {
    const fileName = fileNameByBase.get(target.objectName);

    if (fileName === undefined) {
      missing.push(target);
      continue;
    }

    resolved.push({ ...target, objectPath: `${target.folderPrefix}${fileName}` });
  }

  return { resolved, missing };
}

function summarize(label, entries) {
  const byField = new Map();

  for (const entry of entries) {
    const key = `${entry.table}.${entry.field}`;
    byField.set(key, (byField.get(key) ?? 0) + 1);
  }

  console.log(`${label}: ${entries.length}`);
  for (const [key, count] of [...byField.entries()].sort()) {
    console.log(`  ${key}: ${count}`);
  }
}

const { dryRun, sourceHost } = parseArguments(process.argv.slice(2));
const environment = loadEnvironment();
const counters = { empty: 0, alreadyRepointed: 0, foreignHost: 0, repointed: 0, stale: 0 };
const rowGroups = [];

for (const definition of MEDIA_TABLES) {
  const columns = ["id", "legacy_id", ...Object.keys(definition.fields)];
  const rows = await readRows(environment, definition.table, columns);

  for (const row of rows) {
    const targets = classifyRow(environment, row, definition, sourceHost, counters);
    if (targets.length > 0) {
      rowGroups.push(targets);
    }
  }
}

console.log(
  `Rows needing a repoint: ${rowGroups.length} ` +
    `(${counters.alreadyRepointed} fields already repointed, ${counters.empty} empty, ` +
    `${counters.foreignHost} on another host)`,
);

const resolvedTargets = [];
const missingTargets = [];
const failures = [];
let processed = 0;

await runPool(rowGroups, CONCURRENCY, async (targets) => {
  try {
    const { resolved, missing } = await resolveRowTargets(environment, targets);
    resolvedTargets.push(...resolved);
    missingTargets.push(...missing);
  } catch (error) {
    for (const target of targets) {
      failures.push({ ...target, reason: error.message });
    }
  } finally {
    processed += 1;
    if (processed % PROGRESS_INTERVAL === 0) {
      console.log(`Listed ${processed}/${rowGroups.length} folders`);
    }
  }
});

summarize("Fields with a migrated object", resolvedTargets);
summarize("Fields with no migrated object (keeping their legacy URL)", missingTargets);

if (dryRun) {
  console.log("Dry run: no database writes performed");
} else {
  await runPool(resolvedTargets, CONCURRENCY, async (target) => {
    try {
      if (await updateRowField(environment, target)) {
        counters.repointed += 1;
      } else {
        counters.stale += 1;
      }
    } catch (error) {
      failures.push({ ...target, reason: error.message });
    }
  });

  console.log(`Repointed ${counters.repointed} fields (${counters.stale} stale, skipped)`);
}

if (failures.length > 0) {
  console.warn(`${failures.length} field(s) failed and keep their legacy URL:`);
  for (const failure of failures) {
    console.warn(
      `  ${failure.table}.${failure.field} legacy_id=${failure.legacyId ?? failure.rowId} — ` +
        `${failure.reason}`,
    );
  }
  process.exitCode = 1;
}
