import { ShopScreen } from "@/features/shop";
import { router } from "expo-router";

export default function ShopRoute() {
  return <ShopScreen onBack={() => router.back()} />;
}
