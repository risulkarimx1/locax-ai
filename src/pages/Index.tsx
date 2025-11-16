import { useState, useEffect } from "react";
import { Header } from "@/components/locax/Header";
import { CategoryTree } from "@/components/locax/CategoryTree";
import { LocalizationTable } from "@/components/locax/LocalizationTable";
import { ScreenshotPanel } from "@/components/locax/ScreenshotPanel";
import { WelcomeScreen } from "@/components/locax/WelcomeScreen";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { StatusBar } from "@/components/locax/StatusBar";
import { writeTempLocalizationFile } from "@/lib/file-system";
import { writeSourceFile } from "@/lib/source-writer";
import { ensureMetaFileHandle, writeMetaFile } from "@/lib/meta-file";
import type { LocalizationRow, ProjectState } from "@/types/locax";
import { useToast } from "@/hooks/use-toast";
import { Info } from "lucide-react";

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

  const setProjectStateSafe = (updater: (state: ProjectState) => ProjectState) => {
    setProjectState(prev => (prev ? updater(prev) : prev));
  };

  const markDirtyFromUpdates = (state: ProjectState, updates: Partial<LocalizationRow>) => {
    const sourceFields: (keyof LocalizationRow)[] = ["key", "description", "translations", "type"];
    const metaFields: (keyof LocalizationRow)[] = ["context", "screenshot", "linkedKeys", "notes"];

    const sourceDirty = sourceFields.some(field => field in updates);
    const metaDirty = metaFields.some(field => field in updates);

    return {
      sourceDirty: state.sourceDirty || sourceDirty,
      metaDirty: state.metaDirty || metaDirty,
    };
  };

  const updateRow = (key: string, updates: Partial<LocalizationRow>) => {
    setProjectState(prev => {
      if (!prev) return prev;

      const nextRows = prev.rows.map(row => (row.key === key ? { ...row, ...updates } : row));
      const dirty = markDirtyFromUpdates(prev, updates);
      let workbookRowMap = prev.workbookRowMap;

      if (updates.key && prev.workbookRowMap?.[key]) {
        workbookRowMap = { ...prev.workbookRowMap };
        workbookRowMap[updates.key] = workbookRowMap[key];
        delete workbookRowMap[key];
      }

      return {
        ...prev,
        rows: nextRows,
        workbookRowMap,
        sourceDirty: dirty.sourceDirty,
        metaDirty: dirty.metaDirty,
      };
    });
  };

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

  const handleManualSave = async () => {
    if (!projectState?.sourceFileHandle) {
      toast({
        title: "Manual save unavailable",
        description: "Reimport the CSV/Excel file using a supported browser to enable saving.",
        variant: "destructive",
      });
      return;
    }

    try {
      setManualSaveStatus("saving");
      const permission = await projectState.sourceFileHandle.requestPermission?.({ mode: "readwrite" });
      if (permission === "denied") {
        throw new Error("Permission denied for writing to the source file.");
      }

      const currentSourceFile = await projectState.sourceFileHandle.getFile();
      if (
        projectState.sourceLastModified &&
        projectState.sourceLastModified !== currentSourceFile.lastModified
      ) {
        throw new Error(
          "The source spreadsheet changed outside Locax. Reimport it to avoid overwriting those edits."
        );
      }

      const metaHandle = await ensureMetaFileHandle({
        folderHandle: projectState.folderHandle ?? null,
        metaFileHandle: projectState.metaFileHandle ?? null,
        rows: projectState.rows,
      });

      if (!metaHandle) {
        throw new Error("Unable to access localization_meta.csv. Select the project folder again to grant access.");
      }

      if (projectState.metaLastModified) {
        const currentMetaFile = await metaHandle.getFile();
        if (currentMetaFile.lastModified !== projectState.metaLastModified) {
          throw new Error(
            "localization_meta.csv was modified outside Locax. Reopen the project to merge those changes."
          );
        }
      }

      const sourceResult = await writeSourceFile({
        fileHandle: projectState.sourceFileHandle,
        fileType: projectState.sourceFileType ?? "csv",
        languages: projectState.languages,
        rows: projectState.rows,
        header: projectState.sourceHeaders,
        languageColumnMap: projectState.languageColumnMap,
        descColumn: projectState.descColumn,
        typeColumn: projectState.typeColumn,
        workbookRowMap: projectState.workbookRowMap,
      });

      const metaLastModified = await writeMetaFile(metaHandle, projectState.rows);

      setProjectState(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          languageColumnMap: sourceResult.languageColumnMap ?? prev.languageColumnMap,
          workbookRowMap: sourceResult.workbookRowMap ?? prev.workbookRowMap,
          sourceHeaders: sourceResult.header ?? prev.sourceHeaders,
          descColumn: sourceResult.descColumn ?? prev.descColumn,
          typeColumn: sourceResult.typeColumn ?? prev.typeColumn,
          metaFileHandle: metaHandle,
          metaExists: true,
          sourceLastModified: sourceResult.lastModified ?? currentSourceFile.lastModified ?? Date.now(),
          metaLastModified,
          sourceDirty: false,
          metaDirty: false,
        };
      });

      const savedAt = new Date();
      setLastSaved(savedAt);
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

  const handleDeleteKey = (key: string) => {
    if (!projectState) return;

    setProjectState(prev => {
      if (!prev) return prev;
      if (!prev.rows.some(row => row.key === key)) {
        return prev;
      }

      const nextMap = prev.workbookRowMap ? { ...prev.workbookRowMap } : undefined;
      if (nextMap) {
        delete nextMap[key];
      }

      return {
        ...prev,
        rows: prev.rows.filter(row => row.key !== key),
        workbookRowMap: nextMap,
        sourceDirty: true,
        metaDirty: true,
      };
    });

    setSelectedKey(current => (current === key ? null : current));
    toast({
      title: "Key deleted",
      description: `${key} removed from the spreadsheet and meta file.`,
    });
  };

  const filteredRows = projectState?.rows.filter(row => {
    const searchLower = searchQuery.toLowerCase();
    return (
      row.key.toLowerCase().includes(searchLower) ||
      (row.description ?? "").toLowerCase().includes(searchLower) ||
      (row.context ?? "").toLowerCase().includes(searchLower) ||
      Object.values(row.translations).some(text => 
        text.toLowerCase().includes(searchLower)
      )
    );
  }) || [];

  const selectedRow = filteredRows.find(row => row.key === selectedKey);

  const handleExitToHome = () => {
    setProjectState(null);
    setSelectedKey(null);
    setSearchQuery("");
  };

  if (!projectState) {
    return <WelcomeScreen onProjectLoad={setProjectState} />;
  }

  return (
    <div className="flex flex-col h-screen bg-background">
      {!projectState.metaExists && (
        <div className="px-4 pt-4">
          <Alert>
            <AlertTitle className="flex items-center gap-2 text-sm font-semibold">
              <Info className="h-4 w-4" />
              Contexts initialized from descriptions
            </AlertTitle>
            <AlertDescription className="text-sm text-muted-foreground">
              Update the <span className="font-medium">Context</span> column to guide AI translations. Once you save, a
              <code className="mx-1 rounded bg-muted px-1 text-foreground">localization_meta.csv</code> file will store these instructions.
            </AlertDescription>
          </Alert>
        </div>
      )}
      {projectState.folderHandle && (
        <div className="px-4 pt-2">
          <Alert variant="secondary">
            <AlertTitle className="flex items-center gap-2 text-sm font-semibold">
              <Info className="h-4 w-4" />
              Git tip
            </AlertTitle>
            <AlertDescription className="text-sm text-muted-foreground">
              Add <code className="mx-1 rounded bg-muted px-1 text-foreground">localization_meta.csv</code> (and future screenshot folders)
              to your <code className="mx-1 rounded bg-muted px-1 text-foreground">.gitignore</code> if AI notes shouldn&apos;t leave the repo.
            </AlertDescription>
          </Alert>
        </div>
      )}
      <Header 
        projectState={projectState}
        setProjectState={setProjectState}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        isSaving={isSaving}
        lastSaved={lastSaved}
        onManualSave={handleManualSave}
        manualSaveDisabled={!projectState.sourceFileHandle || manualSaveStatus === "saving"}
        isManualSaving={manualSaveStatus === "saving"}
        selectedKey={selectedKey}
        onDeleteKey={handleDeleteKey}
        onExitProject={handleExitToHome}
      />
      
      <div className="relative flex flex-1 overflow-hidden">
        <CategoryTree 
          rows={filteredRows}
          selectedKey={selectedKey}
          onSelectKey={setSelectedKey}
          onAddKey={(category, newRow) => {
            setProjectState(prev => {
              if (!prev) return prev;
              return {
                ...prev,
                rows: [...prev.rows, newRow],
                sourceDirty: true,
                metaDirty: true,
              };
            });
          }}
        />
        
        <LocalizationTable 
          rows={filteredRows}
          languages={projectState.languages}
          selectedKey={selectedKey}
          onSelectKey={setSelectedKey}
          onUpdateRow={updateRow}
        />
        
        {isScreenshotPanelVisible && selectedRow && (
          <ScreenshotPanel 
            selectedRow={selectedRow}
            allRows={projectState.rows}
            onUpdateRow={updateRow}
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
        sourceDirty={projectState.sourceDirty}
        metaDirty={projectState.metaDirty}
      />
    </div>
  );
};

export default Index;
