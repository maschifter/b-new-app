import { BouncablePress } from "@/components/bouncable-press";
import { COLORS } from "@/lib/theme/colors";
import { Ionicons } from "@expo/vector-icons";
import { useAtomValue } from "jotai";
import { useEffect, useRef, useState } from "react";
import { Modal, Text, View } from "react-native";
import { deleteDancePostMutationAtom } from "../_atoms/mutations";

export function DancePostMenu({ postId, onDeleted }: { postId: string; onDeleted: () => void }) {
  const [stage, setStage] = useState<"closed" | "menu" | "confirm" | "deleted">("closed");
  const [failed, setFailed] = useState(false);
  const mounted = useRef(false);
  const didNavigate = useRef(false);
  const deleting = useRef(false);
  const mutation = useAtomValue(deleteDancePostMutationAtom);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (stage === "deleted" && !didNavigate.current) {
      didNavigate.current = true;
      onDeleted();
    }
  }, [stage, onDeleted]);

  async function deletePost() {
    if (deleting.current) return;
    deleting.current = true;
    setFailed(false);
    try {
      await mutation.mutateAsync(postId);
      if (mounted.current) setStage("deleted");
    } catch {
      if (mounted.current) setFailed(true);
    } finally {
      deleting.current = false;
    }
  }

  return (
    <>
      <BouncablePress
        accessibilityRole="button"
        accessibilityLabel="Post options"
        onPress={() => {
          setFailed(false);
          setStage("menu");
        }}
        className="size-11 items-center justify-center rounded-full border border-border bg-panel"
      >
        <Ionicons name="ellipsis-horizontal" size={22} color={COLORS.foreground} />
      </BouncablePress>
      <Modal
        visible={stage === "menu" || stage === "confirm"}
        transparent
        animationType={stage === "deleted" ? "none" : "fade"}
        onRequestClose={() => {
          if (!deleting.current) setStage("closed");
        }}
      >
        <View className="flex-1 justify-center bg-black/60 px-6">
          <View
            accessibilityViewIsModal
            className="gap-4 rounded-3xl border border-border bg-panel p-6"
          >
            <Text accessibilityRole="header" className="text-xl font-bold text-foreground">
              {stage === "confirm" ? "Delete this post?" : "Post options"}
            </Text>
            {stage === "confirm" ? (
              <Text className="text-base text-copy">
                Your recording and score will be permanently deleted. This cannot be undone.
              </Text>
            ) : null}
            {failed ? (
              <Text accessibilityRole="alert" className="text-base text-copy">
                Couldn't delete this post. Please try again.
              </Text>
            ) : null}
            <BouncablePress
              accessibilityRole="button"
              accessibilityLabel={stage === "confirm" ? "Confirm delete post" : "Delete post"}
              accessibilityState={{ disabled: mutation.isPending, busy: mutation.isPending }}
              disabled={mutation.isPending}
              onPress={() => (stage === "confirm" ? void deletePost() : setStage("confirm"))}
              className="min-h-12 items-center justify-center rounded-xl bg-primary px-4 py-3"
            >
              <Text className="font-bold text-foreground">
                {mutation.isPending ? "Deleting…" : "Delete post"}
              </Text>
            </BouncablePress>
            <BouncablePress
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              disabled={mutation.isPending}
              accessibilityState={{ disabled: mutation.isPending }}
              onPress={() => setStage("closed")}
              className="min-h-12 items-center justify-center rounded-xl border border-border px-4 py-3"
            >
              <Text className="font-bold text-foreground">Cancel</Text>
            </BouncablePress>
          </View>
        </View>
      </Modal>
    </>
  );
}
