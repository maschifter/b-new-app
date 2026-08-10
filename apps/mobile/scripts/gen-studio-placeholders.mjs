// Regenerates the studio's placeholder art tiles.
//
// These PNGs stand in for real artwork until a designer drops final assets into
// `assets/studio/`. Each tile is a deterministic duotone diagonal gradient keyed
// by the item's `type` (so the same colour family as the old block) with a small
// per-id lightness shift so sibling items still read as distinct images once
// rendered through expo-image (see ../src/features/studio/ui/art.ts).
//
// This is a dev-time tool, not shipped code. Run it from the mobile package:
//   node scripts/gen-studio-placeholders.mjs
// To swap in real art, replace the generated files (keep the `<id>.png` names).

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, "..", "assets", "studio");
const SIZE = 96;

// Mirrors TYPE_COLORS in ../src/features/studio/ui/placeholder.ts. Kept in sync
// by hand — this generator is only run when the tile set changes.
const TYPE_COLORS = {
  floor: "#6D5D4B",
  wall: "#3E6D8E",
  video: "#7A3E8E",
  ceiling: "#C9A227",
  decor: "#3E8E5A",
};

// Mirrors CATALOG in ../src/features/studio/data/catalog.ts (id -> type).
const ITEMS = [
  ["rug", "floor"],
  ["stage", "floor"],
  ["dance-mat", "floor"],
  ["poster", "wall"],
  ["mirror", "wall"],
  ["big-screen", "video"],
  ["led-wall", "video"],
  ["spotlight", "ceiling"],
  ["disco-ball", "ceiling"],
  ["neon-ring", "ceiling"],
  ["plant", "decor"],
  ["trophy", "decor"],
  ["speaker", "decor"],
  ["boombox", "decor"],
];

function hexToRgb(hex) {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));

function shade(rgb, factor) {
  return rgb.map((c) => clamp(c * factor));
}

// Stable small integer from an id so sibling items differ deterministically.
function idHash(id) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) & 0xffff;
  return h;
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (const byte of buf) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePng(pixels, size) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour RGB
  // 10..12 already 0: compression / filter / interlace
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    const rowStart = y * (size * 3 + 1);
    raw[rowStart] = 0; // filter type: none
    for (let x = 0; x < size; x++) {
      const src = (y * size + x) * 3;
      const dst = rowStart + 1 + x * 3;
      raw[dst] = pixels[src];
      raw[dst + 1] = pixels[src + 1];
      raw[dst + 2] = pixels[src + 2];
    }
  }
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function tile(id, type) {
  const base = hexToRgb(TYPE_COLORS[type] ?? "#4A4856");
  const lift = ((idHash(id) % 24) - 8) / 100; // -0.08..+0.15 per-id lightness shift
  const light = shade(base, 1.28 + lift);
  const dark = shade(base, 0.62 + lift);
  const pixels = new Uint8Array(SIZE * SIZE * 3);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const t = (x + y) / (2 * (SIZE - 1)); // diagonal 0..1
      const i = (y * SIZE + x) * 3;
      for (let c = 0; c < 3; c++) pixels[i + c] = clamp(light[c] + (dark[c] - light[c]) * t);
    }
  }
  return encodePng(pixels, SIZE);
}

mkdirSync(OUT_DIR, { recursive: true });
for (const [id, type] of ITEMS) {
  writeFileSync(join(OUT_DIR, `${id}.png`), tile(id, type));
}
console.log(`Wrote ${ITEMS.length} tiles to ${OUT_DIR}`);
