# Device verification — RN 0.83 / Expo SDK 55

**Date:** 2026-08-12 · **Branch:** `chore/rn-0.83`
**Companion to:** [`react-native-0.83-upgrade.md`](./react-native-0.83-upgrade.md)

A log of running the upgraded app on real hardware: what was exercised, every
problem hit, and how each was resolved.

**Device:** Xiaomi 25078RA3EY (HyperOS/MIUI) · **Android 16, API 36** · 720×1600
px @ density 320 (360×800 dp) · gesture navigation (`navigation_mode=2`,
bottom inset **16 dp**) · JDK 17.0.10 · Node v24.14.1 · pnpm 10.13.1.

Android 16 is a useful target here: SDK 55 makes edge-to-edge mandatory, and this
is the OS version that enforces it.

---

## Result

The native build, launch, auth, routing and persistence all work on RN 0.83.
**One real bug was found and fixed** (tab bar / gesture pill collision, I3).
Three environment problems (I1, I2, I4) cost time but were not app defects.

Interactive Studio flows and sign-out are **not verified** — see
[Not verified](#not-verified). This was a deliberate stopping point, not an
oversight.

---

## Issues encountered

### I1 — `expo run:android --device <serial>` rejects a serial

```
CommandError: Could not find device with name: YLGQ7TMR4TNRJVS4
```

`--device` matches a device *name*, not the adb serial. With a single device
attached the flag is unnecessary. **Resolution:** dropped the flag.
Not an app problem.

### I2 — APK install refused by MIUI

```
adb: failed to install app-debug.apk:
  Failure [INSTALL_FAILED_USER_RESTRICTED: Install canceled by user]
```

Gradle had already reported `BUILD SUCCESSFUL in 6m 53s`, so this was purely the
install step. MIUI blocks installs initiated over USB unless the on-device
confirmation is accepted; expo's invocation passes `--user 0`, which MIUI treats
more strictly. **Resolution:** installed directly with
`adb install -r -d <apk>`, which succeeded. Not an app problem.

### I3 — Tab bar labels collided with the system gesture pill 🐞

**The one genuine app bug found.** On every tabbed screen the "My Studio" label
was drawn straight through the Android gesture pill.

Diagnosed rather than guessed. A temporary on-device probe rendering
`useSafeAreaInsets()` reported:

```
INSETS {"left":0,"bottom":16,"right":0,"top":37}
FRAME  {"x":0,"y":0,"width":360,"height":800}
```

So the inset was being reported correctly — React Navigation was not the
problem. Reading `BottomTabBar.tsx` showed the bar is sized as a 49 dp content
box (`TABBAR_HEIGHT_UIKIT`) plus `paddingBottom: insets.bottom`, with
`tabBarStyle` merged **after** the computed style. The app's
`tabBarStyle.paddingTop: 8` therefore ate into the content box:

| | dp |
|---|---|
| content box | 49 |
| − custom `paddingTop` | −8 |
| **available** | **41** |
| icon 24 + label ~13 + `tabBarItemStyle.paddingVertical` 4×2 | **45** |

4 dp of overflow pushed the label down into the 16 dp region reserved for the
gesture bar.

**Fix** (`apps/mobile/src/app/(tabs)/_layout.tsx`, commit `3df1921`) — give the
bar back the height the padding consumed:

```tsx
const TAB_BAR_CONTENT_HEIGHT = 57; // 49 content + 8 paddingTop
const insets = useSafeAreaInsets();
// ...
tabBarStyle: { /* ... */ paddingTop: 8, height: TAB_BAR_CONTENT_HEIGHT + insets.bottom },
```

The inset is added explicitly because `getTabBarHeight` returns a numeric
`tabBarStyle.height` verbatim and stops adding the inset itself
(`BottomTabBar.tsx:140-142`) — omitting it would have traded one bug for another.

Verified fixed on device, and again after a cold restart.

**Not upgrade fallout.** `@react-navigation/bottom-tabs@7.18.15`,
`@react-navigation/native@7.3.15` and `react-native-safe-area-context@5.6.2` are
byte-identical before and after the SDK bump (checked in the lockfile diff), so
this arithmetic was the same on SDK 54. Testing on an Android 16 gesture-nav
device is simply what exposed it.

### I4 — MIUI blocks synthetic input, capping the test sweep

```
SecurityException: Injecting input events requires the caller ... INJECT_EVENTS
```

`adb shell input tap/text` is refused unless MIUI's *USB debugging (Security
settings)* is enabled, which needs a signed-in Mi account. **Resolution:**
worked around it for navigation by driving `expo-router` through deep links
(`adb shell am start -a android.intent.action.VIEW -d "bnewapp://<route>"`),
which needs no injection permission. Taps, drags and typing remained impossible,
which is what bounds the Not-verified list below.

