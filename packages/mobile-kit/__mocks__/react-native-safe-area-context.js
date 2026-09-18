// The package's own mock. `useSafeAreaInsets` throws outside a `SafeAreaProvider`,
// and the media scrim reads it, so a test that renders a primitive on its own needs
// this. `SafeAreaProvider` here honours `initialMetrics`, which is how a test hands a
// component a real device's insets.
module.exports = require("react-native-safe-area-context/jest/mock").default;
