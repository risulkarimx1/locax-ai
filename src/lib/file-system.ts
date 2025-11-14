import { serializeCSV, serializeSourceCSV } from "./csv-parser";
import type { LocalizationRow } from "@/types/locax";

export async function writeCSVToFile(
  fileHandle: FileSystemFileHandle | null,
  languages: string[],
  rows: LocalizationRow[]
): Promise<void> {
  if (!fileHandle) {
    console.log('Sample mode: Changes not saved to disk');
    return;
  }

  try {
    const csvContent = serializeCSV(languages, rows);
    const writable = await fileHandle.createWritable();
    await writable.write(csvContent);
    await writable.close();
  } catch (error) {
    console.error('Error writing CSV:', error);
    throw new Error('Failed to write CSV file');
  }
}

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
