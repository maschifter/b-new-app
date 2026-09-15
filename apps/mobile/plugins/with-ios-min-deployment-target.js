const fs = require("node:fs");
const path = require("node:path");
const {
  IOSConfig,
  withDangerousMod,
  withPodfileProperties,
  withXcodeProject,
} = require("expo/config-plugins");

// expo-router 55's ExpoRouter pod declares iOS 15.1 but calls UIAction.subtitle
// (iOS 16) without an availability guard, so it cannot compile below 16.0.
const DEPLOYMENT_TARGET = "16.0";

const BEGIN_MARKER = "# @generated begin with-ios-min-deployment-target";
const END_MARKER = "# @generated end with-ios-min-deployment-target";
const POST_INSTALL_ANCHOR = "post_install do |installer|";

const patch = `
    ${BEGIN_MARKER}
    # Xcode 27 rejects simulator deployment targets below iOS 15, and CocoaPods keeps
    # each pod's own (often much older) minimum on its native and resource bundle
    # targets. react_native_post_install only raises pod native targets to the React
    # Native floor, so normalize every target here instead.
    installer.pods_project.targets.each do |pod_target|
      pod_target.build_configurations.each do |build_config|
        if build_config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'].to_f < ${DEPLOYMENT_TARGET}
          build_config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '${DEPLOYMENT_TARGET}'
        end
      end
    end
    ${END_MARKER}
`;

function patchPodfile(contents) {
  const stripped = contents.replace(
    new RegExp(`\\n[ \\t]*${BEGIN_MARKER}[\\s\\S]*?${END_MARKER}\\n`),
    "",
  );
  const anchorIndex = stripped.indexOf(POST_INSTALL_ANCHOR);
  if (anchorIndex === -1) {
    throw new Error(
      "with-ios-min-deployment-target: could not find the Podfile post_install hook to patch",
    );
  }
  const insertAt = anchorIndex + POST_INSTALL_ANCHOR.length;
  return stripped.slice(0, insertAt) + patch + stripped.slice(insertAt);
}

function withAppTarget(config) {
  return withXcodeProject(config, (modConfig) => {
    const { Target, XcodeUtils } = IOSConfig;
    const listIds = Target.getNativeTargets(modConfig.modResults)
      .filter(([, target]) => Target.isTargetOfType(target, Target.TargetType.APPLICATION))
      .map(([, target]) => target.buildConfigurationList);
    for (const listId of listIds) {
      for (const [, configuration] of XcodeUtils.getBuildConfigurationsForListId(
        modConfig.modResults,
        listId,
      )) {
        if (configuration.buildSettings?.IPHONEOS_DEPLOYMENT_TARGET) {
          configuration.buildSettings.IPHONEOS_DEPLOYMENT_TARGET = DEPLOYMENT_TARGET;
        }
      }
    }
    return modConfig;
  });
}

function withPodfilePlatform(config) {
  return withPodfileProperties(config, (modConfig) => {
    modConfig.modResults["ios.deploymentTarget"] = DEPLOYMENT_TARGET;
    return modConfig;
  });
}

function withPodTargets(config) {
  return withDangerousMod(config, [
    "ios",
    (modConfig) => {
      const podfilePath = path.join(modConfig.modRequest.platformProjectRoot, "Podfile");
      fs.writeFileSync(podfilePath, patchPodfile(fs.readFileSync(podfilePath, "utf8")));
      return modConfig;
    },
  ]);
}

module.exports = (config) => withPodTargets(withPodfilePlatform(withAppTarget(config)));

module.exports.patchPodfile = patchPodfile;
module.exports.DEPLOYMENT_TARGET = DEPLOYMENT_TARGET;
