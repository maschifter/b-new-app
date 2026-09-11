import { execFileSync } from "node:child_process";
import { constants, accessSync } from "node:fs";
import { join } from "node:path";

const BACKUP_DIRECTORY =
  "/Users/kb/Documents/works/magnus/boogiz-resource/backup/2026-06-17/boogiz-backup/boogiz";
const ENV_FILE = new URL("../apps/server/.env", import.meta.url);
const WRITE_BATCH_SIZE = 500;
const READ_BATCH_SIZE = 1_000;

function parseArguments(arguments_) {
  const supportedArguments = new Set(["--dry-run"]);
  const unknownArguments = arguments_.filter((argument) => !supportedArguments.has(argument));

  if (unknownArguments.length > 0) {
    throw new Error(`Unknown argument(s): ${unknownArguments.join(", ")}`);
  }

  return { dryRun: arguments_.includes("--dry-run") };
}

function unwrapExtendedJson(value) {
  if (Array.isArray(value)) {
    return value.map(unwrapExtendedJson);
  }

  if (value === null || typeof value !== "object") {
    return value;
  }

  if ("$oid" in value) {
    return value.$oid;
  }

  if ("$date" in value) {
    const milliseconds =
      typeof value.$date === "object" && value.$date !== null && "$numberLong" in value.$date
        ? Number(value.$date.$numberLong)
        : value.$date;
    const date = new Date(milliseconds);

    if (Number.isNaN(date.getTime())) {
      throw new Error(`Invalid MongoDB date: ${JSON.stringify(value.$date)}`);
    }

    return date.toISOString();
  }

  for (const numberType of ["$numberInt", "$numberLong", "$numberDouble", "$numberDecimal"]) {
    if (numberType in value) {
      return Number(value[numberType]);
    }
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, nestedValue]) => [key, unwrapExtendedJson(nestedValue)]),
  );
}

function loadBsonCollection(collectionName) {
  const bsonPath = join(BACKUP_DIRECTORY, `${collectionName}.bson`);
  accessSync(bsonPath, constants.R_OK);

  const output = execFileSync("bsondump", ["--quiet", bsonPath], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });

  return output
    .split("\n")
    .filter(Boolean)
    .map((line, index) => {
      try {
        return unwrapExtendedJson(JSON.parse(line));
      } catch (error) {
        throw new Error(`Could not parse ${collectionName} document ${index + 1}`, {
          cause: error,
        });
      }
    });
}

function nullableString(value) {
  if (typeof value !== "string") {
    return null;
  }

  const normalizedValue = value.trim();
  return normalizedValue === "" ? null : normalizedValue;
}

function requiredString(value, fieldName, legacyId) {
  const normalizedValue = nullableString(value);

  if (normalizedValue === null) {
    throw new Error(`Missing ${fieldName} on legacy document ${legacyId}`);
  }

  return normalizedValue;
}

function integerOrDefault(value, defaultValue) {
  return Number.isInteger(value) ? value : defaultValue;
}

function positiveIntegerOrNull(value) {
  return Number.isInteger(value) && value > 0 ? value : null;
}

function nonNegativeIntegerOrNull(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.round(value)
    : null;
}

function requiredTimestamp(value, fieldName, legacyId) {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw new Error(`Missing or invalid ${fieldName} on legacy document ${legacyId}`);
  }

  return value;
}

function preferredUrl(preferredValue, fallbackValue) {
  return nullableString(preferredValue) ?? nullableString(fallbackValue);
}

function mapGenre(document) {
  const legacyId = requiredString(document._id, "_id", "unknown");

  return {
    legacy_id: legacyId,
    name: requiredString(document.name, "name", legacyId),
    status: document.active === true ? "published" : "draft",
    sort_order: integerOrDefault(document.weight, 0),
    created_at: requiredTimestamp(document.createdAt, "createdAt", legacyId),
    updated_at: requiredTimestamp(document.updatedAt, "updatedAt", legacyId),
  };
}

function mapMusic(document) {
  const legacyId = requiredString(document._id, "_id", "unknown");

  return {
    legacy_id: legacyId,
    title: requiredString(document.title, "title", legacyId),
    artist: nullableString(document.artist),
    audio_url: requiredString(document.musicLink, "musicLink", legacyId),
    delay_before_avatar_dance: nonNegativeIntegerOrNull(document.delayBeforeAvatarDance),
    thumbnail_url: nullableString(document.thumbnail),
    status: document.active === true ? "published" : "draft",
    created_at: requiredTimestamp(document.createdAt, "createdAt", legacyId),
    updated_at: requiredTimestamp(document.updatedAt, "updatedAt", legacyId),
  };
}

