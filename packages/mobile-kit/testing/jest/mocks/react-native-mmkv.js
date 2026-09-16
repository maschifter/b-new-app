// In-memory stand-in for react-native-mmkv (a native Nitro module that can't
// load under Node). Jest only auto-applies a manual mock for a node_modules
// module from `<rootDir>/__mocks__/<module>.js`, which cannot be a package path,
// so every consuming project keeps a one-line re-export there. Stores are keyed
// by MMKV `id` so instances with different ids stay isolated, matching the real
// module.
//
// `__resetAllMMKV()` (called from jest.after-env.js before each test) wipes all
// stores so persisted state never leaks across tests.

const stores = new Map();

function storeFor(id) {
  let store = stores.get(id);
  if (!store) {
    store = new Map();
    stores.set(id, store);
  }
  return store;
}

class MMKV {
  constructor(config = {}) {
    this.id = config.id ?? "mmkv.default";
  }

  _store() {
    return storeFor(this.id);
  }

  getString(key) {
    const value = this._store().get(key);
    return value === undefined ? undefined : value;
  }

  set(key, value) {
    this._store().set(key, String(value));
  }

  delete(key) {
    this._store().delete(key);
  }

  contains(key) {
    return this._store().has(key);
  }

  getAllKeys() {
    return [...this._store().keys()];
  }

  clearAll() {
    this._store().clear();
  }
}

function __resetAllMMKV() {
  stores.clear();
}

module.exports = { MMKV, __resetAllMMKV };
