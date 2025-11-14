import { Check, AlertTriangle, Loader2, GitCommit, Wifi } from "lucide-react";
import { GitStatus } from "@/types/locax";

type AutoStatus = "idle" | "syncing" | "error";
type ManualStatus = "idle" | "saving" | "error";

interface StatusBarProps {
  autoStatus: AutoStatus;
  manualStatus: ManualStatus;
  gitStatus: GitStatus;
  gitBranch: string | null;
}

const statusIcon = {
  idle: <Check className="w-3.5 h-3.5 text-emerald-500" />,
  syncing: <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />,
  error: <AlertTriangle className="w-3.5 h-3.5 text-destructive" />,
};

export const StatusBar = ({ autoStatus, manualStatus, gitStatus, gitBranch }: StatusBarProps) => {
  const gitPill =
    gitStatus === "found" && gitBranch ? (
      <div className="flex items-center gap-1.5 px-3 py-1 rounded-full border border-border/80 text-xs bg-muted/60 dark:bg-white/5">
        <GitCommit className="w-3.5 h-3.5 text-primary" />
        <span className="font-medium text-foreground">{gitBranch}</span>
        <span className="w-2 h-2 rounded-full bg-emerald-500" />
      </div>
    ) : gitStatus === "missing" ? (
      <div className="flex items-center gap-1.5 px-3 py-1 rounded-full border border-destructive/40 text-xs bg-destructive/10 text-destructive">
        <GitCommit className="w-3.5 h-3.5" />
        <span className="font-medium">Git not found</span>
        <span className="w-2 h-2 rounded-full bg-destructive" />
      </div>
    ) : null;

  return (
    <footer className="flex items-center justify-between h-10 px-4 border-t bg-panel dark:bg-card border-border/80 text-xs text-muted-foreground">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          {statusIcon[autoStatus]}
          <span>{autoStatus === "syncing" ? "Auto-syncing…" : autoStatus === "error" ? "Auto-sync failed" : "Auto-sync ON"}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {manualStatus === "saving"
            ? <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />
            : manualStatus === "error"
              ? <AlertTriangle className="w-3.5 h-3.5 text-destructive" />
              : <Check className="w-3.5 h-3.5 text-emerald-500" />}
          <span>{manualStatus === "saving" ? "Saving to source…" : manualStatus === "error" ? "Save failed" : "Save ready"}</span>
        </div>
        {gitPill}
      </div>

      <div className="flex items-center gap-1.5">
        <Wifi className="w-3.5 h-3.5 text-primary" />
        <span>Connected</span>
      </div>
    </footer>
  );
};
