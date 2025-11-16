import type { ColumnMetadata, LocalizationRow } from "@/types/locax";

const DEFAULT_LANGUAGE_HEADERS: Record<string, string> = {
  en: "English",
  de: "Deutsch [de]",
  fr: "Français [fr]",
  es: "Español [es]",
  ja: "日本語 [ja]",
  ko: "한국어 [ko]",
};

export interface SourceCSVParseResult {
  languages: string[];
  rows: LocalizationRow[];
  header: string[];
  languageColumnMap: Record<string, ColumnMetadata>;
  descColumn?: ColumnMetadata;
  typeColumn?: ColumnMetadata;
  rowMap: Record<string, number>;
}

export interface SerializeSourceCSVOptions {
  languages: string[];
  rows: LocalizationRow[];
  header?: string[];
  languageColumnMap?: Record<string, ColumnMetadata>;
  descColumn?: ColumnMetadata;
  typeColumn?: ColumnMetadata;
}

export interface SerializedSourceCSVResult {
  content: string;
  header: string[];
  languageColumnMap: Record<string, ColumnMetadata>;
  descColumn: ColumnMetadata;
  typeColumn: ColumnMetadata;
}

// Parse source CSV format (Key, Type, Desc, English, Deutsch [de], etc.)
export function parseSourceCSV(csvContent: string): SourceCSVParseResult {
  const normalized = stripBom(csvContent);
  const lines = normalized.trim().split(/\r?\n/);
  if (lines.length < 2) {
    throw new Error('CSV must have at least a header row and one data row');
  }

  // Parse header - handle format like "Deutsch [de]"
  const header = parseCSVLine(lines[0]);
  const keyIndex = header.findIndex(h => h.toLowerCase() === 'key');
  const descIndex = header.findIndex(h => h.toLowerCase() === 'desc');
  const typeIndex = header.findIndex(h => h.toLowerCase() === 'type');
  const englishIndex = header.findIndex(h => h.toLowerCase() === 'english');
  
  if (keyIndex === -1 || englishIndex === -1) {
    throw new Error('CSV must have "Key" and "English" columns');
  }

  // Extract language codes from headers like "Deutsch [de]" or "English"
  const languages: string[] = ['en'];
  const languageColumnMap: Record<string, ColumnMetadata> = {
    en: { index: englishIndex, header: header[englishIndex] }
  };
  const languageIndices: { code: string; index: number; header: string }[] = [
    { code: 'en', index: englishIndex, header: header[englishIndex] }
  ];
  
  header.forEach((h, i) => {
    if (i === keyIndex || i === descIndex || i === typeIndex || i === englishIndex) return;
    
    // Extract language code from format "Language [code]"
    const match = h.match(/\[(\w+)\]/i);
    if (match) {
      const code = match[1].toLowerCase();
      languages.push(code);
      languageIndices.push({ code, index: i, header: h });
      languageColumnMap[code] = { index: i, header: h };
    }
  });

  // Parse rows
  const rows: LocalizationRow[] = [];
  const rowMap: Record<string, number> = {};
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    
    const values = parseCSVLine(lines[i]);
    if (values.length < 2) continue;

    const key = values[keyIndex] || '';
    if (!key) continue;

    const description = descIndex >= 0 ? values[descIndex] || '' : '';
    const context = description;
    const rowType = typeIndex >= 0 ? values[typeIndex] || 'Text' : 'Text';
    const translations: Record<string, string> = {};

    languageIndices.forEach(({ code, index }) => {
      translations[code] = values[index] || '';
    });

    rows.push({ key, description, context, translations, type: rowType });
    rowMap[key] = i + 1; // include header row for compatibility with Excel indices
  }

  const descColumn = descIndex >= 0 ? { index: descIndex, header: header[descIndex] } : undefined;
  const typeColumn = typeIndex >= 0 ? { index: typeIndex, header: header[typeIndex] } : undefined;

  return { languages, rows, header, languageColumnMap, descColumn, typeColumn, rowMap };
}

// Parse internal CSV format (key, context, en, es, ja, etc.)
export function parseCSV(csvContent: string): { languages: string[]; rows: LocalizationRow[] } {
  const normalized = stripBom(csvContent);
  const lines = normalized.trim().split(/\r?\n/);
  if (lines.length < 2) {
    throw new Error('CSV must have at least a header row and one data row');
  }

  const header = parseCSVLine(lines[0]);
  const keyIndex = header.indexOf('key');
  const typeIndex = header.indexOf('type');
  const descriptionIndex = header.indexOf('description');
  const contextIndex = header.indexOf('context');
  
  if (keyIndex === -1) {
    throw new Error('CSV must have a "key" column');
  }

  const languages = header.filter((_, i) =>
    i !== keyIndex && i !== typeIndex && i !== descriptionIndex && i !== contextIndex
  );

  const rows: LocalizationRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length < header.length) continue;

    const key = values[keyIndex];
    const rowType = typeIndex >= 0 ? values[typeIndex] || 'Text' : 'Text';
    const description = descriptionIndex >= 0 ? values[descriptionIndex] || '' : '';
    const context = contextIndex >= 0 ? values[contextIndex] || description : description;
    const translations: Record<string, string> = {};

    languages.forEach((lang, idx) => {
      const valueIndex = header.indexOf(lang);
      translations[lang] = values[valueIndex] || '';
    });

    rows.push({ key, description, context, translations, type: rowType });
  }

  return { languages, rows };
}

