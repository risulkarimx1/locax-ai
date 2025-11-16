import { useMemo, useState } from "react";
import { Loader2, MoreHorizontal, Plus, Search, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { saveProjectReference, type ProjectReference } from "@/lib/project-storage";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useToast } from "@/hooks/use-toast";

interface ProjectViewerProps {
  projects: ProjectReference[];
  onOpenProject: (project: ProjectReference) => void;
  onRemoveProject: (project: ProjectReference) => void;
  onCreateProject: () => void;
  onImportProject: () => void;
  isLoading?: boolean;
}

type DerivedStatus = "synced" | "in-progress" | "archived" | "needs-permission";
type StatusFilter = DerivedStatus | "all";

const statusStyles: Record<DerivedStatus, { label: string; dot: string; background: string; text: string }> = {
  synced: {
    label: "Synced",
    dot: "bg-emerald-400",
    background: "bg-emerald-500/15",
    text: "text-emerald-300",
  },
  "in-progress": {
    label: "In Progress",
    dot: "bg-blue-400",
    background: "bg-blue-500/15",
    text: "text-blue-200",
  },
  archived: {
    label: "Archived",
    dot: "bg-slate-400",
    background: "bg-slate-500/20",
    text: "text-slate-200",
  },
  "needs-permission": {
    label: "Permission needed",
    dot: "bg-amber-400",
    background: "bg-amber-500/15",
    text: "text-amber-200",
  },
};

const statusFilters: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "synced", label: "Synced" },
  { value: "in-progress", label: "In Progress" },
  { value: "needs-permission", label: "Permission needed" },
  { value: "archived", label: "Archived" },
];

const getProjectStatus = (project: ProjectReference): DerivedStatus => {
  if (!project.sourceFileHandle) {
    return "needs-permission";
  }

  if (project.gitStatus === "found") {
    return "synced";
  }

  if (project.gitStatus === "missing") {
    return "in-progress";
  }

  return "archived";
};

const formatLastOpened = (timestamp: number | undefined): string => {
  if (!timestamp) {
    return "Never opened";
  }

  const diff = Date.now() - timestamp;
  const minutes = Math.round(diff / 60000);

  if (minutes < 1) {
    return "Just now";
  }

  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.round(hours / 24);
  if (days < 30) {
    return `${days}d ago`;
  }

  return new Date(timestamp).toLocaleDateString();
};

