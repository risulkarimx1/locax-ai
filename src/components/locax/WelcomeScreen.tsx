import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { FolderClosed, Settings, Upload } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { ProjectState, GitStatus } from "@/types/locax";
import { parseSourceFile } from "@/lib/source-file-parser";
import { detectGitBranch } from "@/lib/git-utils";
import { checkFileSystemSupport } from "@/lib/file-system";
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
    <div className="flex min-h-screen bg-[#050512] text-white">
      <aside className="hidden w-64 flex-col border-r border-white/10 bg-[#09091f] p-6 md:flex">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#6c63ff] text-xl font-black">L</div>
          <div>
            <p className="text-lg font-semibold">Locax</p>
            <p className="text-xs text-white/60">Localization Suite</p>
          </div>
        </div>

        <nav className="mt-10 space-y-1 text-sm font-medium">
          <button
            type="button"
            className="flex w-full items-center gap-3 rounded-xl bg-white/10 px-4 py-2 text-white"
          >
            <FolderClosed className="h-4 w-4" />
            Projects
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-3 rounded-xl px-4 py-2 text-white/60 transition hover:bg-white/5 hover:text-white"
          >
            <Settings className="h-4 w-4" />
            Settings
          </button>
        </nav>

        <div className="mt-auto rounded-2xl border border-white/10 bg-white/5 p-4 text-xs text-white/70">
          <p className="text-sm font-semibold text-white">Need a reminder?</p>
          <p className="mt-1">
            Import a CSV or Excel localization file to populate the project viewer. Locax remembers them for easy
            reopen.
          </p>
          <Button
            size="sm"
            onClick={handleImportSource}
            className="mt-4 w-full gap-2 rounded-xl bg-[#6c63ff] text-white hover:bg-[#5b52f3]"
          >
            <Upload className="h-4 w-4" />
            Import file
          </Button>
        </div>
      </aside>

      <div className="flex-1">
        <ProjectViewer
          projects={recentProjects}
          onOpenProject={handleOpenRecentProject}
          onRemoveProject={handleRemoveProject}
          onCreateProject={handleImportSource}
          isLoading={isLoadingProjects}
        />
      </div>
    </div>
  );
};
