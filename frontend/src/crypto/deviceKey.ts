// "Remember this device": keeps the unlocked, NON-extractable key in this browser's IndexedDB,
// so the password is not asked again on this device. JavaScript on this site can still USE the
// key, which is the same trade-off as an unlocked laptop. Signing out wipes it.

const DB_NAME = "horizon-device";
const STORE = "keys";

interface Stored {
  key: CryptoKey;
  keyVersion: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const request = work(tx.objectStore(STORE));
    tx.oncomplete = () => {
      db.close();
      resolve(request.result as T);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
    tx.onabort = () => {
      db.close();
      reject(tx.error);
    };
  });
}

// Returns false if the browser refuses (for example some private windows). The app still works,
// the password is just asked again next time.
export async function rememberDeviceKey(userId: string, keyVersion: number, key: CryptoKey): Promise<boolean> {
  try {
    const value: Stored = { key, keyVersion };
    await run("readwrite", (store) => store.put(value, userId));
    return true;
  } catch {
    return false;
  }
}

export async function loadDeviceKey(userId: string, keyVersion: number): Promise<CryptoKey | null> {
  try {
    const stored = await run<Stored | undefined>("readonly", (store) => store.get(userId));
    if (stored && stored.keyVersion === keyVersion && stored.key instanceof CryptoKey) return stored.key;
  } catch {
    // fall through: treat as not remembered
  }
  return null;
}

export async function forgetDeviceKeys(): Promise<void> {
  try {
    await run("readwrite", (store) => store.clear());
  } catch {
    // nothing to forget
  }
}