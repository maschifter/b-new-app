// The package's own mock. `useSafeAreaInsets` throws outside a `SafeAreaProvider`,
// and the record screen's overlays read it, so a test that mounts the screen on its
// own needs this. `SafeAreaProvider` here honours `initialMetrics`, which is how a
// test hands the screen a real device's insets.
module.exports = require("react-native-safe-area-context/jest/mock").default;
