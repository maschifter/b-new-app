import type { TextInputProps } from "react-native";
import { Text, TextInput, View } from "react-native";

interface TextFieldProps extends TextInputProps {
  error?: string;
  label: string;
}

export function TextField({ error, label, ...props }: TextFieldProps) {
  return (
    <View className="gap-2">
      <Text className="text-sm font-semibold text-foreground">{label}</Text>
      <TextInput
        placeholderTextColor="#898995"
        className={`min-h-[52px] rounded-xl border px-4 text-base text-foreground ${error ? "border-danger" : "border-border"}`}
        {...props}
      />
      {error ? (
        <Text accessibilityRole="alert" className="text-[13px] text-danger">
          {error}
        </Text>
      ) : null}
    </View>
  );
}
