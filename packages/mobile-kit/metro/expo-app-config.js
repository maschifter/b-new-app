const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

/**
 * The Metro config both Expo apps use. It teaches Metro about the workspace: watch
 * the shared packages and the hoisted root `node_modules`, resolve from both the app
 * and the root, and pin the three libraries that break when two copies load.
 *
 * `projectRoot` is the app directory — pass `__dirname`. The workspace root is its
 * grandparent, which holds for any app under `apps/`.
 */
function createExpoAppMetroConfig(projectRoot) {
  const workspaceRoot = path.resolve(projectRoot, "../..");
  const config = getDefaultConfig(projectRoot);

  config.watchFolders = [
    path.join(workspaceRoot, "packages"),
    path.join(workspaceRoot, "node_modules"),
  ];
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

  // Relative to the app: Metro always runs with the app directory as its cwd.
  return withNativeWind(config, { input: "./src/global.css" });
}

module.exports = { createExpoAppMetroConfig };