export const ProjectViewer = ({
  projects,
  onOpenProject,
  onRemoveProject,
  onCreateProject,
  onImportProject,
  isLoading,
}: ProjectViewerProps) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [relinkedPaths, setRelinkedPaths] = useState<Record<string, string>>({});
  const { toast } = useToast();
  const revealActionLabel =
    typeof window !== "undefined" && window.desktopApp?.platform === "darwin"
      ? "Show in Finder"
      : "Show in Folder";

  const filteredProjects = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    return projects.filter(project => {
      const cachedPath = relinkedPaths[project.id];
      const combinedName = `${project.projectName} ${project.repoFolderName ?? ""} ${project.folderHandle?.name ?? ""} ${project.repoFolderPath ?? cachedPath ?? ""}`.toLowerCase();
      const matchesSearch = !normalizedQuery || combinedName.includes(normalizedQuery);
      const status = getProjectStatus(project);
      const matchesStatus = statusFilter === "all" || status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [projects, relinkedPaths, searchQuery, statusFilter]);

  const relinkProjectPath = async (
    project: ProjectReference,
    desktopApp: DesktopAppContext
  ): Promise<string | null> => {
    if (!desktopApp.selectDirectory) {
      return null;
    }

    const displayName = project.repoFolderName ?? project.folderHandle?.name ?? project.projectName;

    try {
      const selectedPath = await desktopApp.selectDirectory({
        title: "Locate project folder",
        message: `Select the folder that contains ${displayName}.`,
      });

      if (!selectedPath) {
        return null;
      }

      setRelinkedPaths(prev => ({ ...prev, [project.id]: selectedPath }));

      try {
        await saveProjectReference({
          projectName: project.projectName,
          fileName: project.fileName,
          languages: project.languages,
          rowCount: project.rowCount,
          sourceFileHandle: project.sourceFileHandle,
          metaFileHandle: project.metaFileHandle,
          sourceFileType: project.sourceFileType,
          metaExists: project.metaExists,
          folderHandle: project.folderHandle,
          gitBranch: project.gitBranch,
          gitStatus: project.gitStatus,
          repoFolderName: project.repoFolderName ?? project.folderHandle?.name ?? null,
          repoFolderPath: selectedPath,
        });
      } catch (persistError) {
        console.error("Failed to persist folder path", persistError);
      }

      return selectedPath;
    } catch (error) {
      console.error("Folder selection failed", error);
      toast({
        title: "Unable to locate folder",
        description: (error as Error).message,
        variant: "destructive",
      });
      return null;
    }
  };

  const handleShowInFolder = async (project: ProjectReference) => {
    setMenuOpenId(null);
    const desktopApp = typeof window !== "undefined" ? window.desktopApp : undefined;

    if (!desktopApp?.openPath) {
      toast({
        title: "Desktop only",
        description: "Open this project in the desktop app to reveal it in your file browser.",
      });
      return;
    }

    let targetPath = project.repoFolderPath ?? relinkedPaths[project.id] ?? null;

    if (!targetPath) {
      targetPath = await relinkProjectPath(project, desktopApp);
    }

    if (!targetPath) {
      toast({
        title: "Folder required",
        description: "Select the project folder once to enable Show in Finder.",
      });
      return;
    }

    try {
      await desktopApp.openPath(targetPath);
    } catch (error) {
      toast({
        title: "Unable to open folder",
        description: (error as Error).message,
        variant: "destructive",
      });
    }
  };

  const handleCardKeyDown = (event: React.KeyboardEvent<HTMLDivElement>, project: ProjectReference) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpenProject(project);
    }
  };

  return (
    <section className="flex min-h-screen flex-col bg-background px-4 py-10 text-foreground md:px-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-muted-foreground">Dashboard</p>
          <h1 className="text-4xl font-black tracking-tight">My Projects</h1>
          <p className="mt-2 text-sm text-muted-foreground">Reopen localization files you worked on recently.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="md:hidden">
            <ThemeToggle />
          </div>
          <Button
            variant="outline"
            size="lg"
            onClick={onImportProject}
            className="gap-2 rounded-2xl border-border/70 bg-panel text-foreground shadow-sm hover:bg-panel-hover"
          >
            <Upload className="h-4 w-4" />
            Import File
          </Button>
          <Button
            size="lg"
            onClick={onCreateProject}
            className="gap-2 rounded-2xl bg-primary px-6 text-base font-semibold text-primary-foreground shadow-lg shadow-primary/40 hover:bg-primary/90"
          >
            <Plus className="h-5 w-5" />
            New Project
          </Button>
        </div>
      </div>

      <div className="mt-8 flex flex-col gap-4 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={event => setSearchQuery(event.target.value)}
            placeholder="Search projects..."
            className="h-12 rounded-2xl border border-border/70 bg-panel pl-12 text-foreground placeholder:text-muted-foreground focus-visible:ring-ring"
          />
        </div>
        <div className="flex w-full items-center gap-3 md:w-auto">
          {isLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading
            </div>
          )}
          <Select value={statusFilter} onValueChange={value => setStatusFilter(value as StatusFilter)}>
            <SelectTrigger className="h-12 w-full rounded-2xl border border-border/70 bg-panel text-foreground focus:ring-0 md:w-48">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent className="border border-border/70 bg-panel text-foreground">
              {statusFilters.map(option => (
                <SelectItem
                  key={option.value}
                  value={option.value}
                  className="focus:bg-panel-hover"
                >
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {filteredProjects.length === 0 && !isLoading ? (
        <div className="mt-16 flex flex-col items-center justify-center rounded-3xl border border-dashed border-border/70 bg-panel px-8 py-16 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-muted text-foreground">
            <Plus className="h-8 w-8" />
          </div>
          <h3 className="mt-6 text-2xl font-semibold">No projects yet</h3>
          <p className="mt-2 max-w-sm text-sm text-muted-foreground">
            Import a CSV or Excel localization source to start building your dashboard. Your recent files will show up
            here for quick access.
          </p>
          <Button
            onClick={onImportProject}
            className="mt-8 gap-2 rounded-xl bg-primary px-6 text-primary-foreground shadow-md hover:bg-primary/90"
          >
            <Upload className="h-4 w-4" />
            Import localization file
          </Button>
        </div>
      ) : (
        <div className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {filteredProjects.map(project => {
            const status = getProjectStatus(project);
            const statusMeta = statusStyles[status];
            const displayName = project.repoFolderName || project.folderHandle?.name || project.projectName;

            return (
              <div
                key={project.id}
                role="button"
                tabIndex={0}
                onClick={() => onOpenProject(project)}
                onKeyDown={event => handleCardKeyDown(event, project)}
                className="group relative flex flex-col rounded-3xl border border-border/60 bg-panel p-6 text-left shadow-[0_20px_50px_rgba(15,23,42,0.25)] transition hover:-translate-y-0.5 hover:border-primary/60 hover:bg-panel-hover focus:outline-none"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-lg font-semibold">{displayName}</p>
                    <p className="text-sm text-muted-foreground">Updated {formatLastOpened(project.lastOpened)}</p>
                  </div>
                  <DropdownMenu
                    open={menuOpenId === project.id}
                    onOpenChange={open => setMenuOpenId(open ? project.id : null)}
                  >
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground transition hover:text-foreground"
                        onClick={event => event.stopPropagation()}
                        aria-label={`Project actions for ${displayName}`}
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      className="w-44 border-border/70 bg-panel text-foreground"
                      onClick={event => event.stopPropagation()}
                    >
                      <DropdownMenuItem
                        disabled={!project.repoFolderPath && !project.folderHandle}
                        onSelect={event => {
                          event.preventDefault();
                          event.stopPropagation();
                          void handleShowInFolder(project);
                        }}
                      >
                        {revealActionLabel}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onSelect={event => {
                          event.preventDefault();
                          event.stopPropagation();
                          setMenuOpenId(null);
                          onRemoveProject(project);
                        }}
                      >
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <div className="mt-6 flex flex-wrap gap-3 text-xs text-muted-foreground">
                  <span className="rounded-full bg-muted px-3 py-1 text-foreground">
                    {project.languages.length} {project.languages.length === 1 ? "language" : "languages"}
                  </span>
                  <span className="rounded-full bg-muted px-3 py-1 text-foreground">{project.rowCount} keys</span>
                  {project.gitBranch ? (
                    <span className="rounded-full bg-muted px-3 py-1 text-foreground">Branch {project.gitBranch}</span>
                  ) : (
                    <span className="rounded-full bg-muted px-3 py-1 text-foreground">No Git branch</span>
                  )}
                </div>

                <div className="mt-8 flex items-center justify-between">
                  <div className={`flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${statusMeta.background} ${statusMeta.text}`}>
                    <span className={`h-2 w-2 rounded-full ${statusMeta.dot}`} />
                    {statusMeta.label}
                  </div>
                  <span className="text-sm font-semibold text-primary transition group-hover:text-primary/80">
                    Open project →
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
