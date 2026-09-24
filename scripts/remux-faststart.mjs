// Moves the MP4 moov atom to the front of the migrated catalog videos, so a player reads the
// sample table from the first range request instead of seeking to the end of the file first.
// Remux only: ffmpeg stream-copies every track, so codec, bitrate and frame timing are untouched.
// Objects already carrying moov before mdat are left alone, which makes the script idempotent.

import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ENV_FILE = new URL("../apps/server/.env", import.meta.url);
const BUCKET = "dance-media";
const TABLE = "dance_moves";
const DEFAULT_FIELDS = ["main_video_url"];
const ALL_VIDEO_FIELDS = [
  "main_video_url",
  "pro_dancer_video_url",
  "dancer_tip_video_url",
  "presentation_video_url",
  "film_yourself_video_url",
];
const HEAD_BYTES = 65_536;
const READ_BATCH_SIZE = 1_000;
const CONCURRENCY = 4;
const MAX_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [1_000, 5_000];
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
const DOWNLOAD_TIMEOUT_MS = 120_000;
const FFMPEG_TIMEOUT_MS = 120_000;
// A stream-copy remux only rewrites the container, so a large size change means ffmpeg did
// something other than relocating moov and the result must not be uploaded.
const MAX_SIZE_DRIFT = 0.02;
// Overwriting an object does not purge the CDN synchronously; an edge kept serving the previous
// copy for about four minutes in practice, so propagation is polled rather than assumed.
const WARMUP_POLL_MS = 15_000;
const WARMUP_TIMEOUT_MS = 600_000;

function parseArguments(arguments_) {
  let dryRun = false;
  let skipWarmup = false;
  let status = "published";
  let limit = Number.POSITIVE_INFINITY;
  const fields = [];

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    const takeValue = (name) => {
      const value = arguments_[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`${name} requires a value`);
      }
      index += 1;
      return value;
    };

    if (argument === "--dry-run") {
      dryRun = true;
    } else if (argument === "--skip-warmup") {
      skipWarmup = true;
    } else if (argument === "--status") {
      status = takeValue("--status");
    } else if (argument === "--limit") {
      limit = Number.parseInt(takeValue("--limit"), 10);
      if (!Number.isFinite(limit) || limit <= 0) {
        throw new Error("--limit requires a positive integer");
      }
    } else if (argument === "--field") {
      const value = takeValue("--field");
      if (value === "all") {
        fields.push(...ALL_VIDEO_FIELDS);
      } else if (ALL_VIDEO_FIELDS.includes(value)) {
        fields.push(value);
      } else {
        throw new Error(`Unknown field: ${value}`);
      }
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  return {
    dryRun,
    skipWarmup,
    status,
    limit,
    fields: [...new Set(fields.length > 0 ? fields : DEFAULT_FIELDS)],
  };
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
    publicPrefix: `${supabaseUrl}/storage/v1/object/public/${BUCKET}/`,
    originPrefix: `${supabaseUrl}/storage/v1/object/authenticated/${BUCKET}/`,
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
      response = await fetch(url, { ...options, signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
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

function run(command, arguments_) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, arguments_, { stdio: ["ignore", "pipe", "pipe"] });
    const timer = setTimeout(() => child.kill("SIGKILL"), FFMPEG_TIMEOUT_MS);
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(
          new Error(`${command} exited ${code}: ${stderr.trim().split("\n").slice(-3).join(" ")}`),
        );
      }
    });
  });
}

function readAtomHeader(buffer, offset) {
  if (offset + 8 > buffer.length) {
    return null;
  }

  const type = buffer.toString("latin1", offset + 4, offset + 8);
  const size = buffer.readUInt32BE(offset);

  if (size === 1) {
    if (offset + 16 > buffer.length) {
      return null;
    }
    return { type, size: Number(buffer.readBigUInt64BE(offset + 8)) };
  }

  return { type, size: size === 0 ? Number.POSITIVE_INFINITY : size };
}

