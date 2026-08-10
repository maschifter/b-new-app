import { BouncablePress } from "@/components/bouncable-press";
import type { ContentRef, Spot } from "@bnewapp/studio-core";
import { Image } from "expo-image";
import { StyleSheet, Text, View } from "react-native";
import type { ArtHitBox } from "./art";
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

  // Play badge sized to the frame so it reads on both the big hero and the
  // small preview screens; clamped so it never dominates or vanishes.
  const badgeSize = Math.round(Math.min(Math.min(frame.width, frame.height) * 0.34, 64));

  const body = presentation ? (
    presentation.art ? (
      // Real art: a transparent sprite fit whole (no distortion) inside the
      // frame, no block chrome. `anchor` grounds floor-standing items to the
      // frame's bottom edge (the floor line); wall/ceiling art stays centered.
      <View
        testID={`spot-content-${spot.id}`}
        style={[styles.sprite, selected && styles.selectedSprite]}
      >
        <Image
          source={presentation.art}
          style={StyleSheet.absoluteFill}
          contentFit={presentation.artFit ?? "contain"}
          contentPosition={spot.anchor === "bottom" ? "bottom" : "center"}
          transition={200}
        />
        {presentation.isVideo ? <PlayBadge size={badgeSize} /> : null}
      </View>
    ) : (
      // Fallback for items without art yet: the labelled colored block.
      <View
        testID={`spot-content-${spot.id}`}
        style={[styles.block, { backgroundColor: presentation.color }, selected && styles.selected]}
      >
        <Text numberOfLines={2} style={styles.blockLabel}>
          {presentation.label}
        </Text>
      </View>
    )
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
    // The layer spans the designer's full frame, but only the smaller
    // BouncablePress is interactive. `box-none` lets a tap in the transparent
    // remainder reach a lower item instead of the frame swallowing it.
    <View pointerEvents="box-none" style={[styles.layer, layout]}>
      <View pointerEvents="none" style={styles.visual}>
        {body}
      </View>
      <BouncablePress
        accessibilityRole="button"
        accessibilityLabel={`Spot ${spot.id}`}
        bounce={false}
        onPress={() => onPress(spot.id)}
        style={[
          styles.hitTarget,
          presentation?.artHitBox &&
            hitTargetStyle(frame, presentation.artHitBox, presentation.artFit, spot.anchor),
        ]}
      />
    </View>
  );
}

/**
 * Converts an asset's alpha bounds into the spot's coordinate space. This
 * mirrors expo-image's contain/fill positioning so the image may keep its
 * transparent canvas for visual layout without swallowing neighbouring taps.
 */
function hitTargetStyle(
  frame: PixelFrame,
  hitBox: ArtHitBox,
  fit: "contain" | "cover" | "fill" | undefined,
  anchor: Spot["anchor"],
) {
  const contentFit = fit ?? "contain";
  const sourceRatio = hitBox.size.width / hitBox.size.height;
  const frameRatio = frame.width / frame.height;
  const scale =
    contentFit === "fill"
      ? { x: frame.width / hitBox.size.width, y: frame.height / hitBox.size.height }
      : (() => {
          const uniform =
            (contentFit === "contain" && sourceRatio > frameRatio) ||
            (contentFit === "cover" && sourceRatio < frameRatio)
              ? frame.width / hitBox.size.width
              : frame.height / hitBox.size.height;
          return { x: uniform, y: uniform };
        })();
  const renderedWidth = hitBox.size.width * scale.x;
  const renderedHeight = hitBox.size.height * scale.y;
  const offsetX = (frame.width - renderedWidth) / 2;
  const offsetY =
    anchor === "bottom" ? frame.height - renderedHeight : (frame.height - renderedHeight) / 2;

  return {
    left: offsetX + hitBox.opaqueBounds.x * scale.x,
    top: offsetY + hitBox.opaqueBounds.y * scale.y,
    width: hitBox.opaqueBounds.width * scale.x,
    height: hitBox.opaqueBounds.height * scale.y,
  };
}

// A ▶ badge centered over a video/preview screen so a filled screen reads as a
// playable video at a glance (design reference). Decorative: the whole spot is
// the tap target, so the badge ignores touches.
function PlayBadge({ size }: { size: number }) {
  const tri = Math.round(size * 0.4);
  return (
    <View pointerEvents="none" style={styles.badgeWrap}>
      <View style={[styles.badge, { width: size, height: size, borderRadius: size / 2 }]}>
        <View
          style={[
            styles.triangle,
            {
              borderTopWidth: tri / 2,
              borderBottomWidth: tri / 2,
              borderLeftWidth: tri,
              marginLeft: tri * 0.18, // optical-center the triangle in the circle
            },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { position: "absolute" },
  visual: { ...StyleSheet.absoluteFillObject },
  hitTarget: { ...StyleSheet.absoluteFillObject },
  badgeWrap: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  badge: {
    alignItems: "center",
    backgroundColor: "rgba(20,10,32,0.45)",
    borderColor: "rgba(255,255,255,0.92)",
    borderWidth: 2,
    justifyContent: "center",
  },
  triangle: {
    backgroundColor: "transparent",
    borderBottomColor: "transparent",
    borderLeftColor: "#FFFFFF",
    borderStyle: "solid",
    borderTopColor: "transparent",
    height: 0,
    width: 0,
  },
  // A bare frame for transparent sprite art — no fill, no radius; the sprite's
  // own shape and baked shadow carry the look.
  sprite: { flex: 1 },
  selectedSprite: {
    borderColor: "#A78BFA",
    borderRadius: 10,
    borderStyle: "solid",
    borderWidth: 2,
  },
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
