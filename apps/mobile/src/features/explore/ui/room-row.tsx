import { BouncablePress } from "@/components/bouncable-press";
import { COLORS } from "@/lib/theme/colors";
import type { ExploreRoom } from "@bnewapp/types";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Text, View } from "react-native";

// A compact list row: just the owner's handle plus a little context (how many
// items they've placed and when they last decorated). No stage mini-render — the
// full room is only drawn on the detail screen.
export function RoomRow({ room }: { room: ExploreRoom }) {
  const itemCount = Object.keys(room.snapshot.map).length;
  const initial = room.username.trim().charAt(0).toUpperCase() || "?";

  return (
    <BouncablePress
      accessibilityRole="button"
      accessibilityLabel={`Visit ${room.username}'s studio`}
      onPress={() =>
        router.push({ pathname: "/room/[ownerId]", params: { ownerId: room.ownerId } })
      }
      className="flex-row items-center gap-3 rounded-[14px] bg-panel px-[14px] py-3"
    >
      <View className="size-11 items-center justify-center rounded-full bg-primary">
        <Text className="text-lg font-extrabold text-foreground">{initial}</Text>
      </View>
      <View className="flex-1 gap-0.5">
        <Text className="text-base font-bold text-foreground" numberOfLines={1}>
          {room.username}
        </Text>
        <Text className="text-[13px] text-muted" numberOfLines={1}>
          {itemCount} {itemCount === 1 ? "item" : "items"} · {formatRelativeTime(room.updatedAt)}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={COLORS.border} />
    </BouncablePress>
  );
}

function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const minutes = Math.floor((Date.now() - then) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}