// Walks the top-level atom chain until moov or mdat appears; whichever comes first decides
// whether a player can build its sample table from the head of the file.
function classifyHead(head) {
  for (let offset = 0; ; ) {
    const atom = readAtomHeader(head, offset);

    if (atom === null) {
      return "inconclusive";
    }
    if (atom.type === "moov") {
      return "faststart";
    }
    if (atom.type === "mdat") {
      return "tail-moov";
    }
    if (!Number.isFinite(atom.size) || atom.size < 8) {
      return "inconclusive";
    }

    offset += atom.size;
  }
}

// Reads through the origin rather than the public URL: the CDN keeps serving the previous copy
// of an overwritten object for several minutes, so an edge read cannot tell what is stored now.
async function readHead(environment, objectPath, label) {
  const response = await fetchWithRetry(
    `${environment.originPrefix}${objectPath}`,
    { headers: { ...environment.authHeaders, Range: `bytes=0-${HEAD_BYTES - 1}` } },
    label,
  );

  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`${label} failed with status ${response.status}`);
  }

  return {
    head: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get("content-type") ?? "video/mp4",
  };
}

async function readRows(environment, fields, status, limit) {
  const columns = ["id", "legacy_id", "title", "status", ...fields];
  const statusFilter = status === "any" ? "" : `&status=eq.${encodeURIComponent(status)}`;
  const rows = [];

  for (let offset = 0; ; offset += READ_BATCH_SIZE) {
    const response = await fetchWithRetry(
      `${environment.supabaseUrl}/rest/v1/${TABLE}?select=${columns.join(",")}${statusFilter}` +
        `&order=id.asc&limit=${READ_BATCH_SIZE}&offset=${offset}`,
      { headers: environment.authHeaders },
      `read ${TABLE}`,
    );

    if (!response.ok) {
      throw new Error(`Reading ${TABLE} failed (${response.status}): ${await response.text()}`);
    }

    const batch = await response.json();
    rows.push(...batch);

    if (batch.length < READ_BATCH_SIZE || rows.length >= limit) {
      return rows;
    }
  }
}

function collectObjects(environment, rows, fields, limit) {
  const objects = [];
  const seen = new Set();
  let offBucket = 0;

  for (const row of rows) {
    for (const field of fields) {
      const url = row[field];

      if (typeof url !== "string" || url === "") {
        continue;
      }
      if (!url.startsWith(environment.publicPrefix)) {
        offBucket += 1;
        continue;
      }

      const objectPath = decodeURIComponent(url.slice(environment.publicPrefix.length));

      if (seen.has(objectPath)) {
        continue;
      }
      seen.add(objectPath);
      objects.push({ objectPath, url, field, title: row.title, legacyId: row.legacy_id });

      if (objects.length >= limit) {
        return { objects, offBucket };
      }
    }
  }

  return { objects, offBucket };
}

async function uploadObject(environment, objectPath, contentType, bytes) {
  const response = await fetchWithRetry(
    `${environment.supabaseUrl}/storage/v1/object/${BUCKET}/${objectPath}`,
    {
      method: "POST",
      headers: {
        ...environment.authHeaders,
        "Content-Type": contentType,
        "Cache-Control": "max-age=31536000",
        "x-upsert": "true",
      },
      body: bytes,
    },
    `upload ${objectPath}`,
  );

  if (!response.ok) {
    throw new Error(`upload failed (${response.status}): ${await response.text()}`);
  }
}

async function probeStreams(filePath) {
  const output = await run("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration:stream=codec_name,codec_type,nb_frames",
    "-of",
    "json",
    filePath,
  ]);

  return JSON.parse(output);
}

