// The token *names* both apps share, with a deliberately neutral default value for
// each. In CommonJS so `tailwind-preset.js` can require it; typed for TypeScript
// consumers by the sibling `colors.d.ts`.
//
// This package owns no brand. Every app overrides all of these in its own
// `theme/colors.js`, and these greys are only what an app that forgot to would get.
// The names are the contract: the `className` strings shipped from this package and
// from @bnewapp/dance-flow resolve against them, so renaming or dropping one breaks
// both apps.
const COLORS = {
  app: "#101013",
  panel: "#18181B",
  "panel-raised": "#212125",
  "panel-muted": "#2A2A2F",
  foreground: "#FAFAFA",
  muted: "#8A8A94",
  copy: "#C9C9D0",
  border: "#45454F",
  neon: "#A1A1AA",
  primary: "#71717A",
  danger: "#FF8F8F",
};

module.exports = { COLORS };