Two more things that *don't* need injection were used to widen coverage:
`adb shell am force-stop` + relaunch for cold-restart hydration, and reading the
app's private storage via `run-as`.

> Incidental: `adb shell run-as ... /data/data/...` must be run from PowerShell,
> not Git Bash — Git Bash rewrites the leading `/data/...` into a Windows path
> (`C:/Program Files/data/...`) and the command fails confusingly.

---

## Verified on device

| Area | Evidence |
|---|---|
| Native build | Gradle `BUILD SUCCESSFUL in 6m 53s`; CMake compiled for `arm64-v8a` and `armeabi-v7a` |
| New Architecture | `Running "main" with {"rootTag":1,"fabric":true}` — Fabric active |
| Hermes / worklets / reanimated natives | `libworklets.so` and `libreanimated.so` both `nativeloader: ... ok` |
| Metro bundling | 1822 modules in 11.9 s, no resolution errors |
| Auth | Real Supabase sign-in; token at `sb-uuuoellkauugnjtmgvow-auth-token`, `hokhacbac@gmail.com` |
| Session persistence | Survives cold restart — app routes straight to Studio, never flashing sign-in |
| `Stack.Protected` guards | Signed-out build landed on `/auth/sign-in`; signed-in build reaches `(tabs)` and `/profile` |
| Routing | Deep-link sweep over `crew`, `explore`, `studio`, `profile` — all render, tab active state follows |
| Studio rendering | Full room art composes correctly (expo-image), 13 spots placed |
| Profile | Real user data — email and "Member since August 10, 2026" |
| MMKV persistence | `files/mmkv/studio` written and read back: `{"version":2,"templateId":"studio-room-1","map":{...13 spots...}}`, keyed per-user as `studio:v1:<uuid>` |
| Edge-to-edge | Status bar and bottom inset handled on Android 16 after the I3 fix |
| Runtime errors | **Zero** `ReactNativeJS` errors and zero `FATAL`/`AndroidRuntime` crashes across launch, route sweep and cold restart |

The only `ReactHost` soft exception seen —
`onWindowFocusChange ... context is not ready` — is a benign RN startup race
logged before the JS context attaches, not a defect.

---

## Not verified

Blocked by I4 (no synthetic input) and stopped here by choice:

- [ ] Studio item picker — open, browse, select an item
- [ ] Placing/swapping an item into a spot, and the resulting MMKV write
- [ ] Studio state change surviving a restart (the *hydration* path is verified;
      a user-driven *mutation* then restart is not)
- [ ] Sign-out through the `Stack.Protected` teardown, and re-auth afterwards
- [ ] Tab switching by touch (deep-link navigation is verified; touch is not)
- [ ] `BouncablePress` spring animation under real touch — the reanimated JS
      layer is exercised in jest and the native lib loads, but no worklet has
      been driven by a real gesture on device
- [ ] Keyboard behaviour on the sign-in form
- [ ] iOS entirely — Windows dev machine, needs EAS
- [ ] RAM measurement vs an SDK 54 baseline (no baseline was captured before the
      upgrade build was installed)

To unblock the touch-driven items: enable *Settings → Additional settings →
Developer options → USB debugging (Security settings)* on the device, then
`adb shell input` works and the sweep can be automated.

---

## Reproducing this setup

```bash
cd apps/mobile
npx expo run:android                 # builds; if install fails with USER_RESTRICTED:
adb install -r -d android/app/build/outputs/apk/debug/app-debug.apk

npx expo start                       # loads .env
adb reverse tcp:8081 tcp:8081
adb shell monkey -p com.bnewapp.mobile.staging -c android.intent.category.LAUNCHER 1
```

The installed package is `com.bnewapp.mobile.staging` — `pnpm mobile:prebuild:staging`
sets `EAS_BUILD_PROFILE=staging`, which `app.config.ts` turns into the `.staging`
bundle suffix. `am start -n com.bnewapp.mobile/.MainActivity` will fail; use the
suffixed id.

Navigate without touch:

```bash
adb shell am start -a android.intent.action.VIEW -d "bnewapp://studio"
```
</content>