// Requests the head of the public URL until it serves the remuxed copy, which both confirms the
// CDN purged and leaves the edge holding the new object for the next reader.
async function warmObject(environment, object, awaitPropagation, deadline) {
  for (;;) {
    const response = await fetchWithRetry(
      object.url,
      { headers: { Range: `bytes=0-${HEAD_BYTES - 1}` } },
      `warm ${object.objectPath}`,
    );

    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`warm failed with status ${response.status}`);
    }

    const layout = classifyHead(Buffer.from(await response.arrayBuffer()));

    if (layout === "faststart" || !awaitPropagation || Date.now() >= deadline) {
      return layout;
    }

    await sleep(WARMUP_POLL_MS);
  }
}

// Rejects an output whose tracks or duration moved, which a stream copy must never do.
function describeDrift(source, output, sourceSize, outputSize) {
  const signature = (probe) =>
    (probe.streams ?? [])
      .map((stream) => `${stream.codec_type}:${stream.codec_name}:${stream.nb_frames ?? "?"}`)
      .join("|");

  if (signature(source) !== signature(output)) {
    return `stream signature changed (${signature(source)} -> ${signature(output)})`;
  }

  const sourceDuration = Number(source.format?.duration);
  const outputDuration = Number(output.format?.duration);

  if (Number.isFinite(sourceDuration) && Math.abs(outputDuration - sourceDuration) > 0.05) {
    return `duration changed (${sourceDuration} -> ${outputDuration})`;
  }
  if (Math.abs(outputSize - sourceSize) / sourceSize > MAX_SIZE_DRIFT) {
    return `size changed by more than ${MAX_SIZE_DRIFT * 100}% (${sourceSize} -> ${outputSize})`;
  }

  return null;
}

async function remuxObject(environment, object, workDirectory, dryRun) {
  const { head, contentType } = await readHead(
    environment,
    object.objectPath,
    `head ${object.objectPath}`,
  );
  const layout = classifyHead(head);

  if (layout !== "tail-moov") {
    return { outcome: layout === "faststart" ? "already-faststart" : "inconclusive" };
  }
  if (dryRun) {
    return { outcome: "would-remux" };
  }

  const extension = object.objectPath.slice(object.objectPath.lastIndexOf("."));
  const sourcePath = join(workDirectory, `source${extension}`);
  const outputPath = join(workDirectory, `output${extension}`);

  try {
    const response = await fetchWithRetry(
      `${environment.originPrefix}${object.objectPath}`,
      { headers: environment.authHeaders },
      `download ${object.objectPath}`,
    );

    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`download failed with status ${response.status}`);
    }

    const sourceBytes = Buffer.from(await response.arrayBuffer());
    await writeFile(sourcePath, sourceBytes);
    await run("ffmpeg", [
      "-nostdin",
      "-v",
      "error",
      "-y",
      "-i",
      sourcePath,
      "-c",
      "copy",
      "-map",
      "0",
      // A tmcd timecode track has no decoder, so an explicit copy of it fails the whole remux.
      // The mov muxer rebuilds it from the input's timecode, which keeps the track count equal.
      "-map",
      "-0:d",
      "-movflags",
      "+faststart",
      outputPath,
    ]);

    const outputBytes = await readFile(outputPath);
    const drift = describeDrift(
      await probeStreams(sourcePath),
      await probeStreams(outputPath),
      sourceBytes.length,
      outputBytes.length,
    );

    if (drift !== null) {
      return { outcome: "rejected", reason: drift };
    }
    if (classifyHead(outputBytes.subarray(0, HEAD_BYTES)) !== "faststart") {
      return { outcome: "rejected", reason: "ffmpeg output still carries moov after mdat" };
    }

    await uploadObject(environment, object.objectPath, contentType, outputBytes);

    const verified = await readHead(environment, object.objectPath, `verify ${object.objectPath}`);

    if (classifyHead(verified.head) !== "faststart") {
      return { outcome: "unverified", reason: "the stored object still reads as tail-moov" };
    }

    return { outcome: "remuxed", bytes: outputBytes.length };
  } finally {
    await rm(sourcePath, { force: true });
    await rm(outputPath, { force: true });
  }
}

