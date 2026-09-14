import { ProfileScreen } from "@/features/auth";
import { router } from "expo-router";

export default function ProfileRoute() {
  return <ProfileScreen onOpenSettings={() => router.push("/settings")} />;
}
