import type { GitStatus } from "@/types/locax";

const DB_NAME = "locax-project-history";
const STORE_NAME = "projects";
const DB_VERSION = 1;
const FALLBACK_STORAGE_KEY = "locax-project-history";

export interface ProjectReference {
  id: string;
  projectName: string;
  fileName: string;
  languages: string[];
  rowCount: number;
  lastOpened: number;
  csvFileHandle: FileSystemFileHandle | null;
  folderHandle: FileSystemDirectoryHandle | null;
  gitBranch: string | null;
  gitStatus: GitStatus;
}

export interface SaveProjectReferenceInput {
  projectName: string;
  fileName: string;
  languages: string[];
  rowCount: number;
  csvFileHandle: FileSystemFileHandle | null;
  folderHandle?: FileSystemDirectoryHandle | null;
  gitBranch?: string | null;
  gitStatus?: GitStatus;
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

function hasWindow(): boolean {
  return typeof window !== "undefined";
}

function getFallbackStorage(): Storage | null {
  if (!hasWindow()) {
    return null;
  }

  try {
    return window.localStorage ?? null;
  } catch (error) {
    console.warn("LocalStorage unavailable", error);
    return null;
  }
}

function canUseIndexedDb(): boolean {
  return hasWindow() && "indexedDB" in window;
}

function createId(): string {
  if (hasWindow() && window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }

  return `project-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function getDb(): Promise<IDBDatabase | null> {
  if (!canUseIndexedDb()) {
    return null;
  }

  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      try {
        const request = window.indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, { keyPath: "id" });
          }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      } catch (error) {
        reject(error);
      }
    }).catch(error => {
      console.error("Failed to open project history DB", error);
      return null;
    });
  }

  return dbPromise;
}

function readFallbackEntries(): ProjectReference[] {
  const storage = getFallbackStorage();
  if (!storage) {
    return [];
  }

  try {
    const stored = storage.getItem(FALLBACK_STORAGE_KEY);
    if (!stored) {
      return [];
    }

    const parsed = JSON.parse(stored) as Array<Omit<ProjectReference, "csvFileHandle" | "folderHandle">>;
    return parsed.map(entry => ({
      ...entry,
      csvFileHandle: null,
      folderHandle: null,
    }));
  } catch (error) {
    console.error("Failed to read project history fallback", error);
    return [];
  }
}

function writeFallbackEntries(entries: ProjectReference[]): void {
  const storage = getFallbackStorage();
  if (!storage) {
    return;
  }

  try {
    const serialized = entries.map(({ csvFileHandle: _csv, folderHandle: _folder, ...rest }) => rest);
    storage.setItem(FALLBACK_STORAGE_KEY, JSON.stringify(serialized));
  } catch (error) {
    console.error("Failed to persist project history fallback", error);
  }
}

async function fetchAllEntries(): Promise<ProjectReference[]> {
  const db = await getDb();
  if (!db) {
    return readFallbackEntries();
  }

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      resolve((request.result as ProjectReference[]) ?? []);
    };

    request.onerror = () => {
      reject(request.error);
    };
  }).catch(error => {
    console.error("Failed to load project history", error);
    return readFallbackEntries();
  });
}

async function persistEntry(entry: ProjectReference): Promise<void> {
  const db = await getDb();
  if (!db) {
    const entries = readFallbackEntries().filter(item => item.id !== entry.id);
    entries.push({
      ...entry,
      csvFileHandle: null,
      folderHandle: null,
    });
    writeFallbackEntries(entries);
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Failed to save project reference"));
    tx.objectStore(STORE_NAME).put(entry);
  }).catch(error => {
    console.error("Failed to save project reference", error);
    const entries = readFallbackEntries().filter(item => item.id !== entry.id);
    entries.push({
      ...entry,
      csvFileHandle: null,
      folderHandle: null,
    });
    writeFallbackEntries(entries);
  });
}

async function deleteEntry(id: string): Promise<void> {
  const db = await getDb();
  if (!db) {
    const entries = readFallbackEntries().filter(entry => entry.id !== id);
    writeFallbackEntries(entries);
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Failed to delete project reference"));
    tx.objectStore(STORE_NAME).delete(id);
  }).catch(error => {
    console.error("Failed to delete project reference", error);
  });
}

async function getEntryById(id: string): Promise<ProjectReference | undefined> {
  const db = await getDb();
  if (!db) {
    return readFallbackEntries().find(entry => entry.id === id);
  }

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).get(id);

    request.onsuccess = () => {
      resolve(request.result as ProjectReference | undefined);
    };

    request.onerror = () => reject(request.error);
  }).catch(error => {
    console.error("Failed to read project reference", error);
    return undefined;
  });
}

async function findEntryByHandle(fileHandle: FileSystemFileHandle | null): Promise<ProjectReference | null> {
  if (!fileHandle) {
    return null;
  }

  const entries = await fetchAllEntries();
  for (const entry of entries) {
    if (!entry.csvFileHandle) {
      continue;
    }

    try {
      const isSame = await entry.csvFileHandle.isSameEntry(fileHandle);
      if (isSame) {
        return entry;
      }
    } catch (error) {
      console.warn("Failed to compare file handles", error);
    }
  }

  return null;
}

export async function getProjectReferences(): Promise<ProjectReference[]> {
  const entries = await fetchAllEntries();
  return [...entries].sort((a, b) => (b.lastOpened ?? 0) - (a.lastOpened ?? 0));
}

export async function saveProjectReference(input: SaveProjectReferenceInput): Promise<ProjectReference | null> {
  try {
    const existing = await findEntryByHandle(input.csvFileHandle ?? null);
    const now = Date.now();

    const entry: ProjectReference = existing
      ? {
          ...existing,
          projectName: input.projectName,
          fileName: input.fileName,
          languages: input.languages,
          rowCount: input.rowCount,
          lastOpened: now,
          gitBranch: input.gitBranch ?? existing.gitBranch ?? null,
          gitStatus: input.gitStatus ?? existing.gitStatus,
          csvFileHandle: input.csvFileHandle ?? existing.csvFileHandle,
          folderHandle:
            input.folderHandle === undefined ? existing.folderHandle : input.folderHandle ?? null,
        }
      : {
          id: createId(),
          projectName: input.projectName,
          fileName: input.fileName,
          languages: input.languages,
          rowCount: input.rowCount,
          lastOpened: now,
          csvFileHandle: input.csvFileHandle,
          folderHandle: input.folderHandle ?? null,
          gitBranch: input.gitBranch ?? null,
          gitStatus: input.gitStatus ?? "unknown",
        };

    await persistEntry(entry);
    return entry;
  } catch (error) {
    console.error("Failed to save project reference", error);
    return null;
  }
}

export async function markProjectOpened(id: string): Promise<void> {
  const entry = await getEntryById(id);
  if (!entry) {
    return;
  }

  entry.lastOpened = Date.now();
  await persistEntry(entry);
}

export async function removeProjectReference(id: string): Promise<void> {
  await deleteEntry(id);
}
