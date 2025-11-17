import * as XLSX from "xlsx";
import type { ColumnMetadata, LocalizationRow, SourceFileType } from "@/types/locax";
import { serializeSourceCSV } from "./csv-parser";

const UTF8_BOM = "\uFEFF";

export interface WriteSourceFileOptions {
  fileHandle: FileSystemFileHandle;
  fileType: SourceFileType;
  languages: string[];
  rows: LocalizationRow[];
  header?: string[];
  languageColumnMap?: Record<string, ColumnMetadata>;
  descColumn?: ColumnMetadata;
  typeColumn?: ColumnMetadata;
  workbookRowMap?: Record<string, number>;
}

export interface WriteSourceFileResult {
  header?: string[];
  languageColumnMap?: Record<string, ColumnMetadata>;
  descColumn?: ColumnMetadata;
  typeColumn?: ColumnMetadata;
  workbookRowMap?: Record<string, number>;
  lastModified?: number;
}

export async function writeSourceFile(options: WriteSourceFileOptions): Promise<WriteSourceFileResult> {
  if (options.fileType === "csv") {
    return writeCsvSource(options);
  }

  return writeXlsxSource(options);
}

async function writeCsvSource({
  fileHandle,
  languages,
  rows,
  header,
  languageColumnMap,
  descColumn,
  typeColumn,
  workbookRowMap,
}: WriteSourceFileOptions): Promise<WriteSourceFileResult> {
  const serialized = serializeSourceCSV({
    languages,
    rows,
    header,
    languageColumnMap,
    descColumn,
    typeColumn,
  });
  const writable = await fileHandle.createWritable();
  await writable.write(UTF8_BOM + serialized.content);
  await writable.close();
  const updatedFile = await fileHandle.getFile();

  return {
    header: serialized.header,
    languageColumnMap: serialized.languageColumnMap,
    descColumn: serialized.descColumn,
    typeColumn: serialized.typeColumn,
    workbookRowMap,
    lastModified: updatedFile.lastModified,
  };
}

async function writeXlsxSource({
  fileHandle,
  languages,
  rows,
  header,
  languageColumnMap,
  descColumn,
  typeColumn,
  workbookRowMap,
}: WriteSourceFileOptions): Promise<WriteSourceFileResult> {
  const file = await fileHandle.getFile();
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error("Workbook has no sheets.");
  }

  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    throw new Error("Could not read the first worksheet.");
  }

  const headerValues = header ? [...header] : readHeaderRow(sheet);
  if (!headerValues.length) {
    headerValues.push(...buildDefaultHeader(languages, languageColumnMap));
  }

  const keyIndex = headerValues.findIndex(h => h.toLowerCase() === "key");
  const resolvedKeyIndex = keyIndex >= 0 ? keyIndex : 0;

  const updatedLanguageMap: Record<string, ColumnMetadata> = { ...(languageColumnMap ?? {}) };
  let resolvedDescColumn = descColumn ?? findColumn(headerValues, "desc");
  let resolvedTypeColumn = typeColumn ?? findColumn(headerValues, "type");

  if (!resolvedTypeColumn) {
    resolvedTypeColumn = { index: headerValues.length, header: "Type" };
    headerValues.push("Type");
  }

  if (!resolvedDescColumn) {
    resolvedDescColumn = { index: headerValues.length, header: "Desc" };
    headerValues.push("Desc");
  }

  languages.forEach(lang => {
    if (!updatedLanguageMap[lang]) {
      updatedLanguageMap[lang] = { index: headerValues.length, header: lang };
      headerValues.push(lang);
    }
  });

  headerValues.forEach((text, columnIndex) => {
    setCellValue(sheet, 0, columnIndex, text);
  });

  const existingRowMap = normalizeWorkbookRowMap(workbookRowMap);
  const updatedRowMap: Record<string, number> = {};
  const usedRowIndices: number[] = [];
  const columnsToClear = getColumnIndicesToClear(
    resolvedKeyIndex,
    resolvedTypeColumn!.index,
    resolvedDescColumn!.index,
    updatedLanguageMap
  );

  const existingIndices = Object.values(existingRowMap);
  let nextRowIndex = existingIndices.length ? Math.max(...existingIndices) + 1 : 1;

  rows.forEach(row => {
    const rowIndex = existingRowMap[row.key] ?? nextRowIndex++;
    updatedRowMap[row.key] = rowIndex;
    usedRowIndices.push(rowIndex);

    setCellValue(sheet, rowIndex, resolvedKeyIndex, row.key);
    setCellValue(sheet, rowIndex, resolvedTypeColumn!.index, row.type ?? "Text");
    setCellValue(sheet, rowIndex, resolvedDescColumn!.index, row.description ?? "");

    languages.forEach(lang => {
      const column = updatedLanguageMap[lang];
      setCellValue(sheet, rowIndex, column.index, row.translations[lang] ?? "");
    });
  });

  // Clear rows that no longer exist according to the previous workbook map
  Object.entries(existingRowMap).forEach(([key, rowIndex]) => {
    if (updatedRowMap[key] !== undefined) return;
    clearRow(sheet, rowIndex, columnsToClear);
  });

  // Remove duplicate/stale rows by scanning for keys that do not match the canonical row index
  const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1:A1");
  for (let rowIndex = 1; rowIndex <= range.e.r; rowIndex++) {
    const keyCellValue = getCellStringValue(sheet, rowIndex, resolvedKeyIndex);
    if (!keyCellValue) continue;

    const canonicalIndex = updatedRowMap[keyCellValue];
    if (canonicalIndex === undefined || canonicalIndex !== rowIndex) {
      clearRow(sheet, rowIndex, columnsToClear);
    }
  }

  const maxRowIndex = usedRowIndices.length ? Math.max(...usedRowIndices) : 0;
  const maxColumnIndex = headerValues.length - 1;
  sheet["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(maxRowIndex, 0), c: Math.max(maxColumnIndex, 0) } });

  const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
  const writable = await fileHandle.createWritable();
  await writable.write(buffer);
  await writable.close();
  const updatedFile = await fileHandle.getFile();

  return {
    header: headerValues,
    languageColumnMap: updatedLanguageMap,
    descColumn: resolvedDescColumn,
    typeColumn: resolvedTypeColumn,
    workbookRowMap: updatedRowMap,
    lastModified: updatedFile.lastModified,
  };
}

