import { useState, useEffect } from "react";
import { Header } from "@/components/locax/Header";
import { CategoryTree } from "@/components/locax/CategoryTree";
import { LocalizationTable } from "@/components/locax/LocalizationTable";
import { ScreenshotPanel } from "@/components/locax/ScreenshotPanel";
import { WelcomeScreen } from "@/components/locax/WelcomeScreen";
import { Button } from "@/components/ui/button";
import { StatusBar } from "@/components/locax/StatusBar";
import { writeCSVToFile, writeTempLocalizationFile, readTempLocalizationFile } from "@/lib/file-system";
import type { LocalizationRow, ProjectState } from "@/types/locax";
import { useToast } from "@/hooks/use-toast";

const Index = () => {
  const { toast } = useToast();
  const [projectState, setProjectState] = useState<ProjectState | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [autoSyncStatus, setAutoSyncStatus] = useState<"idle" | "syncing" | "error">("idle");
  const [manualSaveStatus, setManualSaveStatus] = useState<"idle" | "saving" | "error">("idle");
  const [isScreenshotPanelVisible, setScreenshotPanelVisible] = useState(false);

  useEffect(() => {
    if (!projectState) return;

    let cancelled = false;
    const timeoutId = setTimeout(async () => {
      try {
        setAutoSyncStatus("syncing");
        setIsSaving(true);
        await writeTempLocalizationFile(projectState.languages, projectState.rows);
        if (!cancelled) {
          setAutoSyncStatus("idle");
        }
      } catch (error) {
        if (!cancelled) {
          setAutoSyncStatus("error");
          toast({
            title: "Auto-sync failed",
            description: (error as Error).message,
            variant: "destructive",
          });
        }
      } finally {
        if (!cancelled) {
          setIsSaving(false);
        }
      }
    }, 1500);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [projectState?.rows, projectState?.languages, toast]);

  // Auto-show screenshot panel when a key is selected
  useEffect(() => {
    if (selectedKey) {
      setScreenshotPanelVisible(true);
    } else {
      setScreenshotPanelVisible(false);
    }
  }, [selectedKey]);

  const filteredRows = projectState?.rows.filter(row => {
    const searchLower = searchQuery.toLowerCase();
    return (
      row.key.toLowerCase().includes(searchLower) ||
      row.context.toLowerCase().includes(searchLower) ||
      Object.values(row.translations).some(text => 
        text.toLowerCase().includes(searchLower)
      )
    );
  }) || [];

  const selectedRow = filteredRows.find(row => row.key === selectedKey);

  if (!projectState) {
    return <WelcomeScreen onProjectLoad={setProjectState} />;
  }

  return (
    <div className="flex flex-col h-screen bg-background">
      <Header 
        projectState={projectState}
        setProjectState={setProjectState}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        isSaving={isSaving}
        lastSaved={lastSaved}
        onManualSave={handleManualSave}
        manualSaveDisabled={!projectState.csvFileHandle || manualSaveStatus === "saving"}
        isManualSaving={manualSaveStatus === "saving"}
      />
      
      <div className="relative flex flex-1 overflow-hidden">
        <CategoryTree 
          rows={filteredRows}
          selectedKey={selectedKey}
          onSelectKey={setSelectedKey}
          onAddKey={(category, newRow) => {
            setProjectState({
              ...projectState,
              rows: [...projectState.rows, newRow]
            });
          }}
        />
        
        <LocalizationTable 
          rows={filteredRows}
          languages={projectState.languages}
          selectedKey={selectedKey}
          onSelectKey={setSelectedKey}
          onUpdateRow={(key, updates) => {
            setProjectState({
              ...projectState,
              rows: projectState.rows.map(row => 
                row.key === key ? { ...row, ...updates } : row
              )
            });
          }}
        />
        
        {isScreenshotPanelVisible && selectedRow && (
          <ScreenshotPanel 
            selectedRow={selectedRow}
            allRows={projectState.rows}
            onUpdateRow={(key, updates) => {
              setProjectState({
                ...projectState,
                rows: projectState.rows.map(row => 
                  row.key === key ? { ...row, ...updates } : row
                )
              });
            }}
            onClose={() => setScreenshotPanelVisible(false)}
            aiApiKey={projectState.aiApiKey}
            aiProvider={projectState.aiProvider}
            aiModel={projectState.aiModel}
            aiEndpoint={projectState.aiEndpoint}
            languages={projectState.languages}
          />
        )}

        {selectedRow && !isScreenshotPanelVisible && (
          <div className="absolute right-4 bottom-4 z-10">
            <Button variant="secondary" onClick={() => setScreenshotPanelVisible(true)}>
              Show Context
            </Button>
          </div>
        )}
      </div>

      <StatusBar
        autoStatus={autoSyncStatus}
        manualStatus={manualSaveStatus}
        gitStatus={projectState.gitStatus ?? "unknown"}
        gitBranch={projectState.gitBranch}
      />
    </div>
  );
};

export default Index;
  const handleManualSave = async () => {
    if (!projectState?.csvFileHandle) {
      toast({
        title: "Manual save unavailable",
        description: "Reimport the CSV/Excel file using a supported browser to enable saving.",
        variant: "destructive",
      });
      return;
    }

    try {
      setManualSaveStatus("saving");
      const permission = await projectState.csvFileHandle.requestPermission?.({ mode: "readwrite" });
      if (permission === "denied") {
        throw new Error("Permission denied for writing to the source file.");
      }

      const tempContent = (await readTempLocalizationFile()) ?? undefined;
      await writeCSVToFile(
        projectState.csvFileHandle,
        projectState.languages,
        projectState.rows,
        tempContent
      );
      setLastSaved(new Date());
      setManualSaveStatus("idle");
      toast({
        title: "Saved",
        description: "Changes written to the original file.",
      });
    } catch (error) {
      setManualSaveStatus("error");
      toast({
        title: "Save failed",
        description: (error as Error).message,
        variant: "destructive",
      });
      setTimeout(() => setManualSaveStatus("idle"), 2500);
    }
  };
