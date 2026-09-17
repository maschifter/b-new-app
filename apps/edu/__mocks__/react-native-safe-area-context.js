// The package's own mock. `useSafeAreaInsets` throws outside a `SafeAreaProvider`,
// and the feed's overlay reads it, so a test that mounts a screen on its own needs
// this. `SafeAreaProvider` here honours `initialMetrics`, which is how a test hands
// a screen a real device's insets.
module.exports = require("react-native-safe-area-context/jest/mock").default;
