import { useEffect, useState } from "react";
import { Check, Cloud } from "lucide-react";
import { cn } from "@/lib/utils";

interface AutoSaveIndicatorProps {
  isSaving: boolean;
  lastSaved: Date | null;
}

export const AutoSaveIndicator = ({ isSaving, lastSaved }: AutoSaveIndicatorProps) => {
  const [showSaved, setShowSaved] = useState(false);

  useEffect(() => {
    if (!isSaving && lastSaved) {
      setShowSaved(true);
      const timer = setTimeout(() => setShowSaved(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [isSaving, lastSaved]);

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      {isSaving ? (
        <>
          <Cloud className="w-4 h-4 animate-pulse" />
          <span>Saving...</span>
        </>
      ) : showSaved ? (
        <>
          <Check className="w-4 h-4 text-success" />
          <span className="text-success">Saved</span>
        </>
      ) : lastSaved ? (
        <>
          <Check className="w-4 h-4" />
          <span>Auto-saved</span>
        </>
      ) : null}
    </div>
  );
};
