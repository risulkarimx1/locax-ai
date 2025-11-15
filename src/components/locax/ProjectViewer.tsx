import { FileText, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { ProjectReference } from "@/lib/project-storage";

interface ProjectViewerProps {
  projects: ProjectReference[];
  onOpenProject: (project: ProjectReference) => void;
  onRemoveProject: (project: ProjectReference) => void;
  isLoading?: boolean;
}

const formatLastOpened = (timestamp: number): string => {
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

export const ProjectViewer = ({ projects, onOpenProject, onRemoveProject, isLoading }: ProjectViewerProps) => {
  return (
    <Card className="bg-muted/20">
      <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="text-2xl">Project Viewer</CardTitle>
          <CardDescription>Reopen localization files you've used recently.</CardDescription>
        </div>
        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {projects.length === 0 ? (
          <div className="rounded-lg border border-dashed border-muted-foreground/30 bg-background/60 px-4 py-10 text-center text-sm text-muted-foreground">
            Select a localization file and it will appear here for quick access.
          </div>
        ) : (
          <div className="space-y-2">
            {projects.map(project => {
              return (
                <div
                  key={project.id}
                  className="flex items-center gap-2"
                >
                  <button
                    type="button"
                    onClick={() => onOpenProject(project)}
                    className={cn(
                      "flex-1 rounded-lg border border-border bg-background/80 px-4 py-3 text-left transition hover:bg-muted",
                      !project.csvFileHandle && "opacity-70"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <FileText className="h-5 w-5" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <p className="font-medium leading-tight">{project.projectName}</p>
                            <p className="text-xs text-muted-foreground">{project.fileName}</p>
                          </div>
                          <Badge variant={project.csvFileHandle ? "secondary" : "outline"}>
                            {project.csvFileHandle ? "Ready" : "Permission needed"}
                          </Badge>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <span>{project.languages.length} languages</span>
                          <span>•</span>
                          <span>{project.rowCount} keys</span>
                          {project.gitBranch && (
                            <>
                              <span>•</span>
                              <span>Git: {project.gitBranch}</span>
                            </>
                          )}
                          {project.lastOpened && (
                            <>
                              <span>•</span>
                              <span>{formatLastOpened(project.lastOpened)}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0"
                    onClick={() => onRemoveProject(project)}
                    aria-label={`Remove ${project.projectName}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
