import { useEffect } from "react";
import { NativeEventEmitter, Platform, type TurboModule, TurboModuleRegistry } from "react-native";

interface NativeAnimatedModule extends TurboModule {
  addListener(eventName: string): void;
  removeListeners(count: number): void;
}

const NATIVE_ANIMATED_MODULE_NAMES = ["NativeAnimatedModule", "NativeAnimatedTurboModule"];

/**
 * Keeps the iOS native Animated emitter alive while the development JS runtime
 * is mounted. During Fast Refresh or an Expo Router redirect, native-stack can
 * finish a transition after React Native has removed its per-value listener.
 * RCTEventEmitter otherwise reports that harmless teardown race as
 * "onAnimatedValueUpdate with no listeners registered".
 *
 * Production builds do not log this warning and do not install the guard.
 */
export function NativeAnimatedWarningGuard() {
  useEffect(() => {
    if (!__DEV__ || Platform.OS !== "ios") return;

    const subscriptions = NATIVE_ANIMATED_MODULE_NAMES.flatMap((moduleName) => {
      const nativeModule = TurboModuleRegistry.get<NativeAnimatedModule>(moduleName);
      if (!nativeModule) return [];

      return [new NativeEventEmitter(nativeModule).addListener("onAnimatedValueUpdate", () => {})];
    });

    return () => {
      for (const subscription of subscriptions) subscription.remove();
    };
  }, []);

  return null;
}
