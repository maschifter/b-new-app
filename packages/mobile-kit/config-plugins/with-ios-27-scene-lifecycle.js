const { withAppDelegate, withInfoPlist } = require("expo/config-plugins");

const BEGIN_MARKER = "// @generated begin with-ios-27-scene-lifecycle";
const END_MARKER = "// @generated end with-ios-27-scene-lifecycle";

const sceneDelegate = `
${BEGIN_MARKER}
@objc(SceneDelegate)
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene else {
      return
    }

    let appWindow = (UIApplication.shared.delegate as? AppDelegate)?.window
    appWindow?.windowScene = windowScene
    window = appWindow
    appWindow?.makeKeyAndVisible()

    handle(userActivities: connectionOptions.userActivities)
    handle(urlContexts: connectionOptions.urlContexts)
  }

  func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
    handle(urlContexts: URLContexts)
  }

  func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
    handle(userActivities: [userActivity])
  }

  private func handle(urlContexts: Set<UIOpenURLContext>) {
    guard let appDelegate = UIApplication.shared.delegate else {
      return
    }

    for context in urlContexts {
      var options: [UIApplication.OpenURLOptionsKey: Any] = [
        .openInPlace: context.options.openInPlace
      ]

      if let sourceApplication = context.options.sourceApplication {
        options[.sourceApplication] = sourceApplication
      }

      if let annotation = context.options.annotation {
        options[.annotation] = annotation
      }

      _ = appDelegate.application?(UIApplication.shared, open: context.url, options: options)
    }
  }

  private func handle(userActivities: Set<NSUserActivity>) {
    guard let appDelegate = UIApplication.shared.delegate else {
      return
    }

    for userActivity in userActivities {
      _ = appDelegate.application?(
        UIApplication.shared,
        continue: userActivity,
        restorationHandler: { _ in }
      )
    }
  }
}
${END_MARKER}`;

function patchAppDelegate(contents) {
  const markerPattern = new RegExp(
    `\\n?${BEGIN_MARKER.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}[\\s\\S]*?${END_MARKER.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}\\n?`,
  );
  return `${contents.replace(markerPattern, "").trimEnd()}\n${sceneDelegate}\n`;
}

function withSceneManifest(config) {
  return withInfoPlist(config, (modConfig) => {
    modConfig.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: "Default Configuration",
            UISceneDelegateClassName: "SceneDelegate",
          },
        ],
      },
    };
    return modConfig;
  });
}

function withSceneDelegate(config) {
  return withAppDelegate(config, (modConfig) => {
    if (modConfig.modResults.language !== "swift") {
      throw new Error("with-ios-27-scene-lifecycle: expected a Swift AppDelegate");
    }

    modConfig.modResults.contents = patchAppDelegate(modConfig.modResults.contents);
    return modConfig;
  });
}

module.exports = (config) => withSceneDelegate(withSceneManifest(config));
module.exports.patchAppDelegate = patchAppDelegate;
