import { ProTipScreen } from "@/features/feed";
import { isUuidParam } from "@bnewapp/mobile-kit";
import { Redirect, router, useLocalSearchParams } from "expo-router";

export default function ProTipRoute() {
  const { moveId } = useLocalSearchParams<{ moveId: string }>();
  if (!isUuidParam(moveId)) return <Redirect href="/" />;
  return <ProTipScreen moveId={moveId} onBack={() => router.back()} />;
}