async function runPool(items, concurrency, worker) {
  let nextIndex = 0;

  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async (_, slot) => {
    for (;;) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) {
        return;
      }
      await worker(items[index], slot);
    }
  });

  await Promise.all(runners);
}

const { dryRun, skipWarmup, status, limit, fields } = parseArguments(process.argv.slice(2));
const environment = loadEnvironment();

console.log(`Fields: ${fields.join(", ")} | status: ${status}`);

const rows = await readRows(environment, fields, status, limit);
const { objects, offBucket } = collectObjects(environment, rows, fields, limit);

const offBucketNote = offBucket > 0 ? ` | ${offBucket} field(s) still off-bucket, skipped` : "";

console.log(
  `${TABLE} rows: ${rows.length} | distinct objects in ${BUCKET}: ${objects.length}${offBucketNote}`,
);

const workRoot = await mkdtemp(join(tmpdir(), "remux-faststart-"));
const workDirectories = await Promise.all(
  Array.from({ length: CONCURRENCY }, () => mkdtemp(join(workRoot, "slot-"))),
);
const counters = {
  remuxed: 0,
  "would-remux": 0,
  "already-faststart": 0,
  inconclusive: 0,
  rejected: 0,
  unverified: 0,
  failed: 0,
};
const problems = [];
const remuxedPaths = new Set();
let bytesUploaded = 0;
let processed = 0;

try {
  await runPool(objects, CONCURRENCY, async (object, slot) => {
    try {
      const result = await remuxObject(environment, object, workDirectories[slot], dryRun);
      counters[result.outcome] += 1;
      bytesUploaded += result.bytes ?? 0;

      if (result.outcome === "remuxed") {
        remuxedPaths.add(object.objectPath);
      }

      if (result.reason !== undefined) {
        problems.push({ ...object, outcome: result.outcome, reason: result.reason });
      }
    } catch (error) {
      counters.failed += 1;
      problems.push({ ...object, outcome: "failed", reason: error.message });
    } finally {
      processed += 1;
      if (processed % 25 === 0 || processed === objects.length) {
        console.log(`Processed ${processed}/${objects.length}`);
      }
    }
  });
} finally {
  await rm(workRoot, { recursive: true, force: true });
}

for (const [outcome, count] of Object.entries(counters)) {
  if (count > 0) {
    console.log(`  ${outcome}: ${count}`);
  }
}

if (bytesUploaded > 0) {
  console.log(`Uploaded ${(bytesUploaded / 1024 ** 2).toFixed(1)} MiB`);
}

if (!dryRun && !skipWarmup && objects.length > 0) {
  const deadline = Date.now() + WARMUP_TIMEOUT_MS;
  let stale = 0;

  console.log(`Warming ${objects.length} public URL(s) and waiting for propagation`);

  await runPool(objects, CONCURRENCY, async (object) => {
    try {
      const layout = await warmObject(
        environment,
        object,
        remuxedPaths.has(object.objectPath),
        deadline,
      );

      if (layout !== "faststart") {
        stale += 1;
        problems.push({ ...object, outcome: "stale-edge", reason: `CDN still serves ${layout}` });
      }
    } catch (error) {
      problems.push({ ...object, outcome: "warm-failed", reason: error.message });
    }
  });

  console.log(`  warmed: ${objects.length - stale} | still stale at the edge: ${stale}`);
}

if (problems.length > 0) {
  console.warn(`${problems.length} object(s) left unchanged:`);
  for (const problem of problems) {
    console.warn(
      `  ${problem.objectPath} (${problem.title}) — ${problem.outcome}: ${problem.reason}`,
    );
  }
  process.exitCode = counters.failed > 0 || counters.unverified > 0 ? 1 : 0;
}
