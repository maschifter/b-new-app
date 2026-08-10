import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import type { ComponentProps } from "react";

type IoniconName = ComponentProps<typeof Ionicons>["name"];

function tabIcon(active: IoniconName, inactive: IoniconName) {
  return ({ focused, color, size }: { focused: boolean; color: string; size: number }) => (
    <Ionicons name={focused ? active : inactive} size={size} color={color} />
  );
}

// Studio is the center/main tab and the landing screen after sign-in.
export default function TabsLayout() {
  return (
    <Tabs
      initialRouteName="studio"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#8B5CF6",
        tabBarInactiveTintColor: "#3A3A44",
        tabBarStyle: {
          backgroundColor: "#F6F1E6",
          borderTopWidth: 0,
          borderTopLeftRadius: 22,
          borderTopRightRadius: 22,
          paddingTop: 8,
        },
        tabBarItemStyle: { paddingVertical: 4 },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "700", letterSpacing: 0.3 },
      }}
    >
      <Tabs.Screen
        name="crew"
        options={{ title: "Crew", tabBarIcon: tabIcon("people", "people-outline") }}
      />
      <Tabs.Screen
        name="studio"
        options={{ title: "My Studio", tabBarIcon: tabIcon("home", "home-outline") }}
      />
      <Tabs.Screen
        name="explore"
        options={{ title: "Explore", tabBarIcon: tabIcon("compass", "compass-outline") }}
      />
    </Tabs>
  );
}