function buildDefaultHeader(languages: string[], columnMap?: Record<string, ColumnMetadata>): string[] {
  const languageHeaders = languages.map(lang => columnMap?.[lang]?.header ?? lang);
  return ["Key", "Type", "Desc", ...languageHeaders];
}

function readHeaderRow(sheet: XLSX.WorkSheet): string[] {
  const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1:A1");
  const headers: string[] = [];
  for (let col = range.s.c; col <= range.e.c; col++) {
    const cell = sheet[XLSX.utils.encode_cell({ r: 0, c: col })];
    const value = cell?.v;
    headers.push(typeof value === "string" ? value : value != null ? String(value) : "");
  }
  return headers;
}

function findColumn(header: string[], match: string): ColumnMetadata | undefined {
  const index = header.findIndex(h => h.toLowerCase() === match.toLowerCase());
  if (index === -1) {
    return undefined;
  }
  return { index, header: header[index] };
}

function setCellValue(sheet: XLSX.WorkSheet, rowIndex: number, columnIndex: number, value: string | undefined) {
  const address = XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex });
  if (value === undefined || value === "") {
    delete sheet[address];
    return;
  }
  sheet[address] = { t: "s", v: value };
}

function clearRow(sheet: XLSX.WorkSheet, rowIndex: number, columnIndices: number[]) {
  columnIndices.forEach(columnIndex => {
    const address = XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex });
    delete sheet[address];
  });
}

function getColumnIndicesToClear(
  keyIndex: number,
  typeIndex: number,
  descIndex: number,
  languageMap: Record<string, ColumnMetadata>
): number[] {
  const columns = [keyIndex, typeIndex, descIndex, ...Object.values(languageMap).map(col => col.index)];
  const seen = new Set<number>();
  columns.forEach(index => {
    if (index >= 0) {
      seen.add(index);
    }
  });
  return Array.from(seen.values()).sort((a, b) => a - b);
}

function getCellStringValue(sheet: XLSX.WorkSheet, rowIndex: number, columnIndex: number): string {
  const address = XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex });
  const cell = sheet[address];
  if (cell?.v === undefined || cell.v === null) {
    return "";
  }
  return typeof cell.v === "string" ? cell.v.trim() : String(cell.v).trim();
}

function normalizeWorkbookRowMap(rowMap?: Record<string, number>): Record<string, number> {
  if (!rowMap) {
    return {};
  }

  const entries = Object.entries(rowMap);
  if (!entries.length) {
    return {};
  }

  const values = entries.map(([, rowIndex]) => rowIndex);
  const looksLegacy = values.length > 0 && Math.min(...values) >= 2;
  if (!looksLegacy) {
    return { ...rowMap };
  }

  const normalized: Record<string, number> = {};
  entries.forEach(([key, rowIndex]) => {
    normalized[key] = Math.max(1, rowIndex - 1);
  });
  return normalized;
}

export function createBlankWorkbookBuffer(languages: string[], columnMap?: Record<string, ColumnMetadata>): ArrayBuffer {
  const workbook = XLSX.utils.book_new();
  const header = buildDefaultHeader(languages, columnMap);
  const sheet = XLSX.utils.aoa_to_sheet([header]);
  XLSX.utils.book_append_sheet(workbook, sheet, "Localization");
  return XLSX.write(workbook, { bookType: "xlsx", type: "array" });
}
