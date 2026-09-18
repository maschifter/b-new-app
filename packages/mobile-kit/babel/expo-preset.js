// The Babel config every Expo app and React Native package in this repo uses.
// babel-jest resolves a config from the file's own package root, so each of them
// still keeps a `babel.config.js` — but it only re-exports this one.
module.exports = (api) => {
  api.cache(true);
  return {
    presets: [["babel-preset-expo", { jsxImportSource: "nativewind" }]],
  };
};
