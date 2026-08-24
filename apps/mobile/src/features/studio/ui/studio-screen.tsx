import { BouncablePress } from "@/components/bouncable-press";
import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StudioProvider, useStudio } from "../state/studio-provider";
import { ItemPicker } from "./item-picker";
import { StudioStage } from "./studio-stage";

interface StudioScreenProps {
  ownerId?: string;
  /** Single letter shown inside the floating avatar (e.g. the account initial). */
  avatarLabel?: string;
  /** Opens the profile screen; wired by the app so the feature stays route-agnostic. */
  onOpenProfile?: () => void;
  onOpenShop?: () => void;
}

export function StudioScreen({
  ownerId,
  avatarLabel,
  onOpenProfile,
  onOpenShop,
}: StudioScreenProps) {
  return (
    <StudioProvider ownerId={ownerId}>
      <StudioContent
        avatarLabel={avatarLabel}
        onOpenProfile={onOpenProfile}
        onOpenShop={onOpenShop}
      />
    </StudioProvider>
  );
}

function StudioContent({
  avatarLabel,
  onOpenProfile,
  onOpenShop,
}: {
  avatarLabel?: string;
  onOpenProfile?: () => void;
  onOpenShop?: () => void;
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
      </SafeAreaView>

      <ItemPicker onOpenShop={onOpenShop} />
    </View>
  );
}
