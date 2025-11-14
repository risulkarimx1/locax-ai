import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Search, Globe, Zap, GitBranch, Plus, Trash2, Download, Upload, Menu } from "lucide-react";
import { AutoSaveIndicator } from "@/components/locax/AutoSaveIndicator";
import type { ProjectState } from "@/types/locax";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { parseSourceCSV } from "@/lib/csv-parser";
import { exportSourceCSV } from "@/lib/file-system";

interface HeaderProps {
  projectState: ProjectState;
  setProjectState: (state: ProjectState) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  isSaving: boolean;
  lastSaved: Date | null;
}

export const Header = ({ 
  projectState, 
  setProjectState, 
  searchQuery, 
  setSearchQuery,
  isSaving,
  lastSaved 
}: HeaderProps) => {
  const { toast } = useToast();
  const [aiDialogOpen, setAiDialogOpen] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [addLanguageDialogOpen, setAddLanguageDialogOpen] = useState(false);
  const [newLanguageName, setNewLanguageName] = useState("");
  const [newLanguageCode, setNewLanguageCode] = useState("");

  const handleSaveApiKey = () => {
    localStorage.setItem('locax-ai-key', apiKeyInput);
    setProjectState({ ...projectState, aiApiKey: apiKeyInput });
    setAiDialogOpen(false);
    toast({
      title: "AI Connected",
      description: "Your API key has been saved securely.",
    });
  };

  const handleAddLanguage = () => {
    if (!newLanguageCode || projectState.languages.includes(newLanguageCode)) {
      toast({
        title: "Invalid language code",
        description: "Please enter a unique language code.",
        variant: "destructive",
      });
      return;
    }

    setProjectState({
      ...projectState,
      languages: [...projectState.languages, newLanguageCode],
      rows: projectState.rows.map(row => ({
        ...row,
        translations: { ...row.translations, [newLanguageCode]: "" }
      }))
    });

    setAddLanguageDialogOpen(false);
    setNewLanguageName("");
    setNewLanguageCode("");
    
    toast({
      title: "Language added",
      description: `${newLanguageName} (${newLanguageCode}) has been added.`,
    });
  };

  const handleRemoveLanguage = (langCode: string) => {
    if (langCode === 'en') {
      toast({
        title: "Cannot remove English",
        description: "English is the base language and cannot be removed.",
        variant: "destructive",
      });
      return;
    }

    setProjectState({
      ...projectState,
      languages: projectState.languages.filter(l => l !== langCode),
      rows: projectState.rows.map(row => {
        const { [langCode]: removed, ...rest } = row.translations;
        return { ...row, translations: rest };
      })
    });

    toast({
      title: "Language removed",
      description: `${langCode} has been removed from the project.`,
    });
  };

  const handleImportSource = async () => {
    try {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.csv';
      
      input.onchange = async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;

        const csvContent = await file.text();
        const { languages, rows } = parseSourceCSV(csvContent);

        setProjectState({
          ...projectState,
          languages,
          rows,
        });

        toast({
          title: "Source CSV imported",
          description: `Imported ${rows.length} keys with ${languages.length} languages.`,
        });
      };

      input.click();
    } catch (error) {
      toast({
        title: "Import failed",
        description: (error as Error).message,
        variant: "destructive",
      });
    }
  };

  const handleExportSource = async () => {
    try {
      await exportSourceCSV(projectState.languages, projectState.rows, projectState.projectName);
      
      toast({
        title: "Export complete",
        description: "Source CSV has been downloaded.",
      });
    } catch (error) {
      toast({
        title: "Export failed",
        description: (error as Error).message,
        variant: "destructive",
      });
    }
  };

  return (
    <>
      <header className="flex items-center justify-between h-14 px-4 border-b bg-panel shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <svg className="w-5 h-5 text-primary-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2L2 7l10 5 10-5-10-5z"/>
                <path d="M2 17l10 5 10-5"/>
                <path d="M2 12l10 5 10-5"/>
              </svg>
            </div>
            <span className="font-bold text-lg">Locax</span>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                <Menu className="w-4 h-4 mr-2" />
                File
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={handleImportSource}>
                <Upload className="w-4 h-4 mr-2" />
                Import Source CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportSource}>
                <Download className="w-4 h-4 mr-2" />
                Export Source CSV
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="h-6 w-px bg-border" />

          <span className="text-sm text-muted-foreground">{projectState.projectName}</span>

          {projectState.gitBranch && (
            <Badge variant="secondary" className="gap-1.5">
              <GitBranch className="w-3 h-3" />
              {projectState.gitBranch}
            </Badge>
          )}

          <AutoSaveIndicator isSaving={isSaving} lastSaved={lastSaved} />
        </div>

        <div className="flex items-center gap-3">
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search keys..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <Globe className="w-4 h-4" />
                Languages
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {projectState.languages.map(lang => (
                <div key={lang} className="flex items-center justify-between px-2 py-1.5">
                  <span className="text-sm">{lang}</span>
                  {lang !== 'en' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={() => handleRemoveLanguage(lang)}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  )}
                </div>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setAddLanguageDialogOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Add Language
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant={projectState.aiApiKey ? "outline" : "default"}
            size="sm"
            className="gap-2"
            onClick={() => setAiDialogOpen(true)}
          >
            <Zap className="w-4 h-4" />
            {projectState.aiApiKey ? (
              <>
                AI
                <div className="w-2 h-2 rounded-full bg-success" />
              </>
            ) : (
              "Connect AI"
            )}
          </Button>
        </div>
      </header>

      <Dialog open={aiDialogOpen} onOpenChange={setAiDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Connect AI</DialogTitle>
            <DialogDescription>
              Enter your OpenAI API key to enable AI-powered context generation and translations.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="apiKey">API Key</Label>
              <Input
                id="apiKey"
                type="password"
                placeholder="sk-..."
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
              />
            </div>
            <p className="text-sm text-muted-foreground">
              Your API key is stored locally and never sent to our servers.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAiDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveApiKey}>Save Key</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addLanguageDialogOpen} onOpenChange={setAddLanguageDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Language</DialogTitle>
            <DialogDescription>
              Add a new language to your localization project.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="langName">Language Name</Label>
              <Input
                id="langName"
                placeholder="e.g., Spanish, Japanese"
                value={newLanguageName}
                onChange={(e) => setNewLanguageName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="langCode">Language Code</Label>
              <Input
                id="langCode"
                placeholder="e.g., es, ja, fr"
                value={newLanguageCode}
                onChange={(e) => setNewLanguageCode(e.target.value.toLowerCase())}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddLanguageDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddLanguage}>Add Language</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
