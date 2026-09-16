import { ProfileScreen } from "@/features/profile";
import { router } from "expo-router";

export default function ProfileRoute() {
  return <ProfileScreen onBack={() => router.dismissTo("/")} />;
}
