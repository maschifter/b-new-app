import { BouncablePress } from "@/components/bouncable-press";
import { Image } from "expo-image";
import { StyleSheet, Text, View } from "react-native";
import type { ContentRef, Spot } from "../domain/types";
import { describeContent, itemLabel } from "./placeholder";

export interface PixelFrame {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface SpotLayerProps {
  spot: Spot;
  frame: PixelFrame;
  content: ContentRef | undefined;
  selected: boolean;
  /** Render empty spots as a tappable outline (edit mode); hidden otherwise. */
  showEmpty: boolean;
  onPress?: (spotId: string) => void;
}

export function SpotLayer({ spot, frame, content, selected, showEmpty, onPress }: SpotLayerProps) {
  const presentation = content ? describeContent(content) : null;

  if (!presentation && !showEmpty) return null;

  const layout = {
    left: frame.left,
    top: frame.top,
    width: frame.width,
    height: frame.height,
    zIndex: spot.layer,
  };

  const body = presentation ? (
    <View
      testID={`spot-content-${spot.id}`}
      style={[styles.block, { backgroundColor: presentation.color }, selected && styles.selected]}
    >
      {presentation.art ? (
        <Image
          source={presentation.art}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={200}
        />
      ) : null}
      <Text
        numberOfLines={2}
        style={[styles.blockLabel, presentation.art && styles.blockLabelOnArt]}
      >
        {presentation.label}
      </Text>
    </View>
  ) : (
    <View testID={`spot-empty-${spot.id}`} style={[styles.empty, selected && styles.selected]}>
      <Text style={styles.emptyPlus}>+</Text>
      <Text numberOfLines={1} style={styles.emptyLabel}>
        {itemLabel(spot.id)}
      </Text>
    </View>
  );

  if (!onPress) {
    return <View style={[styles.layer, layout]}>{body}</View>;
  }

  return (
    <BouncablePress
      accessibilityRole="button"
      accessibilityLabel={`Spot ${spot.id}`}
      onPress={() => onPress(spot.id)}
      style={[styles.layer, layout]}
    >
      {body}
    </BouncablePress>
  );
}

const styles = StyleSheet.create({
  layer: { position: "absolute" },
  block: {
    alignItems: "center",
    borderRadius: 10,
    flex: 1,
    justifyContent: "center",
    overflow: "hidden",
    padding: 6,
  },
  blockLabel: {
    color: "#F8F7FC",
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
  },
  // Keep the label legible when it sits over the art rather than a flat block.
  blockLabelOnArt: {
    textShadowColor: "rgba(0,0,0,0.75)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  empty: {
    alignItems: "center",
    borderColor: "#4A4856",
    borderRadius: 10,
    borderStyle: "dashed",
    borderWidth: 1.5,
    flex: 1,
    justifyContent: "center",
    padding: 4,
  },
  emptyPlus: { color: "#6C6C7A", fontSize: 20, fontWeight: "700" },
  emptyLabel: { color: "#6C6C7A", fontSize: 10, textAlign: "center" },
  selected: { borderColor: "#A78BFA", borderWidth: 2, borderStyle: "solid" },
});
