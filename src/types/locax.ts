export type AIProvider = "openai" | "gemini" | "openrouter" | "ollama";
export type GitStatus = "unknown" | "found" | "missing";

export interface LocalizationRow {
  key: string; // format: category:keyname
  context: string;
  translations: Record<string, string>; // language code -> text
  screenshot?: string; // base64 or URL
  linkedKeys?: string[]; // other keys that share this screenshot
}

export interface ProjectState {
  folderHandle: FileSystemDirectoryHandle | null;
  csvFileHandle: FileSystemFileHandle | null;
  projectName: string;
  gitBranch: string | null;
  gitStatus?: GitStatus;
  languages: string[]; // ['en', 'es', 'ja', ...]
  rows: LocalizationRow[];
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
