/** @type {import('tailwindcss').Config} */
module.exports = {
  // `packages/*` is in scope because @bnewapp/mobile-kit ships `className` strings.
  content: ["./src/**/*.{js,jsx,ts,tsx}", "../../packages/*/src/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset"), require("@bnewapp/mobile-kit/theme/tailwind-preset")],
  plugins: [],
};
