import { BouncablePress } from "@bnewapp/mobile-kit/ui";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export interface FilterOption<T extends string | number> {
  /** `null` is the All option every filter carries. */
  value: T | null;
  label: string;
}

interface FeedFilterSheetProps<T extends string | number> {
  visible: boolean;
  title: string;
  options: Array<FilterOption<T>>;
  selected: T | null;
  onSelect: (value: T | null) => void;
  onClose: () => void;
}

/**
 * React Native's own `Modal`, the way every other sheet in this repository works.
 * "Bottom sheet" in document 01 line 29 is a presentation, not a named library.
 */
export function FeedFilterSheet<T extends string | number>({
  visible,
  title,
  options,
  selected,
  onSelect,
  onClose,
}: FeedFilterSheetProps<T>) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Close ${title}`}
        onPress={onClose}
        className="flex-1 bg-black/60"
      />
      <SafeAreaView edges={["bottom"]} className="bg-panel">
        <View className="rounded-t-3xl bg-panel px-5 pt-5 pb-2">
          <Text accessibilityRole="header" className="font-extrabold text-foreground text-lg">
            {title}
          </Text>
          <ScrollView className="mt-3 max-h-96">
            {options.map((option) => {
              const isSelected = option.value === selected;
              return (
                <BouncablePress
                  key={option.value === null ? "all" : String(option.value)}
                  testID="feed-filter-option"
                  accessibilityRole="button"
                  accessibilityLabel={option.label}
                  accessibilityState={{ selected: isSelected }}
                  onPress={() => {
                    onSelect(option.value);
                    onClose();
                  }}
                  className={`mb-2 rounded-2xl border px-4 py-3 ${
                    isSelected ? "border-neon bg-panel-raised" : "border-border bg-panel-raised"
                  }`}
                >
                  <Text className={`font-bold text-base ${isSelected ? "text-neon" : "text-copy"}`}>
                    {option.label}
                  </Text>
                </BouncablePress>
              );
            })}
          </ScrollView>
        </View>
      </SafeAreaView>
    </Modal>
  );
}
