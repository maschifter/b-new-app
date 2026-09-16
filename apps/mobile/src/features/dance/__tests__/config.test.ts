import { createStore } from "jotai";

type ConfigModule = typeof import("../config");

interface FreshFlow {
  config: ConfigModule;
  /** Reads through the isolated registry's own MMKV: each registry has its own store map. */
  readStored(id: string, key: string): string | undefined;
}

/** A fresh module registry, so the unconfigured path is reachable more than once. */
function freshConfig(): FreshFlow {
  let config: ConfigModule | undefined;
  let mmkv: typeof import("react-native-mmkv") | undefined;
  jest.isolateModules(() => {
    config = require("../config") as ConfigModule;
    mmkv = require("react-native-mmkv") as typeof import("react-native-mmkv");
  });
  if (!config || !mmkv) throw new Error("config module failed to load");
  const { MMKV } = mmkv;
  return { config, readStored: (id, key) => new MMKV({ id }).getString(key) };
}

it("throws a named error when the base URL is read before the host app configures it", () => {
  const { config } = freshConfig();

  expect(() => config.danceApiUrl()).toThrow(config.DanceFlowNotConfiguredError);
});

it("serves the base URL the host app injected", () => {
  const { config } = freshConfig();

  config.configureDanceFlow({ apiUrl: "https://api.example.test", mmkvId: "dance-test" });

  expect(config.danceApiUrl()).toBe("https://api.example.test");
});

it("accepts a repeat call with the same values", () => {
  const { config } = freshConfig();
  const values = { apiUrl: "https://api.example.test", mmkvId: "dance-test" };

  config.configureDanceFlow(values);

  expect(() => config.configureDanceFlow({ ...values })).not.toThrow();
});

// The store is memoized on first read, so a second `mmkvId` would be silently
// ignored while `apiUrl` did change — a split-brain config, not a repoint.
it("refuses a second call that would repoint the flow", () => {
  const { config } = freshConfig();
  config.configureDanceFlow({ apiUrl: "https://api.example.test", mmkvId: "dance-test" });

  expect(() =>
    config.configureDanceFlow({ apiUrl: "https://api.example.test", mmkvId: "other-store" }),
  ).toThrow(config.DanceFlowReconfiguredError);
  expect(() =>
    config.configureDanceFlow({ apiUrl: "https://other.test", mmkvId: "dance-test" }),
  ).toThrow(config.DanceFlowReconfiguredError);
});

// The whole reason persisted atoms are built lazily: `atomWithStorage` reads storage
// when the atom is created, and these atoms are created at module load — before any
// bootstrap call could have run.
it("creates a persisted atom without touching MMKV, and resolves it on first read", () => {
  const { config } = freshConfig();

  const toggleAtom = config.persistedDanceAtom("some-toggle", false);
  expect(() => createStore().get(toggleAtom)).toThrow(config.DanceFlowNotConfiguredError);

  config.configureDanceFlow({ apiUrl: "https://api.example.test", mmkvId: "dance-test" });

  expect(createStore().get(toggleAtom)).toBe(false);
});

it("persists under the flow's own versioned namespace, in the injected store", () => {
  const { config, readStored } = freshConfig();
  config.configureDanceFlow({ apiUrl: "https://api.example.test", mmkvId: "dance-test" });
  const store = createStore();
  const toggleAtom = config.persistedDanceAtom("some-toggle", false);

  store.set(toggleAtom, true);

  expect(store.get(toggleAtom)).toBe(true);
  expect(readStored("dance-test", "dance:v1:some-toggle")).toBe("true");
  expect(readStored("dance", "dance:v1:some-toggle")).toBeUndefined();
});
