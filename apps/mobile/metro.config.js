const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");
const config = getDefaultConfig(projectRoot);

config.watchFolders = [path.join(workspaceRoot, "packages"), path.join(workspaceRoot, "node_modules")];
config.resolver.nodeModulesPaths = [
  path.join(projectRoot, "node_modules"),
  path.join(workspaceRoot, "node_modules"),
];
config.resolver.disableHierarchicalLookup = true;
config.resolver.extraNodeModules = {
  react: path.join(workspaceRoot, "node_modules/react"),
  "react-dom": path.join(workspaceRoot, "node_modules/react-dom"),
  "react-native": path.join(workspaceRoot, "node_modules/react-native"),
};
module.exports = config;
