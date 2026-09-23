const { COLORS } = require("./theme/colors");

/** @type {import('tailwindcss').Config} */
module.exports = {
  // `packages/*` is in scope because @bnewapp/mobile-kit and @bnewapp/dance-flow
  // ship `className` strings.
  content: ["./src/**/*.{js,jsx,ts,tsx}", "../../packages/*/src/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset"), require("@bnewapp/mobile-kit/theme/tailwind-preset")],
  // Stepz's own direction: the preset's token names with this app's values.
  theme: { extend: { colors: COLORS, fontFamily: { display: ["Slackey-Regular"] } } },
  plugins: [],
};
