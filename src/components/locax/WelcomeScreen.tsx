import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FolderClosed, Settings, Upload } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { ProjectState, GitStatus, LocalizationRow, ColumnMetadata } from "@/types/locax";
import { parseSourceFile } from "@/lib/source-file-parser";
import { detectGitBranch } from "@/lib/git-utils";
import { checkFileSystemSupport } from "@/lib/file-system";
import { createBlankWorkbookBuffer } from "@/lib/source-writer";
import { getStoredAiProvider, getStoredApiKey, getStoredModel, getStoredEndpoint } from "@/lib/ai-config";
import { ProjectViewer } from "@/components/locax/ProjectViewer";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  getProjectReferences,
  markProjectOpened,
  removeProjectReference,
  saveProjectReference,
  type ProjectReference,
} from "@/lib/project-storage";
import { loadMetaData, type MetaEntry } from "@/lib/meta-file";

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
type SaveFilePicker = (options?: SaveFilePickerOptions) => Promise<FileSystemFileHandle>;

const DEFAULT_PROJECT_LANGUAGES = ["en", "de", "fr", "es", "ja", "ko"] as const;
const DEFAULT_LANGUAGE_HEADERS: Record<string, string> = {
  en: "English",
  de: "Deutsch [de]",
  fr: "Français [fr]",
  es: "Español [es]",
  ja: "日本語 [ja]",
  ko: "한국어 [ko]",
};
const defaultLanguageSummary = DEFAULT_PROJECT_LANGUAGES.map(
  code => `${DEFAULT_LANGUAGE_HEADERS[code] ?? code.toUpperCase()} (${code})`
).join(", ");

const mergeRowsWithMeta = (rows: LocalizationRow[], metaByKey: Record<string, MetaEntry>): LocalizationRow[] => {
  const sourceKeys = new Set(rows.map(row => row.key));
  Object.keys(metaByKey).forEach(key => {
    if (!sourceKeys.has(key)) {
      console.warn(`Meta entry for "${key}" does not exist in the source file.`);
    }
  });

  return rows.map(row => {
    const entry = metaByKey[row.key];
    if (!entry) {
      const fallback = row.description ?? row.context ?? "";
      return {
        ...row,
        description: fallback,
        context: row.context ?? fallback,
      };
    }

    const linkedKeys = entry.linkedKeys?.length ? [...entry.linkedKeys] : row.linkedKeys;
    const screenshot = entry.screenshot !== undefined ? entry.screenshot : row.screenshot;
    const notes = entry.notes !== undefined ? entry.notes : row.notes;
    const context = entry.context ?? row.context ?? row.description ?? "";

    return {
      ...row,
      description: row.description ?? row.context ?? context,
      context,
      screenshot,
      linkedKeys,
      notes,
    };
  });
};

const getDirectoryPicker = (): DirectoryPicker | undefined => {
  if (typeof window === "undefined") return undefined;
  return (window as typeof window & { showDirectoryPicker?: DirectoryPicker }).showDirectoryPicker;
};

const getFilePicker = (): OpenFilePicker | undefined => {
  if (typeof window === "undefined") return undefined;
  return (window as typeof window & { showOpenFilePicker?: OpenFilePicker }).showOpenFilePicker;
};

