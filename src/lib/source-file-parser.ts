import * as XLSX from "xlsx";
import { parseSourceCSV } from "./csv-parser";
import type { LocalizationRow } from "@/types/locax";

export type LocalizationImport = { languages: string[]; rows: LocalizationRow[] };

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
    return parseSourceCSV(csvContent);
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

  const csvContent = XLSX.utils.sheet_to_csv(worksheet, { blankrows: false });

  if (!csvContent.trim()) {
    throw new Error("Excel worksheet does not contain any data.");
  }

  return parseSourceCSV(csvContent);
}
