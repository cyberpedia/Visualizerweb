const DB_NAME = "avee-assets";
const STORE_NAME = "assets";
let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("indexedDB open failed"));
  });
  return dbPromise;
}

export async function setAsset(key: string, data: ArrayBuffer): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(data, key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error || new Error("setAsset failed"));
  });
}

export async function getAsset(key: string): Promise<ArrayBuffer | null> {
  const db = await openDB();
  return new Promise<ArrayBuffer | null>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(key);
    req.onsuccess = () => resolve((req.result as ArrayBuffer) || null);
    req.onerror = () => reject(req.error || new Error("getAsset failed"));
  });
}

export async function setJSON(key: string, obj: any): Promise<void> {
  const text = JSON.stringify(obj);
  const buf = new TextEncoder().encode(text).buffer;
  await setAsset(key, buf);
}

export async function getJSON<T = any>(key: string): Promise<T | null> {
  const buf = await getAsset(key);
  if (!buf) return null;
  try {
    const text = new TextDecoder().decode(new Uint8Array(buf));
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}