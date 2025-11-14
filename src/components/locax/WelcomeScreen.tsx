import { Button } from "@/components/ui/button";
import { FolderOpen, Sparkles, Upload } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { ProjectState } from "@/types/locax";
import { parseSourceFile } from "@/lib/source-file-parser";
import { detectGitBranch } from "@/lib/git-utils";
import { checkFileSystemSupport, getSampleData } from "@/lib/file-system";
import { getStoredAiProvider, getStoredApiKey, getStoredModel, getStoredEndpoint } from "@/lib/ai-config";

interface WelcomeScreenProps {
  onProjectLoad: (state: ProjectState) => void;
}

export const WelcomeScreen = ({ onProjectLoad }: WelcomeScreenProps) => {
  const { toast } = useToast();
  const hasFileSystemSupport = checkFileSystemSupport();

  const handleTrySample = () => {
    const { languages, rows } = getSampleData();
    const aiProvider = getStoredAiProvider();
    const aiApiKey = getStoredApiKey(aiProvider) || undefined;
    const aiModel = getStoredModel(aiProvider) || undefined;
    const aiEndpoint = getStoredEndpoint(aiProvider) || undefined;
    
    onProjectLoad({
      folderHandle: null as any,
      csvFileHandle: null as any,
      projectName: 'sample-game-project',
      gitBranch: 'main',
      languages,
      rows,
      aiApiKey,
      aiProvider,
      aiModel,
      aiEndpoint,
    });

    toast({
      title: "Sample project loaded",
      description: "Exploring with demo data. Changes won't be saved.",
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

        const { languages, rows } = await parseSourceFile(file);
        const projectBaseName = file.name.replace(/\.(csv|xlsx|xls)$/i, '');

        const aiProvider = getStoredAiProvider();
        const aiApiKey = getStoredApiKey(aiProvider) || undefined;
        const aiModel = getStoredModel(aiProvider) || undefined;
        const aiEndpoint = getStoredEndpoint(aiProvider) || undefined;

        onProjectLoad({
          folderHandle: null as any,
          csvFileHandle: null as any,
          projectName: projectBaseName || file.name,
          gitBranch: null,
          languages,
          rows,
          aiApiKey,
          aiProvider,
          aiModel,
          aiEndpoint,
        });

        toast({
          title: "Source file imported",
          description: `Loaded ${rows.length} keys. Use File > Export to save changes.`,
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

  return (
    <div className="flex items-center justify-center h-screen bg-background">
      <div className="text-center space-y-6 max-w-md">
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center">
            <svg className="w-7 h-7 text-primary-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2L2 7l10 5 10-5-10-5z"/>
              <path d="M2 17l10 5 10-5"/>
              <path d="M2 12l10 5 10-5"/>
            </svg>
          </div>
          <h1 className="text-4xl font-bold">Locax</h1>
        </div>
        
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold">Game Translation Management</h2>
          <p className="text-muted-foreground">
            Open your game project folder to start managing localization keys, 
            translations, and screenshots with AI assistance.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <Button 
            size="lg" 
            onClick={handleImportSource}
            className="gap-2"
          >
            <Upload className="w-5 h-5" />
            Import Source CSV / Excel
          </Button>

          <Button 
            size="lg"
            variant="outline"
            onClick={handleTrySample}
            className="gap-2"
          >
            <Sparkles className="w-5 h-5" />
            Try Sample Project
          </Button>
        </div>

        <div className="text-sm text-muted-foreground pt-4">
          <p>Import your game's source localization CSV or Excel file to get started.</p>
          <p>All changes can be exported back to the source format.</p>
        </div>
      </div>
    </div>
  );
};
