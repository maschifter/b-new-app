// Stepz's palette, in CommonJS so `tailwind.config.js` and the app read one source.
// Typed for TypeScript consumers by the sibling `colors.d.ts`.
//
// These are token *values* only. The token *names* come from the
// @bnewapp/mobile-kit preset, because the `className` strings shipped from the
// shared packages resolve against them — renaming or dropping one breaks them.
const COLORS = {
  app: "#1C141F",
  panel: "#261B2B",
  "panel-raised": "#332439",
  "panel-muted": "#3F2D47",
  foreground: "#FFFFFF",
  muted: "#9A8CA3",
  copy: "#E8E8E9",
  border: "#4A3B52",
  neon: "#D69EFA",
  primary: "#AE3EF6",
  accent: "#F9CF54",
  danger: "#F94229",
};

const RUNTIME_COLORS = {
  "accent-wash": "rgba(249, 207, 84, 0.2)",
  "primary-wash": "rgba(214, 158, 250, 0.12)",
  "score-track-scanning": "rgba(255, 255, 255, 0.2)",
  "score-track-scored": "rgba(255, 255, 255, 0.4)",
  celebrate: "#47226C",
  "celebrate-fade": "rgba(71, 34, 108, 0)",
  "approved-ribbon-highlight": "rgba(255, 255, 255, 0.25)",
  "approved-ribbon-copy": "#7A5B12",
};

module.exports = { COLORS, RUNTIME_COLORS };
