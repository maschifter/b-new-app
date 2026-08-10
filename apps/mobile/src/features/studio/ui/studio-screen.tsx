import { BouncablePress } from "@/components/bouncable-press";
import { StyleSheet, Text, View } from "react-native";
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
}

export function StudioScreen({ ownerId, avatarLabel, onOpenProfile }: StudioScreenProps) {
  return (
    <StudioProvider ownerId={ownerId}>
      <StudioContent avatarLabel={avatarLabel} onOpenProfile={onOpenProfile} />
    </StudioProvider>
  );
}

function StudioContent({
  avatarLabel,
  onOpenProfile,
}: {
  avatarLabel?: string;
  onOpenProfile?: () => void;
}) {
  const { state, template, selectSpot } = useStudio();

  return (
    // The stage is inset below the status bar (top edge) so no spot hides behind
    // the notch; the container shares the room background so that inset reads as
    // the room, not a gap. The floating overlay carries its own insets too.
    <View style={styles.container}>
      <SafeAreaView edges={["top", "left", "right"]} style={styles.stageArea}>
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
        style={styles.overlay}
      >
        {onOpenProfile ? (
          <BouncablePress
            accessibilityRole="button"
            accessibilityLabel="Open profile"
            onPress={onOpenProfile}
            style={styles.avatar}
          >
            <Text style={styles.avatarLabel}>{avatarLabel ?? "?"}</Text>
          </BouncablePress>
        ) : (
          <View />
        )}
      </SafeAreaView>

      <ItemPicker />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#17171D" },
  stageArea: { flex: 1 },
  overlay: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    left: 0,
    paddingHorizontal: 16,
    paddingTop: 8,
    position: "absolute",
    right: 0,
    top: 0,
  },
  avatar: {
    alignItems: "center",
    backgroundColor: "#8B5CF6",
    borderRadius: 22,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  avatarLabel: { color: "#F8F7FC", fontSize: 18, fontWeight: "800" },
});
