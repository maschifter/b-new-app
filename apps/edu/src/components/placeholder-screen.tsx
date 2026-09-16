import { BouncablePress } from "@bnewapp/mobile-kit/ui";
import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

interface PlaceholderScreenProps {
  title: string;
  /** What this surface will hold once the feature work lands. */
  body: string;
  action?: { label: string; onPress: () => void } | undefined;
}

/**
 * The scaffold's only screen shape. Every route renders one until its feature is
 * built, so the app boots, navigates and styles itself against the real token set.
 */
export function PlaceholderScreen({ title, body, action }: PlaceholderScreenProps) {
  return (
    <SafeAreaView className="flex-1 bg-app" edges={["top", "left", "right", "bottom"]}>
      <View className="flex-1 items-center justify-center gap-3 px-8">
        <Text className="text-center font-semibold text-2xl text-foreground">{title}</Text>
        <Text className="text-center text-base text-copy">{body}</Text>
        {action ? (
          <BouncablePress
            accessibilityRole="button"
            accessibilityLabel={action.label}
            className="mt-4 rounded-full bg-primary px-6 py-3"
            onPress={action.onPress}
          >
            <Text className="font-semibold text-base text-foreground">{action.label}</Text>
          </BouncablePress>
        ) : null}
      </View>
    </SafeAreaView>
  );
}
