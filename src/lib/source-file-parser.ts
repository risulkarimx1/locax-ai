import * as XLSX from "xlsx";
import { parseSourceCSV, type SourceCSVParseResult } from "./csv-parser";
import type { ColumnMetadata, LocalizationRow, SourceFileType } from "@/types/locax";

export interface LocalizationImport {
  languages: string[];
  rows: LocalizationRow[];
  header: string[];
  languageColumnMap: Record<string, ColumnMetadata>;
  descColumn?: ColumnMetadata;
  typeColumn?: ColumnMetadata;
  workbookRowMap?: Record<string, number>;
  sourceFileType: SourceFileType;
}

/**
 * Normalize CSV or Excel files into the localization payload expected by the app.
 */
export async function parseSourceFile(file: File): Promise<LocalizationImport> {
  const extension = getFileExtension(file.name);

  if (isExcelFile(extension, file.type)) {
    return parseExcelFile(file);
  }

  if (isCsvFile(extension, file.type)) {
    const csvContent = await file.text();
    const parsed = parseSourceCSV(csvContent);
    return {
      languages: parsed.languages,
      rows: parsed.rows,
      header: parsed.header,
      languageColumnMap: parsed.languageColumnMap,
      descColumn: parsed.descColumn,
      typeColumn: parsed.typeColumn,
      workbookRowMap: parsed.rowMap,
      sourceFileType: "csv",
    };
  }

  throw new Error("Unsupported file type. Please choose a CSV or Excel file.");
}

function getFileExtension(name: string): string | undefined {
  const parts = name.split(".");
  if (parts.length < 2) return undefined;
  return parts.pop()?.toLowerCase();
}

function isExcelFile(extension: string | undefined, mimeType: string): boolean {
  if (!extension && !mimeType) return false;

  return (
    extension === "xlsx" ||
    extension === "xls" ||
    mimeType === "application/vnd.ms-excel" ||
    mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
}

function isCsvFile(extension: string | undefined, mimeType: string): boolean {
  return extension === "csv" || mimeType === "text/csv";
}

async function parseExcelFile(file: File): Promise<LocalizationImport> {
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: "array" });
  const firstSheetName = workbook.SheetNames[0];

  if (!firstSheetName) {
    throw new Error("Excel workbook is empty.");
  }

  const worksheet = workbook.Sheets[firstSheetName];
  if (!worksheet) {
    throw new Error("Could not read the first worksheet in the Excel file.");
  }

  const sheetRows = XLSX.utils.sheet_to_json<(string | number | undefined)[]>(worksheet, {
    header: 1,
    blankrows: false,
    defval: "",
  });

  if (!sheetRows.length) {
    throw new Error("Excel worksheet does not contain any data.");
  }

  const header = sheetRows[0].map(cell => String(cell ?? "").trim());
  const keyIndex = header.findIndex(h => h.toLowerCase() === "key");
  const descIndex = header.findIndex(h => h.toLowerCase() === "desc");
  const typeIndex = header.findIndex(h => h.toLowerCase() === "type");
  const englishIndex = header.findIndex(h => h.toLowerCase() === "english");

  if (keyIndex === -1 || englishIndex === -1) {
    throw new Error('Excel sheet must include "Key" and "English" columns.');
  }

  const languages: string[] = ["en"];
  const languageColumnMap: Record<string, ColumnMetadata> = {
    en: { index: englishIndex, header: header[englishIndex] },
  };
  const languageIndices: { code: string; index: number; header: string }[] = [
    { code: "en", index: englishIndex, header: header[englishIndex] },
  ];

  header.forEach((h, i) => {
    if (i === keyIndex || i === descIndex || i === englishIndex) return;
    const match = h.match(/\[([a-z]{2})\]/i);
    if (match) {
      const code = match[1].toLowerCase();
      languages.push(code);
      languageIndices.push({ code, index: i, header: h });
      languageColumnMap[code] = { index: i, header: h };
    }
  });

  const rows: LocalizationRow[] = [];
  const workbookRowMap: Record<string, number> = {};

  for (let i = 1; i < sheetRows.length; i++) {
    const row = sheetRows[i];
    if (!row) continue;

    const rawKey = row[keyIndex];
    const key = typeof rawKey === "string" ? rawKey.trim() : String(rawKey ?? "").trim();
    if (!key) continue;

    const rawDesc = descIndex >= 0 ? row[descIndex] : "";
    const description = typeof rawDesc === "string" ? rawDesc : String(rawDesc ?? "");
    const rawType = typeIndex >= 0 ? row[typeIndex] : "Text";
    const rowType = typeof rawType === "string" ? rawType || "Text" : String(rawType ?? "Text");
    const translations: Record<string, string> = {};

    languageIndices.forEach(({ code, index }) => {
      const value = row[index];
      translations[code] = typeof value === "string" ? value : String(value ?? "");
    });

    rows.push({ key, description, context: description, translations, type: rowType });
    workbookRowMap[key] = i + 1; // Excel rows are 1-indexed
  }

  const descColumn = descIndex >= 0 ? { index: descIndex, header: header[descIndex] } : undefined;
  const typeColumn = typeIndex >= 0 ? { index: typeIndex, header: header[typeIndex] } : undefined;

  return {
    languages,
    rows,
    header,
    languageColumnMap,
    descColumn,
    typeColumn,
    workbookRowMap,
    sourceFileType: "xlsx",
  };
}
