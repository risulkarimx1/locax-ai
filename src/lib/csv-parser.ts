import type { LocalizationRow } from "@/types/locax";

// Parse source CSV format (Key, Type, Desc, English, Deutsch [de], etc.)
export function parseSourceCSV(csvContent: string): { languages: string[]; rows: LocalizationRow[] } {
  const lines = csvContent.trim().split('\n');
  if (lines.length < 2) {
    throw new Error('CSV must have at least a header row and one data row');
  }

  // Parse header - handle format like "Deutsch [de]"
  const header = parseCSVLine(lines[0]);
  const keyIndex = header.findIndex(h => h.toLowerCase() === 'key');
  const descIndex = header.findIndex(h => h.toLowerCase() === 'desc');
  const englishIndex = header.findIndex(h => h.toLowerCase() === 'english');
  
  if (keyIndex === -1 || englishIndex === -1) {
    throw new Error('CSV must have "Key" and "English" columns');
  }

  // Extract language codes from headers like "Deutsch [de]" or "English"
  const languages: string[] = ['en'];
  const languageIndices: { code: string; index: number }[] = [{ code: 'en', index: englishIndex }];
  
  header.forEach((h, i) => {
    if (i === keyIndex || i === descIndex || i === englishIndex) return;
    
    // Extract language code from format "Language [code]"
    const match = h.match(/\[([a-z]{2})\]/i);
    if (match) {
      const code = match[1].toLowerCase();
      languages.push(code);
      languageIndices.push({ code, index: i });
    }
  });

  // Parse rows
  const rows: LocalizationRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    
    const values = parseCSVLine(lines[i]);
    if (values.length < 2) continue;

    const key = values[keyIndex] || '';
    if (!key) continue;

    const context = descIndex >= 0 ? values[descIndex] || '' : '';
    const translations: Record<string, string> = {};

    languageIndices.forEach(({ code, index }) => {
      translations[code] = values[index] || '';
    });

    rows.push({ key, context, translations });
  }

  return { languages, rows };
}

// Parse internal CSV format (key, context, en, es, ja, etc.)
export function parseCSV(csvContent: string): { languages: string[]; rows: LocalizationRow[] } {
  const lines = csvContent.trim().split('\n');
  if (lines.length < 2) {
    throw new Error('CSV must have at least a header row and one data row');
  }

  const header = parseCSVLine(lines[0]);
  const keyIndex = header.indexOf('key');
  const contextIndex = header.indexOf('context');
  
  if (keyIndex === -1) {
    throw new Error('CSV must have a "key" column');
  }

  const languages = header.filter((h, i) => i !== keyIndex && i !== contextIndex);

  const rows: LocalizationRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
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

// Helper to parse CSV line with proper quote handling
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  
  return result;
}

// Serialize to internal format
export function serializeCSV(languages: string[], rows: LocalizationRow[]): string {
  const header = ['key', 'context', ...languages];
  
  const dataRows = rows.map(row => {
    const values = [
      escapeCSVField(row.key),
      escapeCSVField(row.context),
      ...languages.map(lang => escapeCSVField(row.translations[lang] || ''))
    ];
    return values.join(',');
  });

  return [header.join(','), ...dataRows].join('\n');
}

// Serialize to source format (Key, Type, Desc, English, Deutsch [de], etc.)
export function serializeSourceCSV(languages: string[], rows: LocalizationRow[]): string {
  // Build header with language names
  const languageNames: Record<string, string> = {
    en: 'English',
    de: 'Deutsch [de]',
    fr: 'Français [fr]',
    es: 'Español [es]',
    ja: '日本語 [ja]',
    ko: '한국어 [ko]',
  };
  
  const header = [
    'Key',
    'Type',
    'Desc',
    ...languages.map(lang => languageNames[lang] || `${lang} [${lang}]`)
  ];
  
  const dataRows = rows.map(row => {
    const values = [
      escapeCSVField(row.key),
      'Text', // Default type
      escapeCSVField(row.context),
      ...languages.map(lang => escapeCSVField(row.translations[lang] || ''))
    ];
    return values.join(',');
  });

  return [header.join(','), ...dataRows].join('\n');
}

// Helper to escape CSV fields
function escapeCSVField(field: string): string {
  if (!field) return '';
  
  if (field.includes(',') || field.includes('"') || field.includes('\n')) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  
  return field;
}
