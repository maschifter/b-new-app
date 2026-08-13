import { BouncablePress } from "@/components/bouncable-press";
import { queryErrorResetVersionAtom } from "@/lib/react-query/query-error-reset";
import { QueryErrorResetBoundary, useQueryClient } from "@tanstack/react-query";
import { useSetAtom } from "jotai";
import { Component, type ReactNode } from "react";
import { Text, View } from "react-native";

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
              predicate: (query: { state: { status: string } }) => query.state.status === "error",
            };
            await queryClient.cancelQueries(errorFilter);
            queryClient.removeQueries(errorFilter);
            bumpResetVersion((version) => version + 1);
          }}
          fallback={(_error, retry) => (
            <View className="flex-1 items-center justify-center gap-2 bg-app px-8">
              <Text className="text-lg font-bold text-foreground">{title}</Text>
              <Text className="text-center text-sm leading-5 text-muted">{copy}</Text>
              <BouncablePress
                accessibilityRole="button"
                accessibilityLabel={retryLabel}
                onPress={retry}
                className="mt-2 rounded-[10px] border border-border px-[18px] py-[10px]"
              >
                <Text className="text-sm font-bold text-foreground">{retryLabel}</Text>
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
