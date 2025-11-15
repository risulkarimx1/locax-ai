import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Sparkles, Upload } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { ProjectState, GitStatus } from "@/types/locax";
import { parseSourceFile } from "@/lib/source-file-parser";
import { detectGitBranch } from "@/lib/git-utils";
import { checkFileSystemSupport, getSampleData } from "@/lib/file-system";
import { getStoredAiProvider, getStoredApiKey, getStoredModel, getStoredEndpoint } from "@/lib/ai-config";
import { ProjectViewer } from "@/components/locax/ProjectViewer";
import {
  getProjectReferences,
  markProjectOpened,
  removeProjectReference,
  saveProjectReference,
  type ProjectReference,
} from "@/lib/project-storage";

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

const buildAiSettings = () => {
  const aiProvider = getStoredAiProvider();
  return {
    aiProvider,
    aiApiKey: getStoredApiKey(aiProvider) || undefined,
    aiModel: getStoredModel(aiProvider) || undefined,
    aiEndpoint: getStoredEndpoint(aiProvider) || undefined,
  };
};

export const WelcomeScreen = ({ onProjectLoad }: WelcomeScreenProps) => {
  const { toast } = useToast();
  const hasFileSystemSupport = checkFileSystemSupport();
  const [recentProjects, setRecentProjects] = useState<ProjectReference[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);

  useEffect(() => {
    let active = true;
    setIsLoadingProjects(true);

    getProjectReferences()
      .then(entries => {
        if (active) {
          setRecentProjects(entries);
        }
      })
      .catch(error => {
        console.error("Failed to load project references", error);
      })
      .finally(() => {
        if (active) {
          setIsLoadingProjects(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const refreshRecentProjects = useCallback(async () => {
    setIsLoadingProjects(true);
    try {
      const entries = await getProjectReferences();
      setRecentProjects(entries);
    } catch (error) {
      console.error("Failed to refresh project references", error);
    } finally {
      setIsLoadingProjects(false);
    }
  }, []);

  const handleTrySample = () => {
    const { languages, rows } = getSampleData();
    const aiSettings = buildAiSettings();

    onProjectLoad({
      folderHandle: null,
      csvFileHandle: null,
      projectName: "sample-game-project",
      gitBranch: "main",
      gitStatus: "found",
      languages,
      rows,
      ...aiSettings,
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
    const aiSettings = buildAiSettings();

    const { folderHandle, gitBranch, gitStatus } = await requestRepoContext();

    onProjectLoad({
      folderHandle,
      csvFileHandle: fileHandle,
      projectName: projectBaseName || file.name,
      gitBranch,
      gitStatus,
      languages,
      rows,
      ...aiSettings,
    });

    await saveProjectReference({
      projectName: projectBaseName || file.name,
      fileName: file.name,
      languages,
      rowCount: rows.length,
      csvFileHandle: fileHandle,
      folderHandle,
      gitBranch,
      gitStatus,
    });

    await refreshRecentProjects();

    toast({
      title: "Source file imported",
      description:
        gitStatus === "found" && gitBranch
          ? `Loaded ${rows.length} keys (branch: ${gitBranch}).`
          : `Loaded ${rows.length} keys. Use File > Export to save changes.`,
    });
  };

  const handleOpenRecentProject = async (project: ProjectReference) => {
    if (!project.csvFileHandle) {
      toast({
        title: "Grant file access",
        description: "Locax needs permission to reopen this file. Import it again to continue.",
        variant: "destructive",
      });
      return;
    }

    try {
      const currentPermission = await project.csvFileHandle.queryPermission?.({ mode: "readwrite" });
      if (currentPermission !== "granted") {
        const permission = await project.csvFileHandle.requestPermission?.({ mode: "readwrite" });
        if (permission === "denied") {
          throw new Error("Locax needs read/write access to that file. Please try again and allow permission.");
        }
      }

      const file = await project.csvFileHandle.getFile();
      const { languages, rows } = await parseSourceFile(file);
      const aiSettings = buildAiSettings();

      onProjectLoad({
        folderHandle: project.folderHandle ?? null,
        csvFileHandle: project.csvFileHandle,
        projectName: project.projectName,
        gitBranch: project.gitBranch ?? null,
        gitStatus: project.gitStatus ?? "unknown",
        languages,
        rows,
        ...aiSettings,
      });

      await markProjectOpened(project.id);
      await refreshRecentProjects();

      toast({
        title: "Project loaded",
        description: `${rows.length} keys ready to edit.`,
      });
    } catch (error) {
      console.error("Failed to reopen project", error);
      toast({
        title: "Could not open project",
        description:
          (error as Error).message ||
          "Locax no longer has access to that file. Remove it from the viewer or import it again.",
        variant: "destructive",
      });
    }
  };

  const handleRemoveProject = async (project: ProjectReference) => {
    try {
      await removeProjectReference(project.id);
      await refreshRecentProjects();
      toast({
        title: "Removed",
        description: `${project.projectName} removed from Project Viewer.`,
      });
    } catch (error) {
      console.error("Failed to remove project reference", error);
      toast({
        title: "Unable to remove project",
        description: (error as Error).message,
        variant: "destructive",
      });
    }
  };

  return (
    <div className="flex min-h-screen bg-background">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-12">
        <div className="mx-auto max-w-2xl space-y-6 text-center">
          <div className="flex items-center justify-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
              <svg className="h-7 w-7 text-primary-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
                <path d="M2 12l10 5 10-5" />
              </svg>
            </div>
            <h1 className="text-4xl font-bold">Locax</h1>
          </div>

          <div className="space-y-2">
            <h2 className="text-2xl font-semibold">Game Translation Management</h2>
            <p className="text-muted-foreground">
              Open your game project folder to start managing localization keys, translations, and screenshots with AI
              assistance.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <Button
              size="lg"
              onClick={handleImportSource}
              className="gap-2"
            >
              <Upload className="h-5 w-5" />
              Import Source CSV / Excel
            </Button>

            <Button
              size="lg"
              variant="outline"
              onClick={handleTrySample}
              className="gap-2"
            >
              <Sparkles className="h-5 w-5" />
              Try Sample Project
            </Button>
          </div>
        </div>

        <ProjectViewer
          projects={recentProjects}
          onOpenProject={handleOpenRecentProject}
          onRemoveProject={handleRemoveProject}
          isLoading={isLoadingProjects}
        />

        <div className="text-center text-sm text-muted-foreground">
          <p>Import your game's source localization CSV or Excel file to get started.</p>
          <p>All changes can be exported back to the source format.</p>
        </div>
      </div>
    </div>
  );
};
