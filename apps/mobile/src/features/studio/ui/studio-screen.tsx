import { BouncablePress } from "@bnewapp/mobile-kit/ui";
import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StudioProvider, useStudio } from "../state/studio-provider";
import { ItemPicker } from "./item-picker";
import { StudioStage } from "./studio-stage";

interface StudioScreenProps {
  ownerId?: string | undefined;
  visitorCount?: number | undefined;
  /** Single letter shown inside the floating avatar (e.g. the account initial). */
  avatarLabel?: string | undefined;
  /** Opens the profile screen; wired by the app so the feature stays route-agnostic. */
  onOpenProfile?: (() => void) | undefined;
  onOpenShop?: (() => void) | undefined;
  onOpenDance?: (() => void) | undefined;
}

export function StudioScreen({
  ownerId,
  visitorCount,
  avatarLabel,
  onOpenProfile,
  onOpenShop,
  onOpenDance,
}: StudioScreenProps) {
  return (
    <StudioProvider ownerId={ownerId}>
      <StudioContent
        avatarLabel={avatarLabel}
        visitorCount={visitorCount}
        onOpenProfile={onOpenProfile}
        onOpenShop={onOpenShop}
        onOpenDance={onOpenDance}
      />
    </StudioProvider>
  );
}

function StudioContent({
  avatarLabel,
  visitorCount,
  onOpenProfile,
  onOpenShop,
  onOpenDance,
}: {
  avatarLabel?: string | undefined;
  visitorCount?: number | undefined;
  onOpenProfile?: (() => void) | undefined;
  onOpenShop?: (() => void) | undefined;
  onOpenDance?: (() => void) | undefined;
}) {
  const { state, template, selectSpot } = useStudio();

  return (
    // The stage is full-bleed to the top: the painted room (ceiling + walls)
    // runs under the status bar so there's no dark band cropping the ceiling.
    // No spot is jammed against the notch because the ceiling frame is nudged
    // down (see templates). The floating overlay keeps its own top inset so the
    // avatar clears the status bar.
    <View className="flex-1 bg-panel">
      <SafeAreaView edges={["left", "right"]} className="flex-1">
        <StudioStage
          template={template}
          map={state.map}
          mode={state.mode}
          selectedSpotId={state.selectedSpotId}
          onSelectSpot={selectSpot}
        />
      </SafeAreaView>

      <SafeAreaView
        edges={["top", "left", "right"]}
        pointerEvents="box-none"
        className="absolute inset-x-0 top-0 flex-row items-center justify-between px-4 pt-2"
      >
        {onOpenProfile ? (
          <BouncablePress
            accessibilityRole="button"
            accessibilityLabel="Open profile"
            onPress={onOpenProfile}
            className="size-11 items-center justify-center rounded-full bg-primary"
          >
            <Text className="text-lg font-extrabold text-foreground">{avatarLabel ?? "?"}</Text>
          </BouncablePress>
        ) : (
          <View />
        )}
        <View className="flex-row items-center gap-2">
          {onOpenDance ? (
            <BouncablePress
              accessibilityRole="button"
              accessibilityLabel="Learn a dance"
              onPress={onOpenDance}
              className="rounded-[18px] bg-primary px-[14px] py-2"
            >
              <Text className="text-[15px] font-bold text-foreground">Dance</Text>
            </BouncablePress>
          ) : null}
          {visitorCount !== undefined ? (
            <View
              accessible
              accessibilityLabel={`${visitorCount} room visitors`}
              className="rounded-[18px] bg-panel/70 px-[14px] py-2"
            >
              <Text className="text-[15px] font-bold text-foreground">
                Visitors: {visitorCount}
              </Text>
            </View>
          ) : null}
        </View>
      </SafeAreaView>

      <ItemPicker onOpenShop={onOpenShop} />
    </View>
  );
}
