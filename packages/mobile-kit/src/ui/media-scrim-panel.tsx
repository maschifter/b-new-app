import { LinearGradient } from "expo-linear-gradient";
import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * The controls a full-bleed camera or video screen lays over its media, on a fade
 * that keeps them readable against an arbitrary frame without hiding the picture.
 */
interface MediaScrimPanelProps {
  children: ReactNode;
  /** Layout classes for the content block; the scrim sizes itself to it. */
  className: string;
  /** Space between the last control and the system bar the panel sits above. */
  bottomGap?: number | undefined;
  testID?: string | undefined;
}

const SCRIM_COLORS = ["transparent", "rgba(0,0,0,0.7)", "rgba(0,0,0,0.92)"] as const;
const SCRIM_LOCATIONS = [0, 0.45, 1] as const;

export function MediaScrimPanel({
  children,
  className,
  bottomGap = 20,
  testID,
}: MediaScrimPanelProps) {
  const insets = useSafeAreaInsets();
  return (
    <View pointerEvents="box-none" style={styles.panel}>
      <LinearGradient
        pointerEvents="none"
        colors={SCRIM_COLORS}
        locations={SCRIM_LOCATIONS}
        style={StyleSheet.absoluteFill}
      />
      <View
        testID={testID}
        className={className}
        style={{ paddingBottom: insets.bottom + bottomGap }}
      >
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { position: "absolute", left: 0, right: 0, bottom: 0 },
});
