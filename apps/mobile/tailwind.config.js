/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        app: "#101014",
        panel: "#17171D",
        "panel-raised": "#1F1F27",
        "panel-muted": "#26262F",
        foreground: "#F8F7FC",
        muted: "#898995",
        copy: "#C7C7D1",
        border: "#4A4856",
        neon: "#A78BFA",
        primary: "#8B5CF6",
        danger: "#FF8F8F",
      },
    },
  },
  plugins: [],
};
