import { PlaceholderScreen } from "@/components/placeholder-screen";

interface ProfileStyleScreenProps {
  styleId: string;
  onBack: () => void;
}

export function ProfileStyleScreen({ styleId, onBack }: ProfileStyleScreenProps) {
  return (
    <PlaceholderScreen
      title="Style"
      body={`Moves learned in style ${styleId}.`}
      action={{ label: "Back to profile", onPress: onBack }}
    />
  );
}
