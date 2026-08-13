import { BouncablePress } from "@/components/bouncable-press";
import type { ContentRef, Spot } from "@bnewapp/studio-core";
import { Image } from "expo-image";
import { Text, View } from "react-native";
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
        className={`flex-1 ${selected ? "rounded-[10px] border-2 border-neon" : ""}`}
      >
        <Image
          source={presentation.art}
          style={{ position: "absolute", inset: 0 }}
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
        className={`flex-1 items-center justify-center overflow-hidden rounded-[10px] p-[6px] ${selected ? "border-2 border-neon" : ""}`}
        style={{ backgroundColor: presentation.color }}
      >
        <Text numberOfLines={2} className="text-center text-[13px] font-bold text-foreground">
          {presentation.label}
        </Text>
      </View>
    )
  ) : (
    <View
      testID={`spot-empty-${spot.id}`}
      className={`flex-1 items-center justify-center rounded-[10px] border-[1.5px] border-dashed p-1 ${selected ? "border-2 border-solid border-neon" : "border-[#4A4856]"}`}
    >
      <Text className="text-xl font-bold text-[#6C6C7A]">+</Text>
      <Text numberOfLines={1} className="text-center text-[10px] text-[#6C6C7A]">
        {itemLabel(spot.id)}
      </Text>
    </View>
  );

  if (!onPress) {
    return (
      <View className="absolute" style={layout}>
        {body}
      </View>
    );
  }

  return (
    // The layer spans the designer's full frame, but only the smaller
    // BouncablePress is interactive. `box-none` lets a tap in the transparent
    // remainder reach a lower item instead of the frame swallowing it.
    <View pointerEvents="box-none" className="absolute" style={layout}>
      <View pointerEvents="none" className="absolute inset-0">
        {body}
      </View>
      <BouncablePress
        accessibilityRole="button"
        accessibilityLabel={`Spot ${spot.id}`}
        bounce={false}
        onPress={() => onPress(spot.id)}
        className="absolute inset-0"
        style={
          presentation?.artHitBox
            ? hitTargetStyle(frame, presentation.artHitBox, presentation.artFit, spot.anchor)
            : undefined
        }
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
    <View pointerEvents="none" className="absolute inset-0 items-center justify-center">
      <View
        className="items-center justify-center border-2 border-white/90 bg-[#140A20]/45"
        style={{ width: size, height: size, borderRadius: size / 2 }}
      >
        <View
          className="size-0 border-solid border-y-transparent border-l-white bg-transparent"
          style={{
            borderTopWidth: tri / 2,
            borderBottomWidth: tri / 2,
            borderLeftWidth: tri,
            marginLeft: tri * 0.18,
          }}
        />
      </View>
    </View>
  );
}
