import { serializeCSV, serializeSourceCSV } from "./csv-parser";
import type { LocalizationRow } from "@/types/locax";

type StorageManagerWithDirectory = StorageManager & {
  getDirectory?: () => Promise<FileSystemDirectoryHandle>;
};

const TEMP_FILE_NAME = "localization_temp.csv";
const TEMP_STORAGE_KEY = "locax-temp-csv-fallback";
let opfsRootHandlePromise: Promise<FileSystemDirectoryHandle> | null = null;

export async function exportSourceCSV(
  languages: string[],
  rows: LocalizationRow[],
  projectName: string
): Promise<void> {
  try {
    const csvContent = serializeSourceCSV(languages, rows);
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${projectName}_Localization.csv`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Error exporting CSV:', error);
    throw new Error('Failed to export CSV file');
  }
}

export function checkFileSystemSupport(): boolean {
  return 'showDirectoryPicker' in window;
}

export async function writeCSVToFile(
  fileHandle: FileSystemFileHandle | null,
  languages: string[],
  rows: LocalizationRow[],
  csvContentOverride?: string
): Promise<void> {
  if (!fileHandle) {
    console.log('Sample mode: Changes not saved to disk');
    return;
  }

  try {
    const csvContent = csvContentOverride ?? serializeCSV(languages, rows);
    const writable = await fileHandle.createWritable();
    await writable.write(csvContent);
    await writable.close();
  } catch (error) {
    console.error('Error writing CSV:', error);
    throw new Error('Failed to write CSV file');
  }
}

export function getSampleData(): { languages: string[]; rows: LocalizationRow[] } {
  return {
    languages: ['en', 'es', 'ja'],
    rows: [
      {
        key: 'ui:start_button',
        context: 'Main menu start button',
        translations: {
          en: 'Start Game',
          es: 'Empezar Juego',
          ja: 'ゲームを開始'
        }
      },
      {
        key: 'ui:quit_button',
        context: 'Main menu quit button',
        translations: {
          en: 'Quit',
          es: 'Salir',
          ja: '終了'
        }
      },
      {
        key: 'weapon:fire',
        context: 'Action text for shooting',
        translations: {
          en: 'Fire',
          es: 'Fuego',
          ja: '火'
        }
      },
      {
        key: 'dialog:greeting',
        context: 'NPC initial greeting',
        translations: {
          en: 'Hello, traveler!',
          es: '¡Hola, viajero!',
          ja: 'こんにちは、旅人！'
        }
      },
      {
        key: 'dialog:farewell',
        context: 'NPC goodbye message',
        translations: {
          en: 'Farewell.',
          es: 'Adiós.',
          ja: 'さらばだ。'
        }
      },
      {
        key: 'item:potion',
        context: 'Consumable health item',
        translations: {
          en: 'Health Potion',
          es: 'Poción de Salud',
          ja: '体力ポーション'
        }
      },
      {
        key: 'menu:settings',
        context: 'Title for settings screen',
        translations: {
          en: 'Settings',
          es: 'Ajustes',
          ja: '設定'
        }
      },
      {
        key: 'hud:ammo',
        context: 'Heads-up display ammo count',
        translations: {
          en: 'Ammo',
          es: 'Munición',
          ja: '弾薬'
        }
      }
    ]
  };
}

async function getOpfsRoot(): Promise<FileSystemDirectoryHandle> {
  if (opfsRootHandlePromise) {
    return opfsRootHandlePromise;
  }

  const storage =
    typeof navigator !== "undefined"
      ? ((navigator.storage as StorageManagerWithDirectory) ?? undefined)
      : undefined;
  if (!storage?.getDirectory) {
    throw new Error("Origin private file system is not supported in this browser.");
  }

  opfsRootHandlePromise = storage.getDirectory();
  return opfsRootHandlePromise;
}

export async function writeTempLocalizationFile(languages: string[], rows: LocalizationRow[]): Promise<void> {
  const csvContent = serializeCSV(languages, rows);

  try {
    const root = await getOpfsRoot();
    const handle = await root.getFileHandle(TEMP_FILE_NAME, { create: true });
    const writable = await handle.createWritable();
    await writable.write(csvContent);
    await writable.close();
  } catch (error) {
    console.warn("Falling back to localStorage for temp localization file.", error);
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(TEMP_STORAGE_KEY, csvContent);
    }
  }
}

export async function readTempLocalizationFile(): Promise<string | null> {
  try {
    const root = await getOpfsRoot();
    const handle = await root.getFileHandle(TEMP_FILE_NAME, { create: false });
    const file = await handle.getFile();
    return await file.text();
  } catch (error) {
    const fallback = typeof localStorage !== "undefined" ? localStorage.getItem(TEMP_STORAGE_KEY) : null;
    return fallback || null;
  }
}
