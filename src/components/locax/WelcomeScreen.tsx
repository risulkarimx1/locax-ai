import { Button } from "@/components/ui/button";
import { FolderOpen, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { ProjectState } from "@/types/locax";
import { parseCSV } from "@/lib/csv-parser";
import { detectGitBranch } from "@/lib/git-utils";
import { checkFileSystemSupport, getSampleData } from "@/lib/file-system";

interface WelcomeScreenProps {
  onProjectLoad: (state: ProjectState) => void;
}

export const WelcomeScreen = ({ onProjectLoad }: WelcomeScreenProps) => {
  const { toast } = useToast();
  const hasFileSystemSupport = checkFileSystemSupport();

  const handleTrySample = () => {
    const { languages, rows } = getSampleData();
    
    onProjectLoad({
      folderHandle: null as any,
      csvFileHandle: null as any,
      projectName: 'sample-game-project',
      gitBranch: 'main',
      languages,
      rows,
      aiApiKey: undefined,
    });

    toast({
      title: "Sample project loaded",
      description: "Exploring with demo data. Changes won't be saved.",
    });
  };

  const handleOpenProject = async () => {
    if (!hasFileSystemSupport) {
      toast({
        title: "Not supported",
        description: "File System Access API is not supported in this browser. Try Chrome or Edge.",
        variant: "destructive",
      });
      return;
    }
    try {
      // @ts-ignore - File System Access API
      const folderHandle = await window.showDirectoryPicker();
      
      // Ask user to select CSV file
      const files: FileSystemFileHandle[] = [];
      for await (const entry of folderHandle.values()) {
        if (entry.kind === 'file' && entry.name.endsWith('.csv')) {
          files.push(entry);
        }
      }

      if (files.length === 0) {
        toast({
          title: "No CSV files found",
          description: "Please select a folder containing a localization CSV file.",
          variant: "destructive",
        });
        return;
      }

      // For now, take the first CSV file
      const csvFileHandle = files[0];
      const file = await csvFileHandle.getFile();
      const csvContent = await file.text();

      // Parse CSV
      const { languages, rows } = parseCSV(csvContent);

      // Detect Git branch
      const gitBranch = await detectGitBranch(folderHandle);

      // Load AI key from localStorage
      const aiApiKey = localStorage.getItem('locax-ai-key') || undefined;

      onProjectLoad({
        folderHandle,
        csvFileHandle,
        projectName: folderHandle.name,
        gitBranch,
        languages,
        rows,
        aiApiKey,
      });

      toast({
        title: "Project loaded",
        description: `Successfully loaded ${rows.length} localization keys.`,
      });
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        toast({
          title: "Error loading project",
          description: (error as Error).message,
          variant: "destructive",
        });
      }
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
            onClick={handleOpenProject}
            className="gap-2"
            disabled={!hasFileSystemSupport}
          >
            <FolderOpen className="w-5 h-5" />
            Open Project Folder
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

        {!hasFileSystemSupport && (
          <p className="text-sm text-destructive">
            File System Access API not supported. Use Chrome or Edge, or try the sample project.
          </p>
        )}

        <div className="text-sm text-muted-foreground pt-4">
          <p>Locax works with your local CSV files and Git repository.</p>
          <p>All changes are saved automatically.</p>
        </div>
      </div>
    </div>
  );
};
