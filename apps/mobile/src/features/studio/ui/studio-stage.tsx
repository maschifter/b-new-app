import { catalogItemByIdAtom } from "@/features/catalog";
import {
  type ContentRef,
  DESIGN_CANVAS,
  type RoomTemplate,
  type StudioMode,
} from "@bnewapp/studio-core";
import { Image } from "expo-image";
import { useAtomValue } from "jotai";
import { useState } from "react";
import { type LayoutChangeEvent, View } from "react-native";
import { THEME_BACKGROUNDS, THEME_BACKGROUND_IMAGES } from "../data/templates";
import { SpotLayer } from "./spot-layer";

interface StudioStageProps {
  template: RoomTemplate;
  map: Record<string, ContentRef>;
  mode: StudioMode;
  selectedSpotId?: string | null | undefined;
  onSelectSpot?: ((spotId: string) => void) | undefined;
}

// Full-bleed, uniformly-scaled canvas (design §9.1). The fixed design canvas is
// scaled to *cover* the measured container so the room reaches every edge with
// no letterbox margins; normalized (0..1) spot frames map to device pixels;
// layers draw back-to-front by `spot.layer`. This keeps one layout correct
// across screen sizes without per-device coordinates.
export function StudioStage({
  template,
  map,
  mode,
  selectedSpotId,
  onSelectSpot,
}: StudioStageProps) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const catalogById = useAtomValue(catalogItemByIdAtom);

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setSize({ width, height });
  };

  // Cover (fill): scale the canvas uniformly so it fills the container on both
  // axes — the larger of the two ratios wins, so there are never letterbox gaps.
  // Any overflow bleeds off an edge instead of leaving margins. On a phone the
  // width ratio dominates, so the width fills exactly and the surplus height
  // bleeds off the bottom; we pin the top (offsetY = 0) so the ceiling is never
  // cropped, and center any horizontal overflow. The template keeps its bottom
  // edge (y > ~0.92) free of critical spots so that region is safe to bleed off.
  const scale = Math.max(size.width / DESIGN_CANVAS.width, size.height / DESIGN_CANVAS.height);
  const stageWidth = DESIGN_CANVAS.width * scale;
  const stageHeight = DESIGN_CANVAS.height * scale;
  const offsetX = (size.width - stageWidth) / 2;
  const offsetY = 0; // pin the top; surplus height (cover) bleeds off the bottom

  const background = THEME_BACKGROUNDS[template.themeId] ?? "#17171D";
  const backgroundImage = THEME_BACKGROUND_IMAGES[template.themeId];
  const showEmpty = mode === "edit";
  const handleSelect = mode === "edit" ? onSelectSpot : undefined;

  // Back-to-front so higher layers overlap lower ones.
  const spots = [...template.spots].sort((a, b) => a.layer - b.layer);

  return (
    <View
      testID="studio-stage"
      className="flex-1 overflow-hidden"
      style={{ backgroundColor: background }}
      onLayout={onLayout}
    >
      {scale > 0 ? (
        <View
          style={[
            {
              position: "absolute",
              overflow: "hidden",
              left: offsetX,
              top: offsetY,
              width: stageWidth,
              height: stageHeight,
              backgroundColor: background,
            },
          ]}
        >
          {backgroundImage ? (
            <Image
              testID="studio-stage-background"
              source={backgroundImage}
              style={{ position: "absolute", inset: 0 }}
              contentFit="cover"
              transition={200}
            />
          ) : null}
          {spots.map((spot) => {
            const content = map[spot.id];
            const item = content?.source === "catalog" ? catalogById.get(content.id) : undefined;
            return (
              <SpotLayer
                key={spot.id}
                spot={spot}
                frame={{
                  left: spot.frame.x * stageWidth,
                  top: spot.frame.y * stageHeight,
                  width: spot.frame.w * stageWidth,
                  height: spot.frame.h * stageHeight,
                }}
                content={content}
                item={item}
                selected={selectedSpotId === spot.id}
                showEmpty={showEmpty}
                onPress={handleSelect}
              />
            );
          })}
        </View>
      ) : null}
    </View>
  );
}
