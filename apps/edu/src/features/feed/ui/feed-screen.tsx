import { PlaceholderScreen } from "@/components/placeholder-screen";

interface FeedScreenProps {
  onOpenProfile: () => void;
}

export function FeedScreen({ onOpenProfile }: FeedScreenProps) {
  return (
    <PlaceholderScreen
      title="Feed"
      body="The vertical move feed with its tempo control lands here. Scaffold only for now."
      action={{ label: "Open profile", onPress: onOpenProfile }}
    />
  );
}
