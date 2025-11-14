import type { LocalizationRow } from "@/types/locax";

export function parseCSV(csvContent: string): { languages: string[]; rows: LocalizationRow[] } {
  const lines = csvContent.trim().split('\n');
  if (lines.length < 2) {
    throw new Error('CSV must have at least a header row and one data row');
  }

  // Parse header
  const header = lines[0].split(',').map(h => h.trim());
  const keyIndex = header.indexOf('key');
  const contextIndex = header.indexOf('context');
  
  if (keyIndex === -1) {
    throw new Error('CSV must have a "key" column');
  }

  // Extract language codes (all columns except key and context)
  const languages = header.filter((h, i) => i !== keyIndex && i !== contextIndex);

  // Parse rows
  const rows: LocalizationRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim());
    if (values.length < header.length) continue;

    const key = values[keyIndex];
    const context = contextIndex >= 0 ? values[contextIndex] : '';
    const translations: Record<string, string> = {};

    languages.forEach((lang, idx) => {
      const valueIndex = header.indexOf(lang);
      translations[lang] = values[valueIndex] || '';
    });

    rows.push({ key, context, translations });
  }

  return { languages, rows };
}

export function serializeCSV(languages: string[], rows: LocalizationRow[]): string {
  // Header
  const header = ['key', 'context', ...languages].join(',');
  
  // Rows
  const dataRows = rows.map(row => {
    const values = [
      row.key,
      row.context,
      ...languages.map(lang => row.translations[lang] || '')
    ];
    return values.join(',');
  });

  return [header, ...dataRows].join('\n');
}
