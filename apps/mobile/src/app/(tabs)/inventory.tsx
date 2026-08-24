import { InventoryScreen } from "@/features/shop";
import { router } from "expo-router";

export default function InventoryTab() {
  return <InventoryScreen onOpenShop={() => router.push("/shop")} />;
}