const getSaveFilePicker = (): SaveFilePicker | undefined => {
  if (typeof window === "undefined") return undefined;
  return (window as typeof window & { showSaveFilePicker?: SaveFilePicker }).showSaveFilePicker;
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

const deriveFolderPathFromFile = (file: File): string | null => {
  const withPath = file as File & { path?: string };
  const filePath = withPath.path;
  if (!filePath) {
    return null;
  }

  const trimmed = filePath.replace(/[\\/]+$/, "");
  const lastSlash = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  if (lastSlash === -1) {
    return null;
  }

  return filePath.slice(0, lastSlash);
};

const sanitizeProjectSlug = (value: string) => value.trim().replace(/[^a-zA-Z0-9_-]/g, "_") || "Localization";

const buildDefaultLanguageColumnMap = (): Record<string, ColumnMetadata> =>
  DEFAULT_PROJECT_LANGUAGES.reduce<Record<string, ColumnMetadata>>((acc, code, index) => {
    acc[code] = { index, header: DEFAULT_LANGUAGE_HEADERS[code] ?? code.toUpperCase() };
    return acc;
  }, {});

export const WelcomeScreen = ({ onProjectLoad }: WelcomeScreenProps) => {
  const { toast } = useToast();
  const hasFileSystemSupport = checkFileSystemSupport();
  const [recentProjects, setRecentProjects] = useState<ProjectReference[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [isCreateProjectDialogOpen, setCreateProjectDialogOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("Localization");
  const [creatingProject, setCreatingProject] = useState(false);

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
        mode: "readwrite",
      });

      await folderHandle.requestPermission?.({ mode: "readwrite" });

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
    const parsed = await parseSourceFile(file);
    const projectBaseName = file.name.replace(/\.(csv|xlsx|xls)$/i, "");
    const aiSettings = buildAiSettings();
    const repoFolderPath = deriveFolderPathFromFile(file);

    const { folderHandle, gitBranch, gitStatus } = await requestRepoContext();

    const metaResult = await loadMetaData({
      folderHandle,
      rows: parsed.rows,
    });

    const mergedRows = mergeRowsWithMeta(parsed.rows, metaResult.metaByKey);

    onProjectLoad({
      folderHandle,
      sourceFileHandle: fileHandle,
      metaFileHandle: metaResult.metaFileHandle,
      sourceFileType: parsed.sourceFileType,
      metaExists: metaResult.metaExists,
      sourceDirty: false,
      metaDirty: false,
      projectName: projectBaseName || file.name,
      gitBranch,
      gitStatus,
      languages: parsed.languages,
      rows: mergedRows,
      workbookRowMap: parsed.workbookRowMap,
      languageColumnMap: parsed.languageColumnMap,
      sourceHeaders: parsed.header,
      descColumn: parsed.descColumn,
      typeColumn: parsed.typeColumn,
      sourceLastModified: file.lastModified,
      metaLastModified: metaResult.lastModified,
      ...aiSettings,
    });

    await saveProjectReference({
      projectName: projectBaseName || file.name,
      fileName: file.name,
      languages: parsed.languages,
      rowCount: mergedRows.length,
      sourceFileHandle: fileHandle,
      metaFileHandle: metaResult.metaFileHandle,
      sourceFileType: parsed.sourceFileType,
      metaExists: metaResult.metaExists,
      folderHandle,
      gitBranch,
      gitStatus,
      repoFolderName: folderHandle?.name ?? null,
      repoFolderPath,
    });

    await refreshRecentProjects();

    toast({
      title: "Source file imported",
      description:
        gitStatus === "found" && gitBranch
          ? `Loaded ${mergedRows.length} keys (branch: ${gitBranch}).`
          : `Loaded ${mergedRows.length} keys. Use File > Export to save changes.`,
    });
  };

  const handleStartCreateProject = () => {
    setNewProjectName("Localization");
    setCreateProjectDialogOpen(true);
  };

  const handleCreateProjectDialogChange = (open: boolean) => {
    if (!open) {
      setCreatingProject(false);
    }
    setCreateProjectDialogOpen(open);
  };

  const handleCreateProject = async () => {
    const showSaveFilePicker = getSaveFilePicker();
    if (!showSaveFilePicker) {
      toast({
        title: "Save picker unavailable",
        description: "Use a Chromium-based browser to create a new workbook from Locax.",
        variant: "destructive",
      });
      return;
    }

    try {
      setCreatingProject(true);
      const safeName = sanitizeProjectSlug(newProjectName);
      const fileHandle = await showSaveFilePicker({
        suggestedName: `${safeName}.xlsx`,
        types: [
          {
            description: "Excel Workbook",
            accept: {
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
            },
          },
        ],
      });

      await fileHandle.requestPermission?.({ mode: "readwrite" });

      const writable = await fileHandle.createWritable();
      const buffer = createBlankWorkbookBuffer(Array.from(DEFAULT_PROJECT_LANGUAGES), buildDefaultLanguageColumnMap());
      await writable.write(buffer);
      await writable.close();

      const file = await fileHandle.getFile();
      await importProjectFromFile(file, fileHandle);
      setCreateProjectDialogOpen(false);
      setNewProjectName("Localization");
    } catch (error) {
      if ((error as DOMException)?.name === "AbortError") {
        return;
      }
      toast({
        title: "Project creation failed",
        description: (error as Error).message,
        variant: "destructive",
      });
    } finally {
      setCreatingProject(false);
    }
  };

  const handleOpenRecentProject = async (project: ProjectReference) => {
    if (!project.sourceFileHandle) {
      toast({
        title: "Grant file access",
        description: "Locax needs permission to reopen this file. Import it again to continue.",
        variant: "destructive",
      });
      return;
    }

    try {
      const currentPermission = await project.sourceFileHandle.queryPermission?.({ mode: "readwrite" });
      if (currentPermission !== "granted") {
        const permission = await project.sourceFileHandle.requestPermission?.({ mode: "readwrite" });
        if (permission === "denied") {
          throw new Error("Locax needs read/write access to that file. Please try again and allow permission.");
        }
      }

      const file = await project.sourceFileHandle.getFile();
      const parsed = await parseSourceFile(file);
      const aiSettings = buildAiSettings();
      const repoFolderPath = deriveFolderPathFromFile(file);

      const metaResult = await loadMetaData({
        folderHandle: project.folderHandle ?? null,
        existingHandle: project.metaFileHandle ?? null,
        rows: parsed.rows,
      });

      const mergedRows = mergeRowsWithMeta(parsed.rows, metaResult.metaByKey);

      onProjectLoad({
        folderHandle: project.folderHandle ?? null,
        sourceFileHandle: project.sourceFileHandle,
        metaFileHandle: metaResult.metaFileHandle ?? project.metaFileHandle ?? null,
        sourceFileType: project.sourceFileType ?? parsed.sourceFileType,
        metaExists: metaResult.metaExists ?? project.metaExists ?? false,
        sourceDirty: false,
        metaDirty: false,
        projectName: project.projectName,
        gitBranch: project.gitBranch ?? null,
        gitStatus: project.gitStatus ?? "unknown",
        languages: parsed.languages,
        rows: mergedRows,
        workbookRowMap: parsed.workbookRowMap,
        languageColumnMap: parsed.languageColumnMap,
        sourceHeaders: parsed.header,
        descColumn: parsed.descColumn,
        typeColumn: parsed.typeColumn,
        sourceLastModified: file.lastModified,
        metaLastModified: metaResult.lastModified,
        ...aiSettings,
      });

      await markProjectOpened(project.id);
      await saveProjectReference({
        projectName: project.projectName,
        fileName: project.fileName,
        languages: parsed.languages,
        rowCount: mergedRows.length,
        sourceFileHandle: project.sourceFileHandle,
        metaFileHandle: metaResult.metaFileHandle ?? project.metaFileHandle ?? null,
        sourceFileType: project.sourceFileType ?? parsed.sourceFileType,
        metaExists: metaResult.metaExists ?? project.metaExists ?? false,
        folderHandle: project.folderHandle ?? null,
        gitBranch: project.gitBranch ?? null,
        gitStatus: project.gitStatus ?? "unknown",
        repoFolderName: project.folderHandle?.name ?? project.repoFolderName ?? null,
        repoFolderPath: repoFolderPath ?? project.repoFolderPath ?? null,
      });
      await refreshRecentProjects();

      toast({
        title: "Project loaded",
        description: `${mergedRows.length} keys ready to edit.`,
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
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="hidden w-72 flex-col border-r border-border/70 bg-panel p-6 md:flex">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-xl font-black text-primary-foreground">
              L
            </div>
            <div>
              <p className="text-lg font-semibold">Locax</p>
              <p className="text-xs text-muted-foreground">Localization Suite</p>
            </div>
          </div>
          <ThemeToggle />
        </div>

        <nav className="mt-10 space-y-1 text-sm font-medium text-muted-foreground">
          <button
            type="button"
            className="flex w-full items-center gap-3 rounded-2xl bg-primary/10 px-4 py-2 text-primary"
          >
            <FolderClosed className="h-4 w-4" />
            Projects
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-3 rounded-2xl px-4 py-2 transition hover:bg-panel-hover hover:text-foreground"
          >
            <Settings className="h-4 w-4" />
            Settings
          </button>
        </nav>

        <div className="mt-auto rounded-2xl border border-border/70 bg-panel-hover p-4 text-xs text-muted-foreground">
          <p className="text-sm font-semibold text-foreground">Need a reminder?</p>
          <p className="mt-1">
            Import a CSV or Excel localization file to populate the project viewer. Locax remembers them for easy reopen.
          </p>
          <Button
            size="sm"
            onClick={handleImportSource}
            className="mt-4 w-full gap-2 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90"
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
          onCreateProject={handleStartCreateProject}
          onImportProject={handleImportSource}
          isLoading={isLoadingProjects}
        />
      </div>
      <Dialog open={isCreateProjectDialogOpen} onOpenChange={handleCreateProjectDialogChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create new localization workbook</DialogTitle>
            <DialogDescription>
              We'll generate an empty Excel file with columns for {defaultLanguageSummary}. Choose where to save it.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="projectName">Project name</Label>
              <Input
                id="projectName"
                value={newProjectName}
                onChange={(event) => setNewProjectName(event.target.value)}
                autoFocus
                placeholder="Localization"
              />
            </div>
            <p className="text-sm text-muted-foreground">
              After saving the workbook, select your repository folder so Locax can create <code className="rounded bg-muted px-1">localization_meta.csv</code> for contexts and screenshots.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateProjectDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateProject} disabled={!newProjectName.trim() || creatingProject}>
              {creatingProject ? "Creating…" : "Create project"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
