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
  languages: string[]; // ['en', 'es', 'ja', ...]
  rows: LocalizationRow[];
  aiApiKey?: string;
}

export interface CategoryNode {
  name: string;
  keys: string[];
  expanded: boolean;
}
