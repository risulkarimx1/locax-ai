import { Check, AlertTriangle, Loader2, Wifi } from "lucide-react";

type AutoStatus = "idle" | "syncing" | "error";
type ManualStatus = "idle" | "saving" | "error";

interface StatusBarProps {
  autoStatus: AutoStatus;
  manualStatus: ManualStatus;
}

const statusIcon = {
  idle: <Check className="w-3.5 h-3.5 text-emerald-500" />,
  syncing: <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />,
  error: <AlertTriangle className="w-3.5 h-3.5 text-destructive" />,
};

export const StatusBar = ({ autoStatus, manualStatus }: StatusBarProps) => {
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
      </div>

      <div className="flex items-center gap-1.5">
        <Wifi className="w-3.5 h-3.5 text-primary" />
        <span>Connected</span>
      </div>
    </footer>
  );
};
