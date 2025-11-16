export type AIProvider = "openai" | "gemini" | "openrouter" | "ollama";
export type GitStatus = "unknown" | "found" | "missing";

export interface LocalizationRow {
  key: string; // format: category:keyname
  description: string; // mirrors the Desc column in the source sheet
  context: string; // stored in localization_meta.csv
  translations: Record<string, string>; // language code -> text
  screenshot?: string; // base64 or URL
  linkedKeys?: string[]; // other keys that share this screenshot
  notes?: string; // future-proof field for additional metadata
  type?: string; // mirrors the Type column in the source sheet
}

export type SourceFileType = "csv" | "xlsx";

export interface ColumnMetadata {
  index: number;
  header: string;
}

export interface ProjectState {
  folderHandle: FileSystemDirectoryHandle | null;
  sourceFileHandle: FileSystemFileHandle | null;
  metaFileHandle: FileSystemFileHandle | null;
  sourceFileType: SourceFileType;
  metaExists: boolean;
  sourceDirty: boolean;
  metaDirty: boolean;
  projectName: string;
  gitBranch: string | null;
  gitStatus?: GitStatus;
  languages: string[]; // ['en', 'es', 'ja', ...]
  rows: LocalizationRow[];
  workbookRowMap?: Record<string, number>;
  languageColumnMap?: Record<string, ColumnMetadata>;
  sourceHeaders?: string[];
  descColumn?: ColumnMetadata;
  typeColumn?: ColumnMetadata;
  sourceLastModified?: number;
  metaLastModified?: number;
  aiApiKey?: string;
  aiProvider?: AIProvider;
  aiModel?: string;
  aiEndpoint?: string;
}

export interface CategoryNode {
  name: string;
  keys: string[];
  expanded: boolean;
}
