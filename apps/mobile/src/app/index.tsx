import { useAuthSession } from "@/lib/auth/session-provider";
import { Redirect } from "expo-router";

export default function IndexScreen() {
  const { session } = useAuthSession();
  return <Redirect href={session ? "/home" : "/auth/sign-in"} />;
}
