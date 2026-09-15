import { COLORS } from "@/lib/theme/colors";
import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import type { ComponentProps } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type IoniconName = ComponentProps<typeof Ionicons>["name"];

// React Navigation gives the bar a 49dp content box and adds the bottom safe-area
// inset as padding underneath. `paddingTop` below eats into that content box, and
// an icon (24) + label (~13) + `tabBarItemStyle` padding (8) needs 45dp — more
// than the 41dp left over — so the label overflowed into the inset and collided
// with the Android gesture pill. Set the height explicitly instead: once
// `tabBarStyle` carries a numeric height React Navigation uses it verbatim and no
// longer adds the inset, so the inset has to be added here.
const TAB_BAR_CONTENT_HEIGHT = 57;

function tabIcon(active: IoniconName, inactive: IoniconName) {
  return ({ focused, color, size }: { focused: boolean; color: string; size: number }) => (
    <Ionicons name={focused ? active : inactive} size={size} color={color} />
  );
}

// Studio is the center/main tab and the landing screen after sign-in.
export default function TabsLayout() {
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      initialRouteName="studio"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: "#3A3A44",
        tabBarStyle: {
          backgroundColor: "#F6F1E6",
          borderTopWidth: 0,
          borderTopLeftRadius: 22,
          borderTopRightRadius: 22,
          paddingTop: 8,
          height: TAB_BAR_CONTENT_HEIGHT + insets.bottom,
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
        name="inventory"
        options={{ title: "Inventory", tabBarIcon: tabIcon("bag", "bag-outline") }}
      />
      <Tabs.Screen
        name="explore"
        options={{ title: "Explore", tabBarIcon: tabIcon("compass", "compass-outline") }}
      />
    </Tabs>
  );
}
