import { LinearGradient } from "expo-linear-gradient";
import type { ReactNode } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
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
  /** Lets an oversized decision panel scroll without changing the default overlay layout. */
  scrollable?: boolean | undefined;
  testID?: string | undefined;
}

const SCRIM_COLORS = ["transparent", "rgba(0,0,0,0.7)", "rgba(0,0,0,0.92)"] as const;
const SCRIM_LOCATIONS = [0, 0.45, 1] as const;

export function MediaScrimPanel({
  children,
  className,
  bottomGap = 20,
  scrollable = false,
  testID,
}: MediaScrimPanelProps) {
  const insets = useSafeAreaInsets();
  const content = (
    <View
      testID={testID}
      className={className}
      style={{ paddingBottom: insets.bottom + bottomGap }}
    >
      {children}
    </View>
  );

  return (
    <View pointerEvents="box-none" style={[styles.panel, scrollable && styles.scrollablePanel]}>
      <LinearGradient
        pointerEvents="none"
        colors={SCRIM_COLORS}
        locations={SCRIM_LOCATIONS}
        style={StyleSheet.absoluteFill}
      />
      {scrollable ? (
        <ScrollView contentContainerStyle={styles.scrollContent}>{content}</ScrollView>
      ) : (
        content
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { position: "absolute", left: 0, right: 0, bottom: 0 },
  scrollablePanel: { top: 0 },
  scrollContent: { flexGrow: 1, justifyContent: "flex-end" },
});
