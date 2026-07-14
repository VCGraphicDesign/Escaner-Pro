export interface TextLayer {
  id: string;
  text: string;
  x: number; // percentage (0-100)
  y: number; // percentage (0-100)
  size: number; // font size in px
  color: string;
}

export interface ScannedPage {
  id: string;
  originalImage: string; // base64 representation
  processedImage: string; // base64 representation of perspective corrected and filtered image
  rotate: number; // rotation in degrees: 0, 90, 180, 270
  cropPoints: { x: number; y: number }[]; // 4 corner points normalized [0, 1]
  brightness: number; // -100 to 100
  contrast: number; // -100 to 100
  binarize: boolean;
  binarizeThreshold: number; // local adaptive threshold
  shadowRemoval: boolean;
  grayscale: boolean;
  texts: TextLayer[];
}

export interface DocumentProject {
  id: string;
  name: string;
  createdAt: number;
  pages: ScannedPage[];
}

const DB_NAME = 'ScannerAppDB';
const DB_VERSION = 1;
const STORE_NAME = 'documents';

function getDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
  });
}

export async function saveDocumentProject(project: DocumentProject): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(project);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

export async function getDocumentProject(id: string): Promise<DocumentProject | null> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result || null);
  });
}

export async function getAllDocumentProjects(): Promise<DocumentProject[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const results = request.result as DocumentProject[];
      // Sort by creation date descending
      results.sort((a, b) => b.createdAt - a.createdAt);
      resolve(results);
    };
  });
}

export async function deleteDocumentProject(id: string): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}
