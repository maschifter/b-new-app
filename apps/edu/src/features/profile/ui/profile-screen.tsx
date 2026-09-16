import { PlaceholderScreen } from "@/components/placeholder-screen";

interface ProfileScreenProps {
  onBack: () => void;
}

export function ProfileScreen({ onBack }: ProfileScreenProps) {
  return (
    <PlaceholderScreen
      title="Profile"
      body="Learned moves, saved scores and personal recordings — all local to this device."
      action={{ label: "Back to feed", onPress: onBack }}
    />
  );
}
