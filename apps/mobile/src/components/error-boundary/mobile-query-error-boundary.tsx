import { BouncablePress } from "@/components/bouncable-press";
import { queryErrorResetVersionAtom } from "@/lib/react-query/query-error-reset";
import { QueryErrorResetBoundary, useQueryClient } from "@tanstack/react-query";
import { useSetAtom } from "jotai";
import { Component, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

interface MobileQueryErrorBoundaryProps {
  children: ReactNode;
  title?: string;
  copy?: string;
  retryLabel?: string;
}

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback: (error: Error, retry: () => void) => ReactNode;
  onReset: () => Promise<void>;
}

interface ErrorBoundaryState {
  error: Error | null;
}

class QueryErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { error: error instanceof Error ? error : new Error("Unknown query error") };
  }

  private retry = async () => {
    await this.props.onReset();
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return this.props.fallback(this.state.error, this.retry);
    }
    return this.props.children;
  }
}

export function MobileQueryErrorBoundary({
  children,
  title = "Couldn't load this screen",
  copy = "Something went wrong. Please try again.",
  retryLabel = "Retry",
}: MobileQueryErrorBoundaryProps) {
  const queryClient = useQueryClient();
  const bumpResetVersion = useSetAtom(queryErrorResetVersionAtom);

  return (
    <QueryErrorResetBoundary>
      {({ reset }) => (
        <QueryErrorBoundary
          onReset={async () => {
            reset();
            const errorFilter = {
              predicate: (query: { state: { status: string } }) =>
                query.state.status === "error",
            };
            await queryClient.cancelQueries(errorFilter);
            queryClient.removeQueries(errorFilter);
            bumpResetVersion((version) => version + 1);
          }}
          fallback={(_error, retry) => (
            <View style={styles.container}>
              <Text style={styles.title}>{title}</Text>
              <Text style={styles.copy}>{copy}</Text>
              <BouncablePress
                accessibilityRole="button"
                accessibilityLabel={retryLabel}
                onPress={retry}
                style={styles.retry}
              >
                <Text style={styles.retryLabel}>{retryLabel}</Text>
              </BouncablePress>
            </View>
          )}
        >
          {children}
        </QueryErrorBoundary>
      )}
    </QueryErrorResetBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    backgroundColor: "#101014",
    flex: 1,
    gap: 8,
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  title: { color: "#F8F7FC", fontSize: 18, fontWeight: "700" },
  copy: { color: "#898995", fontSize: 14, lineHeight: 20, textAlign: "center" },
  retry: {
    borderColor: "#4A4856",
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 8,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  retryLabel: { color: "#F8F7FC", fontSize: 14, fontWeight: "700" },
});