// Helper to parse CSV line with proper quote handling
export function parseCSVLine(rawLine: string): string[] {
  const line = rawLine.replace(/\r$/, "");
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
  const header = ['key', 'type', 'description', 'context', ...languages];
  
  const dataRows = rows.map(row => {
    const values = [
      escapeCSVField(row.key),
      escapeCSVField(row.type ?? 'Text'),
      escapeCSVField(row.description ?? row.context ?? ''),
      escapeCSVField(row.context ?? ''),
      ...languages.map(lang => escapeCSVField(row.translations[lang] || ''))
    ];
    return values.join(',');
  });

  return [header.join(','), ...dataRows].join('\n');
}

// Serialize to source format (Key, Type, Desc, English, Deutsch [de], etc.)
export function serializeSourceCSV(options: SerializeSourceCSVOptions): SerializedSourceCSVResult {
  const { languages, rows, header, languageColumnMap, descColumn, typeColumn } = options;
  const headerValues = header ? [...header] : [];
  const keyIndex = ensureKeyColumn(headerValues);
  const resolvedTypeColumn = ensureColumn(headerValues, typeColumn, "Type");
  const resolvedDescColumn = ensureColumn(headerValues, descColumn, "Desc");
  const resolvedLanguageMap = ensureLanguageColumns(headerValues, languages, languageColumnMap);

  const dataRows = rows.map(row => {
    const values = new Array(headerValues.length).fill('');
    values[keyIndex] = escapeCSVField(row.key);
    values[resolvedTypeColumn.index] = escapeCSVField(row.type ?? 'Text');
    values[resolvedDescColumn.index] = escapeCSVField(row.description ?? row.context ?? '');

    languages.forEach(lang => {
      const column = resolvedLanguageMap[lang];
      values[column.index] = escapeCSVField(row.translations[lang] ?? '');
    });

    return values.join(',');
  });

  return {
    content: [headerValues.join(','), ...dataRows].join('\n'),
    header: headerValues,
    languageColumnMap: resolvedLanguageMap,
    descColumn: resolvedDescColumn,
    typeColumn: resolvedTypeColumn,
  };
}

// Helper to escape CSV fields
function escapeCSVField(field: string): string {
  if (!field) return '';
  
  if (field.includes(',') || field.includes('"') || field.includes('\n')) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  
  return field;
}

function ensureKeyColumn(header: string[]): number {
  const existingIndex = findColumnIndex(header, 'key');
  if (existingIndex !== -1) {
    return existingIndex;
  }

  header.unshift('Key');
  return 0;
}

function ensureColumn(header: string[], metadata: ColumnMetadata | undefined, fallbackHeader: string): ColumnMetadata {
  if (metadata) {
    const directIndex = header.findIndex(h => h === metadata.header);
    if (directIndex !== -1) {
      return { index: directIndex, header: header[directIndex] };
    }
  }

  const caseInsensitiveIndex = findColumnIndex(header, fallbackHeader);
  if (caseInsensitiveIndex !== -1) {
    return { index: caseInsensitiveIndex, header: header[caseInsensitiveIndex] };
  }

  const headerLabel = metadata?.header ?? fallbackHeader;
  header.push(headerLabel);
  return { index: header.length - 1, header: headerLabel };
}

function ensureLanguageColumns(
  header: string[],
  languages: string[],
  columnMap?: Record<string, ColumnMetadata>
): Record<string, ColumnMetadata> {
  const resolved: Record<string, ColumnMetadata> = {};

  languages.forEach(lang => {
    const preferred = columnMap?.[lang];
    if (preferred) {
      const directIndex = header.findIndex(h => h === preferred.header);
      if (directIndex !== -1) {
        resolved[lang] = { index: directIndex, header: header[directIndex] };
        return;
      }
    }

    const patternIndex = header.findIndex(h => new RegExp(`\\[${escapeRegex(lang)}\\]`, 'i').test(h));
    if (patternIndex !== -1) {
      resolved[lang] = { index: patternIndex, header: header[patternIndex] };
      return;
    }

    const headerLabel = preferred?.header ?? getLanguageHeaderLabel(lang);
    header.push(headerLabel);
    resolved[lang] = { index: header.length - 1, header: headerLabel };
  });

  return resolved;
}

function getLanguageHeaderLabel(code: string): string {
  return DEFAULT_LANGUAGE_HEADERS[code] || `${code} [${code}]`;
}

function findColumnIndex(header: string[], target: string): number {
  return header.findIndex(h => h.toLowerCase() === target.toLowerCase());
}

function stripBom(value: string): string {
  return value.replace(/^\uFEFF/, '');
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
