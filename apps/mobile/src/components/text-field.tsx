import type { TextInputProps } from "react-native";
import { StyleSheet, Text, TextInput, View } from "react-native";

interface TextFieldProps extends TextInputProps {
  error?: string;
  label: string;
}

export function TextField({ error, label, ...props }: TextFieldProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor="#898995"
        style={[styles.input, error && styles.inputError]}
        {...props}
      />
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: 8 },
  label: { color: "#F8F7FC", fontSize: 14, fontWeight: "600" },
  input: {
    borderColor: "#4A4856",
    borderRadius: 12,
    borderWidth: 1,
    color: "#F8F7FC",
    fontSize: 16,
    minHeight: 52,
    paddingHorizontal: 16,
  },
  inputError: { borderColor: "#FF8F8F" },
  error: { color: "#FF8F8F", fontSize: 13 },
});