function mapMove(document) {
  const legacyId = requiredString(document._id, "_id", "unknown");
  const level = positiveIntegerOrNull(document.level) ?? 1;

  return {
    legacy_id: legacyId,
    title: requiredString(document.name, "name", legacyId),
    description: nullableString(document.description),
    level,
    bpm: positiveIntegerOrNull(document.bpm),
    thumbnail_url: nullableString(document.thumbnail),
    main_video_url: preferredUrl(document.learningResizedLink, document.learningLink),
    pro_dancer_video_url: preferredUrl(document.realPersonResizedLink, document.realPersonLink),
    pro_dancer_image_url: nullableString(document.realPersonImage),
    dancer_tip_video_url: preferredUrl(document.dancerTipResizedLink, document.dancerTipLink),
    dancer_tip_image_url: nullableString(document.dancerTipImage),
    presentation_video_url: preferredUrl(
      document.presentationResizedLink,
      document.presentationLink,
    ),
    film_yourself_video_url: preferredUrl(
      document.filmYourSelfResizedLink,
      document.filmYourSelfLink,
    ),
    status: document.active === true ? "published" : "draft",
    sort_order: integerOrDefault(document.priority, 0),
    created_at: requiredTimestamp(document.createdAt, "createdAt", legacyId),
    updated_at: requiredTimestamp(document.updatedAt, "updatedAt", legacyId),
  };
}

// Prefer the learning-video track (tempo-matched), international over the
// Denmark-only licensing variant, and skip candidates deleted from `musics`.
function resolveMusicLegacyId(document, knownMusicIds) {
  const candidates = [
    document.internationalLearningVideoMusicId,
    document.learningVideoMusicId,
    document.musicId,
  ];

  return (
    candidates.find((candidate) => typeof candidate === "string" && knownMusicIds.has(candidate)) ??
    null
  );
}

function batch(values, batchSize) {
  const batches = [];

  for (let index = 0; index < values.length; index += batchSize) {
    batches.push(values.slice(index, index + batchSize));
  }

  return batches;
}

function prepareImport() {
  const genreDocuments = loadBsonCollection("dancegenres");
  const musicDocuments = loadBsonCollection("musics");
  const moveDocuments = loadBsonCollection("dancemoves");
  const genres = genreDocuments.map(mapGenre);
  const musics = musicDocuments.map(mapMusic);
  const moves = moveDocuments.map(mapMove);
  const knownGenreIds = new Set(genres.map((genre) => genre.legacy_id));
  const knownMusicIds = new Set(musics.map((music) => music.legacy_id));
  const musicLegacyIdByMove = new Map();
  const validLinks = new Set();
  const orphanGenreIds = new Set();
  let orphanLinkCount = 0;
  let movesWithoutGenres = 0;
  let publishedMovesWithoutGenres = 0;
  let movesWithoutMusic = 0;
  let publishedMovesWithoutMusic = 0;

  for (const [index, document] of moveDocuments.entries()) {
    const move = moves[index];
    let survivingGenreCount = 0;

    const musicLegacyId = resolveMusicLegacyId(document, knownMusicIds);
    if (musicLegacyId) {
      musicLegacyIdByMove.set(move.legacy_id, musicLegacyId);
    } else {
      movesWithoutMusic += 1;
      if (move.status === "published") {
        publishedMovesWithoutMusic += 1;
      }
    }

    for (const genreId of Array.isArray(document.danceGenre) ? document.danceGenre : []) {
      if (typeof genreId !== "string" || !knownGenreIds.has(genreId)) {
        orphanLinkCount += 1;
        orphanGenreIds.add(String(genreId));
        continue;
      }

      survivingGenreCount += 1;
      validLinks.add(`${move.legacy_id}:${genreId}`);
    }

    if (survivingGenreCount === 0) {
      movesWithoutGenres += 1;
      if (move.status === "published") {
        publishedMovesWithoutGenres += 1;
      }
    }
  }

  const links = [...validLinks].map((link) => {
    const separatorIndex = link.indexOf(":");
    return {
      moveLegacyId: link.slice(0, separatorIndex),
      genreLegacyId: link.slice(separatorIndex + 1),
    };
  });

  return {
    genres,
    musics,
    moves,
    musicLegacyIdByMove,
    links,
    orphanLinkCount,
    orphanGenreIds,
    movesWithoutGenres,
    publishedMovesWithoutGenres,
    movesWithoutMusic,
    publishedMovesWithoutMusic,
  };
}

