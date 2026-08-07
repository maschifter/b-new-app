import type { PressableProps } from "react-native";
import { ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";

interface AppButtonProps extends Omit<PressableProps, "children" | "style"> {
  isLoading?: boolean;
  label: string;
  variant?: "primary" | "secondary";
}

export function AppButton({
  isLoading = false,
  label,
  variant = "primary",
  disabled,
  ...props
}: AppButtonProps) {
  const isDisabled = disabled || isLoading;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        variant === "primary" ? styles.primary : styles.secondary,
        isDisabled && styles.disabled,
        pressed && !isDisabled && styles.pressed,
      ]}
      {...props}
    >
      {isLoading ? (
        <ActivityIndicator color={variant === "primary" ? "#121014" : "#F8F7FC"} />
      ) : null}
      <Text style={[styles.label, variant === "secondary" && styles.secondaryLabel]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: "center",
    borderRadius: 12,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    minHeight: 52,
    paddingHorizontal: 20,
  },
  primary: { backgroundColor: "#D9FF72" },
  secondary: { borderColor: "#4A4856", borderWidth: 1 },
  label: { color: "#121014", fontSize: 16, fontWeight: "700" },
  secondaryLabel: { color: "#F8F7FC" },
  disabled: { opacity: 0.55 },
  pressed: { opacity: 0.82 },
});
