import { PlaceholderScreen } from "@/components/placeholder-screen";

interface ProfileMoveScreenProps {
  moveId: string;
  onBack: () => void;
}

export function ProfileMoveScreen({ moveId, onBack }: ProfileMoveScreenProps) {
  return (
    <PlaceholderScreen
      title="Saved move"
      body={`Scores and recordings kept on this device for move ${moveId}.`}
      action={{ label: "Back to profile", onPress: onBack }}
    />
  );
}
