// BNewApp's palette, in CommonJS so `tailwind.config.js` and the app read one source.
// Typed for TypeScript consumers by the sibling `colors.d.ts`.
//
// These are token *values* only. The shared token *names* come from the
// @bnewapp/mobile-kit preset, because the `className` strings shipped from the shared
// packages resolve against them — renaming or dropping one breaks them. The studio
// tokens below the line are this app's alone; no package refers to them.
const COLORS = {
  app: "#101014",
  panel: "#17171D",
  "panel-raised": "#1F1F27",
  "panel-muted": "#26262F",
  foreground: "#F8F7FC",
  muted: "#898995",
  copy: "#C7C7D1",
  border: "#4A4856",
  neon: "#A78BFA",
  accent: "#C4B5FD",
  primary: "#8B5CF6",
  danger: "#FF8F8F",

  // Studio only: the room's darker, more saturated surfaces, which sit below the
  // app chrome rather than beside it, and the dim label on an empty spot, which
  // must stay quieter than `muted` so it never competes with a placed item.
  scrim: "#060410",
  sheet: "#160E29",
  veil: "#140A20",
  "spot-hint": "#6C6C7A",
};

module.exports = { COLORS };
