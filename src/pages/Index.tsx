import { useState, useEffect } from "react";
import { Header } from "@/components/locax/Header";
import { CategoryTree } from "@/components/locax/CategoryTree";
import { LocalizationTable } from "@/components/locax/LocalizationTable";
import { ScreenshotPanel } from "@/components/locax/ScreenshotPanel";
import { WelcomeScreen } from "@/components/locax/WelcomeScreen";
import { Button } from "@/components/ui/button";
import { writeCSVToFile } from "@/lib/file-system";
import type { LocalizationRow, ProjectState } from "@/types/locax";
import { useToast } from "@/hooks/use-toast";

const Index = () => {
  const { toast } = useToast();
  const [projectState, setProjectState] = useState<ProjectState | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [isScreenshotPanelVisible, setScreenshotPanelVisible] = useState(false);

  // Auto-save on data changes
  useEffect(() => {
    if (!projectState || !projectState.csvFileHandle) return;

    const saveData = async () => {
      try {
        setIsSaving(true);
        await writeCSVToFile(
          projectState.csvFileHandle,
          projectState.languages,
          projectState.rows
        );
        setLastSaved(new Date());
      } catch (error) {
        toast({
          title: "Save failed",
          description: "Could not save changes to file.",
          variant: "destructive",
        });
      } finally {
        setIsSaving(false);
      }
    };

    const timeoutId = setTimeout(saveData, 1000);
    return () => clearTimeout(timeoutId);
  }, [projectState?.rows, projectState?.languages]);

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
    </div>
  );
};

export default Index;
