import { ChooseDanceMovesScreen } from "@/features/dance";
import { router } from "expo-router";

export default function DanceRoute() {
  return (
    <ChooseDanceMovesScreen
      onOpenMove={(moveId) => router.push({ pathname: "/dance/[moveId]", params: { moveId } })}
      onBack={() => router.back()}
    />
  );
}
