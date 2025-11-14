import { Button } from "@/components/ui/button";
import { Sparkles, Upload } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { ProjectState, GitStatus } from "@/types/locax";
import { parseSourceFile } from "@/lib/source-file-parser";
import { detectGitBranch } from "@/lib/git-utils";
import { checkFileSystemSupport, getSampleData } from "@/lib/file-system";
import { getStoredAiProvider, getStoredApiKey, getStoredModel, getStoredEndpoint } from "@/lib/ai-config";

interface WelcomeScreenProps {
  onProjectLoad: (state: ProjectState) => void;
}

interface DirectoryPickerOptions {
  id?: string;
  mode?: "read" | "readwrite";
  startIn?:
    | FileSystemDirectoryHandle
    | FileSystemHandle
    | "desktop"
    | "documents"
    | "downloads"
    | "music"
    | "pictures"
    | "videos";
}

type DirectoryPicker = (options?: DirectoryPickerOptions) => Promise<FileSystemDirectoryHandle>;
type OpenFilePicker = (options?: OpenFilePickerOptions) => Promise<FileSystemFileHandle[]>;

const getDirectoryPicker = (): DirectoryPicker | undefined => {
  if (typeof window === "undefined") return undefined;
  return (window as typeof window & { showDirectoryPicker?: DirectoryPicker }).showDirectoryPicker;
};

const getFilePicker = (): OpenFilePicker | undefined => {
  if (typeof window === "undefined") return undefined;
  return (window as typeof window & { showOpenFilePicker?: OpenFilePicker }).showOpenFilePicker;
};

export const WelcomeScreen = ({ onProjectLoad }: WelcomeScreenProps) => {
  const { toast } = useToast();
  const hasFileSystemSupport = checkFileSystemSupport();

  const handleTrySample = () => {
    const { languages, rows } = getSampleData();
    const aiProvider = getStoredAiProvider();
    const aiApiKey = getStoredApiKey(aiProvider) || undefined;
    const aiModel = getStoredModel(aiProvider) || undefined;
    const aiEndpoint = getStoredEndpoint(aiProvider) || undefined;
    
    onProjectLoad({
      folderHandle: null,
      csvFileHandle: null,
      projectName: 'sample-game-project',
      gitBranch: 'main',
      gitStatus: "found",
      languages,
      rows,
      aiApiKey,
      aiProvider,
      aiModel,
      aiEndpoint,
    });

    toast({
      title: "Sample project loaded",
      description: "Exploring with demo data. Changes won't be saved.",
    });
  };

  const requestRepoContext = async (): Promise<{
    folderHandle: FileSystemDirectoryHandle | null;
    gitBranch: string | null;
    gitStatus: GitStatus;
  }> => {
    const showDirectoryPicker = getDirectoryPicker();
    if (!hasFileSystemSupport || !showDirectoryPicker) {
      return { folderHandle: null, gitBranch: null, gitStatus: "unknown" };
    }

    try {
      toast({
        title: "Select project folder",
        description: "Choose the folder that contains your .git directory to show the Git branch.",
      });

      const folderHandle = await showDirectoryPicker({
        id: "locax-project-folder",
        mode: "read",
      });

      const gitBranch = await detectGitBranch(folderHandle);

      if (!gitBranch) {
        toast({
          title: "Git repository not found",
          description: "Select the repository root so Locax can read the current branch.",
          variant: "destructive",
        });
      }

      return { folderHandle, gitBranch, gitStatus: gitBranch ? "found" : "missing" };
    } catch (error) {
      console.info("Project folder selection cancelled", error);
      return { folderHandle: null, gitBranch: null, gitStatus: "unknown" };
    }
  };

  const handleImportSource = async () => {
    try {
      const openFilePicker = getFilePicker();
      if (openFilePicker) {
        const [fileHandle] = await openFilePicker({
          multiple: false,
          types: [
            {
              description: "Localization files",
              accept: {
                "text/csv": [".csv"],
                "application/vnd.ms-excel": [".xls"],
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
              },
            },
          ],
          excludeAcceptAllOption: true,
        });

        if (!fileHandle) return;

        await fileHandle.requestPermission?.({ mode: "readwrite" });

        const file = await fileHandle.getFile();
        await importProjectFromFile(file, fileHandle);
      } else {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".csv,.xlsx,.xls";

        input.onchange = async (e) => {
          const file = (e.target as HTMLInputElement).files?.[0];
          if (!file) return;
          await importProjectFromFile(file, null);
        };

        input.click();
      }
    } catch (error) {
      if ((error as DOMException)?.name === "AbortError") {
        return;
      }
      toast({
        title: "Import failed",
        description: (error as Error).message,
        variant: "destructive",
      });
    }
  };

  const importProjectFromFile = async (file: File, fileHandle: FileSystemFileHandle | null) => {
    const { languages, rows } = await parseSourceFile(file);
    const projectBaseName = file.name.replace(/\.(csv|xlsx|xls)$/i, "");

    const aiProvider = getStoredAiProvider();
    const aiApiKey = getStoredApiKey(aiProvider) || undefined;
    const aiModel = getStoredModel(aiProvider) || undefined;
    const aiEndpoint = getStoredEndpoint(aiProvider) || undefined;

    const { folderHandle, gitBranch, gitStatus } = await requestRepoContext();

    onProjectLoad({
      folderHandle,
      csvFileHandle: fileHandle,
      projectName: projectBaseName || file.name,
      gitBranch,
      gitStatus,
      languages,
      rows,
      aiApiKey,
      aiProvider,
      aiModel,
      aiEndpoint,
    });

    toast({
      title: "Source file imported",
      description:
        gitStatus === "found" && gitBranch
          ? `Loaded ${rows.length} keys (branch: ${gitBranch}).`
          : `Loaded ${rows.length} keys. Use File > Export to save changes.`,
    });
  };

  return (
    <div className="flex items-center justify-center h-screen bg-background">
      <div className="text-center space-y-6 max-w-md">
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center">
            <svg className="w-7 h-7 text-primary-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2L2 7l10 5 10-5-10-5z"/>
              <path d="M2 17l10 5 10-5"/>
              <path d="M2 12l10 5 10-5"/>
            </svg>
          </div>
          <h1 className="text-4xl font-bold">Locax</h1>
        </div>
        
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold">Game Translation Management</h2>
          <p className="text-muted-foreground">
            Open your game project folder to start managing localization keys, 
            translations, and screenshots with AI assistance.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <Button 
            size="lg" 
            onClick={handleImportSource}
            className="gap-2"
          >
            <Upload className="w-5 h-5" />
            Import Source CSV / Excel
          </Button>

          <Button 
            size="lg"
            variant="outline"
            onClick={handleTrySample}
            className="gap-2"
          >
            <Sparkles className="w-5 h-5" />
            Try Sample Project
          </Button>
        </div>

        <div className="text-sm text-muted-foreground pt-4">
          <p>Import your game's source localization CSV or Excel file to get started.</p>
          <p>All changes can be exported back to the source format.</p>
        </div>
      </div>
    </div>
  );
};
