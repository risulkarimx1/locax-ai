import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, Globe, Zap, GitCommit, Save, Plus, Trash2, Download, Upload, Menu, Home } from "lucide-react";
import { AutoSaveIndicator } from "@/components/locax/AutoSaveIndicator";
import type { ProjectState, AIProvider, LocalizationRow } from "@/types/locax";
import { useEffect, useMemo, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { parseSourceFile } from "@/lib/source-file-parser";
import { exportSourceCSV } from "@/lib/file-system";
import { DEFAULT_AI_PROVIDER, getStoredApiKey, getStoredEndpoint, getStoredModel, persistAiSettings } from "@/lib/ai-config";
import { ThemeToggle } from "@/components/ThemeToggle";

type OllamaTagsResponse = {
  models?: Array<{ name?: string }>;
};

const hasTextProperty = (value: unknown): value is { text: string } =>
  typeof value === "object" && value !== null && typeof (value as { text?: unknown }).text === "string";

interface HeaderProps {
  projectState: ProjectState;
  setProjectState: (state: ProjectState) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  isSaving: boolean;
  lastSaved: Date | null;
  onManualSave: () => void;
  manualSaveDisabled: boolean;
  isManualSaving: boolean;
  selectedKey: string | null;
  onDeleteKey: (key: string) => void;
  onExitProject: () => Promise<void> | void;
}

export const Header = ({ 
  projectState, 
  setProjectState, 
  searchQuery, 
  setSearchQuery,
  isSaving,
  lastSaved,
  onManualSave,
  manualSaveDisabled,
  isManualSaving,
  selectedKey,
  onDeleteKey,
  onExitProject,
}: HeaderProps) => {
  const { toast } = useToast();
  const displayProjectName = projectState.folderHandle?.name ?? projectState.projectName;
  const DEFAULT_OLLAMA_ENDPOINT = "http://127.0.0.1:11434";
  const [aiDialogOpen, setAiDialogOpen] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [modelInput, setModelInput] = useState("");
  const [endpointInput, setEndpointInput] = useState("");
  const [providerSelection, setProviderSelection] = useState<AIProvider>(projectState.aiProvider || DEFAULT_AI_PROVIDER);
  const [addLanguageDialogOpen, setAddLanguageDialogOpen] = useState(false);
  const [newLanguageName, setNewLanguageName] = useState("");
  const [newLanguageCode, setNewLanguageCode] = useState("");
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [ollamaLoading, setOllamaLoading] = useState(false);
  const [ollamaError, setOllamaError] = useState<string | null>(null);
  const [modelManuallySet, setModelManuallySet] = useState(false);
  const [ollamaRefreshCounter, setOllamaRefreshCounter] = useState(0);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const providerLabels: Record<AIProvider, string> = useMemo(
    () => ({
      openai: "OpenAI",
      gemini: "Gemini",
      openrouter: "OpenRouter",
      ollama: "Ollama",
    }),
    []
  );
  const activeProvider = projectState.aiProvider || DEFAULT_AI_PROVIDER;
  const activeProviderLabel = providerLabels[activeProvider];
  const isAiConfigured = projectState.aiProvider === "ollama" ? Boolean(projectState.aiModel) : Boolean(projectState.aiApiKey);
  const ollamaSelectValue = useMemo(
    () => (ollamaModels.includes(modelInput) ? modelInput : undefined),
    [ollamaModels, modelInput]
  );
  const sanitizeEndpoint = (value: string) => (value ? value.trim().replace(/\/+$/, "") : "");

  useEffect(() => {
    if (!aiDialogOpen) return;

    const provider = projectState.aiProvider || DEFAULT_AI_PROVIDER;
    setProviderSelection(provider);
    setApiKeyInput(projectState.aiApiKey || getStoredApiKey(provider) || "");
    const storedModel = projectState.aiModel || getStoredModel(provider) || "";
    setModelInput(provider === "openrouter" || provider === "ollama" ? storedModel : "");
    const storedEndpoint =
      provider === "ollama"
        ? projectState.aiEndpoint || getStoredEndpoint(provider) || DEFAULT_OLLAMA_ENDPOINT
        : "";
    setEndpointInput(storedEndpoint);
    setModelManuallySet(Boolean(storedModel));
    if (provider !== "ollama") {
      setOllamaModels([]);
      setOllamaError(null);
    }
  }, [
    aiDialogOpen,
    projectState.aiApiKey,
    projectState.aiEndpoint,
    projectState.aiModel,
    projectState.aiProvider,
  ]);

  useEffect(() => {
    if (!aiDialogOpen || providerSelection !== "ollama") {
      return;
    }

    const base = sanitizeEndpoint(endpointInput || DEFAULT_OLLAMA_ENDPOINT);
    if (!base) return;

    let cancelled = false;
    setOllamaLoading(true);
    setOllamaError(null);

    const timeoutId = setTimeout(async () => {
      try {
        const response = await fetch(`${base}/api/tags`);
        if (!response.ok) {
          throw new Error(await response.text());
        }
        const data: OllamaTagsResponse = await response.json();
        const models = Array.isArray(data.models)
          ? data.models
              .map(model => model?.name)
              .filter((name): name is string => typeof name === "string")
          : [];
        if (!cancelled) {
          setOllamaModels(models);
          setModelInput((current) => {
            if (current || !models.length || modelManuallySet) {
              return current;
            }
            return models[0];
          });
        }
      } catch (error) {
        if (!cancelled) {
          setOllamaModels([]);
          setOllamaError(`Could not reach Ollama at ${base}. Ensure the daemon is running.`);
        }
      } finally {
        if (!cancelled) {
          setOllamaLoading(false);
        }
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [
    aiDialogOpen,
    providerSelection,
    endpointInput,
    modelManuallySet,
    ollamaRefreshCounter,
  ]);

  const handleProviderSelect = (value: AIProvider) => {
    setProviderSelection(value);
    setApiKeyInput(getStoredApiKey(value) || "");
    const storedModel = getStoredModel(value) || "";
    setModelInput(value === "openrouter" || value === "ollama" ? storedModel : "");
    setModelManuallySet(Boolean(storedModel));
    if (value === "ollama") {
      setEndpointInput(getStoredEndpoint(value) || projectState.aiEndpoint || DEFAULT_OLLAMA_ENDPOINT);
    } else {
      setEndpointInput("");
      setOllamaModels([]);
      setOllamaError(null);
    }
  };

  const handleModelValueChange = (value: string) => {
    setModelManuallySet(true);
    setModelInput(value);
  };

  const handleSaveApiKey = () => {
    const requiresApiKey = providerSelection !== "ollama";
    const trimmedKey = requiresApiKey ? apiKeyInput.trim() : "";
    const resolvedApiKey = requiresApiKey ? trimmedKey || undefined : undefined;
    const trimmedModel =
      providerSelection === "openrouter" || providerSelection === "ollama"
        ? modelInput.trim()
        : undefined;
    const resolvedEndpoint =
      providerSelection === "ollama"
        ? sanitizeEndpoint(endpointInput || DEFAULT_OLLAMA_ENDPOINT) || DEFAULT_OLLAMA_ENDPOINT
        : undefined;

    if (providerSelection === "openrouter" && resolvedApiKey && !trimmedModel) {
      toast({
        title: "Model required",
        description: "Enter an OpenRouter model identifier (e.g., google/gemini-flash-1.5).",
        variant: "destructive",
      });
      return;
    }

    if (providerSelection === "ollama" && !trimmedModel) {
      toast({
        title: "Model required",
        description: "Select an Ollama model or enter one manually.",
        variant: "destructive",
      });
      return;
    }

    persistAiSettings(providerSelection, {
      apiKey: resolvedApiKey,
      model: trimmedModel,
      endpoint: resolvedEndpoint,
    });
    setProjectState({
      ...projectState,
      aiApiKey: resolvedApiKey,
      aiProvider: providerSelection,
      aiModel: providerSelection === "openrouter" || providerSelection === "ollama" ? trimmedModel : undefined,
      aiEndpoint: providerSelection === "ollama" ? resolvedEndpoint : undefined,
    });
    setAiDialogOpen(false);

    const connected =
      providerSelection === "ollama" ? Boolean(trimmedModel) : Boolean(resolvedApiKey);

    toast({
      title: connected ? "AI Connected" : "AI Disconnected",
      description: connected
        ? `${providerLabels[providerSelection]} will power automatic translations.`
        : "Stored AI configuration removed.",
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
      })),
      sourceDirty: true,
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
      }),
      sourceDirty: true,
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
      input.accept = '.csv,.xlsx,.xls';
      
      input.onchange = async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;

        const parsed = await parseSourceFile(file);
        const existingMap = projectState.rows.reduce<Record<string, LocalizationRow>>((acc, row) => {
          acc[row.key] = row;
          return acc;
        }, {});

        const mergedRows = parsed.rows.map(row => {
          const existing = existingMap[row.key];
          if (!existing) {
            return row;
          }

          return {
            ...row,
            context: existing.context,
            screenshot: existing.screenshot,
            linkedKeys: existing.linkedKeys,
            notes: existing.notes,
          };
        });

        setProjectState({
          ...projectState,
          languages: parsed.languages,
          rows: mergedRows,
          workbookRowMap: parsed.workbookRowMap,
          languageColumnMap: parsed.languageColumnMap,
          sourceHeaders: parsed.header,
          descColumn: parsed.descColumn,
          typeColumn: parsed.typeColumn,
          sourceDirty: false,
          metaDirty: false,
          sourceLastModified: file.lastModified,
        });

        toast({
          title: "Source file imported",
          description: `Imported ${mergedRows.length} keys with ${parsed.languages.length} languages.`,
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
      await exportSourceCSV({
        languages: projectState.languages,
        rows: projectState.rows,
        projectName: projectState.projectName,
        header: projectState.sourceHeaders,
        languageColumnMap: projectState.languageColumnMap,
        descColumn: projectState.descColumn,
        typeColumn: projectState.typeColumn,
      });
      
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

  const handleDeleteSelectedKey = () => {
    if (!selectedKey) return;
    onDeleteKey(selectedKey);
    setConfirmDeleteOpen(false);
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

        <Button
          variant="ghost"
          size="sm"
          className="gap-2"
          onClick={() => {
            void onExitProject();
          }}
        >
          <Home className="w-4 h-4" />
          Home
        </Button>

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
                Import Source CSV / Excel
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportSource}>
                <Download className="w-4 h-4 mr-2" />
                Export Source CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onManualSave} disabled={manualSaveDisabled}>
                <Save className="w-4 h-4 mr-2" />
                Save to Source
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="ghost"
            size="sm"
            className="gap-2 text-destructive"
            disabled={!selectedKey}
            onClick={() => setConfirmDeleteOpen(true)}
          >
            <Trash2 className="w-4 h-4" />
            Delete key
          </Button>

          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={onManualSave}
            disabled={manualSaveDisabled}
          >
            <Save className="w-4 h-4" />
            {isManualSaving ? "Saving..." : "Save"}
          </Button>

          <div className="h-6 w-px bg-border" />

          <span className="text-sm text-muted-foreground">{displayProjectName}</span>

          {projectState.gitStatus === "found" && projectState.gitBranch && (
            <div className="flex items-center gap-2 rounded-full border border-border/80 px-3 py-1 text-xs font-medium text-muted-foreground bg-muted/50 dark:bg-white/5">
              <GitCommit className="w-3.5 h-3.5 text-primary" />
              <span className="text-foreground">{projectState.gitBranch}</span>
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
            </div>
          )}

          {projectState.gitStatus === "missing" && (
            <div className="flex items-center gap-2 rounded-full border border-destructive/40 px-3 py-1 text-xs font-medium text-destructive bg-destructive/10">
              <GitCommit className="w-3.5 h-3.5" />
              <span>Git not found</span>
              <span className="w-2 h-2 rounded-full bg-destructive" />
            </div>
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
            variant={isAiConfigured ? "outline" : "default"}
            size="sm"
            className="gap-2"
            onClick={() => setAiDialogOpen(true)}
          >
            <Zap className="w-4 h-4" />
            {isAiConfigured ? (
              <>
                {activeProviderLabel}
                <div className="w-2 h-2 rounded-full bg-success" />
              </>
            ) : (
              "Connect AI"
            )}
          </Button>

          <ThemeToggle />
        </div>
      </header>

      <Dialog open={aiDialogOpen} onOpenChange={setAiDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Connect AI</DialogTitle>
            <DialogDescription>
              Choose OpenAI, Gemini, OpenRouter, or Ollama and configure the required credentials to enable AI-powered context generation and translations.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Provider</Label>
              <Select value={providerSelection} onValueChange={(value) => handleProviderSelect(value as AIProvider)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select an AI provider" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="openai">OpenAI</SelectItem>
                  <SelectItem value="gemini">Gemini</SelectItem>
                  <SelectItem value="openrouter">OpenRouter</SelectItem>
                  <SelectItem value="ollama">Ollama (Local)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {providerSelection !== "ollama" && (
              <div className="space-y-2">
                <Label htmlFor="apiKey">API Key</Label>
                <Input
                  id="apiKey"
                  type="password"
                  placeholder={
                    providerSelection === "gemini"
                      ? "AIza..."
                      : providerSelection === "openrouter"
                        ? "or-..."
                        : "sk-..."
                  }
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                />
              </div>
            )}
            {providerSelection === "openrouter" && (
              <div className="space-y-2">
                <Label htmlFor="modelId">Model ID</Label>
                <Input
                  id="modelId"
                  placeholder="e.g., google/gemini-flash-1.5"
                  value={modelInput}
                  onChange={(e) => handleModelValueChange(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Pick any model ID listed on openrouter.ai/models. Leave blank when using OpenAI or Gemini directly.
                </p>
              </div>
            )}
            {providerSelection === "ollama" && (
              <div className="space-y-4 rounded-md border p-4 bg-muted/30">
                <div className="space-y-2">
                  <Label htmlFor="ollamaEndpoint">Ollama Endpoint</Label>
                  <Input
                    id="ollamaEndpoint"
                    placeholder="http://127.0.0.1:11434"
                    value={endpointInput}
                    onChange={(e) => setEndpointInput(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Ensure <code>ollama serve</code> is running locally so Locax can reach your models.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Local Models</Label>
                  {ollamaLoading && (
                    <p className="text-xs text-muted-foreground">Detecting local models...</p>
                  )}
                  {ollamaError && (
                    <p className="text-xs text-destructive">{ollamaError}</p>
                  )}
                  {ollamaModels.length > 0 && (
                    <Select value={ollamaSelectValue} onValueChange={(value) => handleModelValueChange(value)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a local model" />
                      </SelectTrigger>
                      <SelectContent>
                        {ollamaModels.map((model) => (
                          <SelectItem key={model} value={model}>
                            {model}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <div className="flex items-center gap-2">
                    <Input
                      placeholder="e.g., codellama:34b"
                      value={modelInput}
                      onChange={(e) => handleModelValueChange(e.target.value)}
                    />
                    <Button type="button" variant="outline" size="sm" onClick={() => setOllamaRefreshCounter((count) => count + 1)}>
                      Refresh
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Select a detected model or type one manually. No API key is required for local models.
                  </p>
                </div>
              </div>
            )}
            <p className="text-sm text-muted-foreground">
              Your provider settings are stored locally and never sent to our servers.
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

      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this key?</AlertDialogTitle>
            <AlertDialogDescription>
              {selectedKey
                ? `"${selectedKey}" will be removed from the spreadsheet and meta file on the next save.`
                : "Select a key from the table before deleting."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteSelectedKey} disabled={!selectedKey} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete key
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
