// The token contract both apps share. An app overrides token *values* in its own
// preset; token *names* live here, because `className` strings shipped from this
// package resolve against them.
const { COLORS } = require("./colors");

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [],
  theme: {
    extend: {
      colors: COLORS,
    },
  },
};
