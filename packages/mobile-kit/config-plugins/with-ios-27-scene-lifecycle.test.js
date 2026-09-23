const { patchAppDelegate } = require("./with-ios-27-scene-lifecycle");

it("adds one UIScene delegate and replaces its generated block", () => {
  const appDelegate = "@main\nclass AppDelegate: ExpoAppDelegate {}\n";

  const once = patchAppDelegate(appDelegate);
  const twice = patchAppDelegate(once);

  expect(twice).toBe(once);
  expect(once).toContain("class SceneDelegate: UIResponder, UIWindowSceneDelegate");
  expect(once).toContain("appWindow?.windowScene = windowScene");
  expect(once).toContain("openURLContexts");
  expect(once).toContain("continue userActivity");
});
