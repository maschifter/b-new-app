import { BouncablePress } from "@/components/bouncable-press";
import { router } from "expo-router";
import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export function ExploreRoomShell({ children }: { children: ReactNode }) {
  return (
    <View className="flex-1 bg-panel">
      {children}
      <ExploreRoomHeader />
    </View>
  );
}

export function ExploreRoomHeader({ username }: { username?: string }) {
  return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      pointerEvents="box-none"
      className="absolute inset-x-0 top-0 flex-row items-center gap-3 px-4 pt-2"
    >
      <BouncablePress
        accessibilityRole="button"
        accessibilityLabel="Go back"
        onPress={() => router.back()}
        hitSlop={12}
        className="h-11 min-w-11 items-center justify-center rounded-full bg-panel/70 px-[14px]"
      >
        <Text className="text-sm font-bold text-foreground">Back</Text>
      </BouncablePress>
      {username ? (
        <View className="shrink rounded-[18px] bg-panel/70 px-[14px] py-2">
          <Text className="text-[15px] font-bold text-foreground" numberOfLines={1}>
            {username}
          </Text>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

export function ExploreRoomMessage({ title, copy }: { title: string; copy: string }) {
  return (
    <View className="flex-1 items-center justify-center gap-2 px-8">
      <Text className="text-lg font-bold text-foreground">{title}</Text>
      <Text className="text-center text-sm leading-5 text-muted">{copy}</Text>
    </View>
  );
}
