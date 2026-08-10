import { useState } from "react";
import { type LayoutChangeEvent, StyleSheet, View } from "react-native";
import { DESIGN_CANVAS, THEME_BACKGROUNDS } from "../data/templates";
import type { ContentRef, RoomTemplate, StudioMode } from "../domain/types";
import { SpotLayer } from "./spot-layer";

interface StudioStageProps {
  template: RoomTemplate;
  map: Record<string, ContentRef>;
  mode: StudioMode;
  selectedSpotId?: string | null;
  onSelectSpot?: (spotId: string) => void;
}

// Letterboxed, uniformly-scaled canvas (design §9.1). The fixed design canvas
// is scaled to fit the measured container; normalized (0..1) spot frames map to
// device pixels; layers draw back-to-front by `spot.layer`. This keeps one
// layout correct across screen sizes without per-device coordinates.
export function StudioStage({
  template,
  map,
  mode,
  selectedSpotId,
  onSelectSpot,
}: StudioStageProps) {
  const [size, setSize] = useState({ width: 0, height: 0 });

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setSize({ width, height });
  };

  const scale = Math.min(size.width / DESIGN_CANVAS.width, size.height / DESIGN_CANVAS.height);
  const stageWidth = DESIGN_CANVAS.width * scale;
  const stageHeight = DESIGN_CANVAS.height * scale;
  const offsetX = (size.width - stageWidth) / 2;
  const offsetY = (size.height - stageHeight) / 2;

  const background = THEME_BACKGROUNDS[template.themeId] ?? "#17171D";
  const showEmpty = mode === "edit";
  const handleSelect = mode === "edit" ? onSelectSpot : undefined;

  // Back-to-front so higher layers overlap lower ones.
  const spots = [...template.spots].sort((a, b) => a.layer - b.layer);

  return (
    <View testID="studio-stage" style={styles.container} onLayout={onLayout}>
      {scale > 0 ? (
        <View
          style={[
            styles.stage,
            {
              left: offsetX,
              top: offsetY,
              width: stageWidth,
              height: stageHeight,
              backgroundColor: background,
            },
          ]}
        >
          {spots.map((spot) => (
            <SpotLayer
              key={spot.id}
              spot={spot}
              frame={{
                left: spot.frame.x * stageWidth,
                top: spot.frame.y * stageHeight,
                width: spot.frame.w * stageWidth,
                height: spot.frame.h * stageHeight,
              }}
              content={map[spot.id]}
              selected={selectedSpotId === spot.id}
              showEmpty={showEmpty}
              onPress={handleSelect}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, overflow: "hidden" },
  stage: { position: "absolute", overflow: "hidden" },
});
