import { Image, type StyleProp, StyleSheet, View, type ViewStyle } from "react-native";

// Ported from Boogiz: a body-shaped framing guide the dancer lines themselves up
// with before the countdown starts.
const SILHOUETTE_SOURCE = require("../../assets/dance-silhouette.png");

interface DanceSilhouetteProps {
  /** The camera surface's own layout, so the guide follows the PiP swap. */
  style: StyleProp<ViewStyle>;
}

export function DanceSilhouette({ style }: DanceSilhouetteProps) {
  return (
    <View
      testID="dance-silhouette"
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={style}
    >
      <Image source={SILHOUETTE_SOURCE} resizeMode="contain" style={styles.image} />
    </View>
  );
}

const styles = StyleSheet.create({
  image: { width: "100%", height: "100%" },
});
