/// <reference types="vite/client" />

interface DesktopAppContext {
  platform?: string;
  openPath?: (targetPath: string) => Promise<void>;
  selectDirectory?: (options?: { title?: string; defaultPath?: string; message?: string }) => Promise<string | null>;
}

declare global {
  interface Window {
    desktopApp?: DesktopAppContext;
  }
}
