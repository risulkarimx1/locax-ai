import type { LocalizationRow } from "@/types/locax";
import { parseCSVLine } from "./csv-parser";

const META_FILE_NAME = "localization_meta.csv";
const META_HEADERS = ["Key", "Context", "ScreenshotBase64", "LinkedKeys", "Notes"] as const;
const UTF8_BOM = "\uFEFF";

export type MetaEntry = {
  key: string;
  context: string;
  screenshot?: string;
  linkedKeys: string[];
  notes?: string;
};

interface LoadMetaOptions {
  folderHandle: FileSystemDirectoryHandle | null;
  existingHandle?: FileSystemFileHandle | null;
  rows: LocalizationRow[];
}

export interface MetaLoadResult {
  metaFileHandle: FileSystemFileHandle | null;
  metaExists: boolean;
  metaByKey: Record<string, MetaEntry>;
  lastModified?: number;
}

export async function loadMetaData({
  folderHandle,
  existingHandle,
  rows,
}: LoadMetaOptions): Promise<MetaLoadResult> {
  const fallback = buildFallbackMap(rows);

  if (!folderHandle && !existingHandle) {
    return { metaFileHandle: null, metaExists: false, metaByKey: fallback };
  }

  if (existingHandle) {
    try {
      const { map, lastModified } = await readMetaHandle(existingHandle);
      return { metaFileHandle: existingHandle, metaExists: true, metaByKey: map, lastModified };
    } catch (error) {
      console.warn("Failed to read stored meta handle", error);
    }
  }

  if (!folderHandle) {
    return { metaFileHandle: null, metaExists: false, metaByKey: fallback };
  }

  try {
    const fileHandle = await folderHandle.getFileHandle(META_FILE_NAME, { create: false });
    const { map, lastModified } = await readMetaHandle(fileHandle);
    return { metaFileHandle: fileHandle, metaExists: true, metaByKey: map, lastModified };
  } catch (error) {
    if ((error as DOMException)?.name !== "NotFoundError") {
      console.error("Failed to open meta file", error);
      return { metaFileHandle: null, metaExists: false, metaByKey: fallback };
    }
  }

  // Create new meta file using fallback context data
  try {
    const fileHandle = await folderHandle.getFileHandle(META_FILE_NAME, { create: true });
    const lastModified = await writeMetaFile(fileHandle, rows);
    return { metaFileHandle: fileHandle, metaExists: false, metaByKey: buildFallbackMap(rows), lastModified };
  } catch (creationError) {
    console.error("Failed to create meta file", creationError);
    return { metaFileHandle: null, metaExists: false, metaByKey: fallback };
  }
}

export async function writeMetaFile(handle: FileSystemFileHandle, rows: LocalizationRow[]): Promise<number> {
  const content = serializeMetaRows(rows);
  const writable = await handle.createWritable();
  await writable.write(UTF8_BOM + content);
  await writable.close();
  const file = await handle.getFile();
  return file.lastModified;
}

export async function ensureMetaFileHandle({
  folderHandle,
  metaFileHandle,
  rows,
}: {
  folderHandle: FileSystemDirectoryHandle | null;
  metaFileHandle: FileSystemFileHandle | null;
  rows: LocalizationRow[];
}): Promise<FileSystemFileHandle | null> {
  if (metaFileHandle) {
    return metaFileHandle;
  }

  if (!folderHandle) {
    return null;
  }

  try {
    const handle = await folderHandle.getFileHandle(META_FILE_NAME, { create: true });
    await writeMetaFile(handle, rows);
    return handle;
  } catch (error) {
    console.error("Failed to ensure meta file", error);
    return null;
  }
}

async function readMetaHandle(handle: FileSystemFileHandle): Promise<{ map: Record<string, MetaEntry>; lastModified: number }> {
  const file = await handle.getFile();
  const text = await file.text();
  return { map: parseMetaCSV(text), lastModified: file.lastModified };
}

function parseMetaCSV(csvContent: string): Record<string, MetaEntry> {
  const normalized = csvContent.replace(/^\uFEFF/, '');
  const lines = normalized.trim().split(/\r?\n/).filter(Boolean);
  if (!lines.length) {
    return {};
  }

  const header = parseCSVLine(lines[0]);
  const keyIndex = header.findIndex(h => h.toLowerCase() === "key");
  const contextIndex = header.findIndex(h => h.toLowerCase() === "context");
  const screenshotIndex = header.findIndex(h => h.toLowerCase().includes("screenshot"));
  const linkedIndex = header.findIndex(h => h.toLowerCase() === "linkedkeys");
  const notesIndex = header.findIndex(h => h.toLowerCase() === "notes");

  const meta: Record<string, MetaEntry> = {};
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const key = values[keyIndex]?.trim();
    if (!key) continue;

    const linkedRaw = linkedIndex >= 0 ? values[linkedIndex] || "" : "";
    meta[key] = {
      key,
      context: contextIndex >= 0 ? values[contextIndex] || "" : "",
      screenshot: screenshotIndex >= 0 ? values[screenshotIndex] || undefined : undefined,
      linkedKeys: linkedRaw ? linkedRaw.split(',').map(item => item.trim()).filter(Boolean) : [],
      notes: notesIndex >= 0 ? values[notesIndex] || undefined : undefined,
    };
  }

  return meta;
}

function serializeMetaRows(rows: LocalizationRow[]): string {
  const header = META_HEADERS.join(',');
  const sortedRows = [...rows].sort((a, b) => a.key.localeCompare(b.key));
  const dataRows = sortedRows.map(row => {
    const linked = row.linkedKeys && row.linkedKeys.length ? row.linkedKeys.join(',') : '';
    return [
      escape(row.key),
      escape(row.context ?? row.description ?? ''),
      escape(row.screenshot ?? ''),
      escape(linked),
      escape(row.notes ?? ''),
    ].join(',');
  });

  return [header, ...dataRows].join('\n');
}

function buildFallbackMap(rows: LocalizationRow[]): Record<string, MetaEntry> {
  return rows.reduce<Record<string, MetaEntry>>((acc, row) => {
    acc[row.key] = {
      key: row.key,
      context: row.context ?? row.description ?? '',
      screenshot: row.screenshot,
      linkedKeys: row.linkedKeys ?? [],
      notes: row.notes,
    };
    return acc;
  }, {});
}

function escape(value: string): string {
  if (!value) return '';
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
