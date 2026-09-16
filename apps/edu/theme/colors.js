// Stepz's palette, in CommonJS so `tailwind.config.js` and the app read one source.
// Typed for TypeScript consumers by the sibling `colors.d.ts`.
//
// These are token *values* only. The token *names* come from the
// @bnewapp/mobile-kit preset, because the `className` strings shipped from the
// shared packages resolve against them — renaming or dropping one breaks them.
const COLORS = {
  app: "#0B0B10",
  panel: "#141420",
  "panel-raised": "#1D1D2E",
  "panel-muted": "#26263C",
  foreground: "#FFFFFF",
  muted: "#8A8AA3",
  copy: "#D3D3E4",
  border: "#33334D",
  neon: "#FF4D9D",
  primary: "#FF2E88",
  danger: "#FF6B6B",
};

module.exports = { COLORS };