function createPostgrestClient() {
  process.loadEnvFile(ENV_FILE);

  const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl || !secretKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SECRET_KEY are required in apps/server/.env");
  }

  const headers = {
    apikey: secretKey,
    Authorization: `Bearer ${secretKey}`,
  };

  async function request(path, options = {}) {
    const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
      ...options,
      headers: { ...headers, ...options.headers },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`${options.method ?? "GET"} ${path} failed (${response.status}): ${body}`);
    }

    return response;
  }

  return { request };
}

async function upsertRows(client, table, conflictColumns, rows) {
  for (const rowsBatch of batch(rows, WRITE_BATCH_SIZE)) {
    await client.request(`${table}?on_conflict=${conflictColumns}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(rowsBatch),
    });
  }
}

async function selectLegacyIdMap(client, table) {
  const idMap = new Map();
  let offset = 0;

  for (;;) {
    const response = await client.request(
      `${table}?select=id,legacy_id&legacy_id=not.is.null&order=legacy_id.asc` +
        `&limit=${READ_BATCH_SIZE}&offset=${offset}`,
    );
    const rows = await response.json();

    if (rows.length === 0) {
      return idMap;
    }

    for (const row of rows) {
      idMap.set(row.legacy_id, row.id);
    }

    offset += rows.length;
  }
}

async function writeImport(preparedImport) {
  const client = createPostgrestClient();

  await upsertRows(client, "dance_genres", "legacy_id", preparedImport.genres);
  await upsertRows(client, "music_tracks", "legacy_id", preparedImport.musics);

  const musicIds = await selectLegacyIdMap(client, "music_tracks");
  const moveRows = preparedImport.moves.map((move) => {
    const musicLegacyId = preparedImport.musicLegacyIdByMove.get(move.legacy_id) ?? null;
    const musicId = musicLegacyId === null ? null : musicIds.get(musicLegacyId);

    if (musicLegacyId !== null && !musicId) {
      throw new Error(`Could not resolve imported music ${musicLegacyId} for ${move.legacy_id}`);
    }

    return { ...move, music_id: musicId ?? null };
  });

  await upsertRows(client, "dance_moves", "legacy_id", moveRows);

  const [genreIds, moveIds] = await Promise.all([
    selectLegacyIdMap(client, "dance_genres"),
    selectLegacyIdMap(client, "dance_moves"),
  ]);

  const joinRows = preparedImport.links.map(({ moveLegacyId, genreLegacyId }) => {
    const danceMoveId = moveIds.get(moveLegacyId);
    const genreId = genreIds.get(genreLegacyId);

    if (!danceMoveId || !genreId) {
      throw new Error(`Could not resolve imported link ${moveLegacyId} -> ${genreLegacyId}`);
    }

    return { dance_move_id: danceMoveId, genre_id: genreId };
  });

  await upsertRows(client, "dance_move_genres", "dance_move_id,genre_id", joinRows);
}

function printSummary(preparedImport, dryRun) {
  const mode = dryRun ? "Dry run" : "Import complete";
  console.log(`${mode}: ${preparedImport.genres.length} genres`);
  console.log(`${mode}: ${preparedImport.musics.length} music tracks`);
  console.log(`${mode}: ${preparedImport.moves.length} moves`);
  console.log(`${mode}: ${preparedImport.musicLegacyIdByMove.size} moves resolved to a music`);
  console.log(`${mode}: ${preparedImport.links.length} valid genre links`);
  console.warn(
    `Skipped ${preparedImport.orphanLinkCount} orphan genre links referencing ` +
      `${preparedImport.orphanGenreIds.size} missing genres`,
  );
  console.warn(
    `${preparedImport.movesWithoutGenres} moves have no surviving genres ` +
      `(${preparedImport.publishedMovesWithoutGenres} published)`,
  );
  console.warn(
    `${preparedImport.movesWithoutMusic} moves have no resolvable music ` +
      `(${preparedImport.publishedMovesWithoutMusic} published)`,
  );
}

const { dryRun } = parseArguments(process.argv.slice(2));
const preparedImport = prepareImport();

if (!dryRun) {
  await writeImport(preparedImport);
}

printSummary(preparedImport, dryRun);
