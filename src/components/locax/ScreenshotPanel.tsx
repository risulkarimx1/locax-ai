import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Upload, Sparkles } from "lucide-react";
import type { LocalizationRow } from "@/types/locax";
import { useToast } from "@/hooks/use-toast";

interface ScreenshotPanelProps {
  selectedRow: LocalizationRow | undefined;
  allRows: LocalizationRow[];
  onUpdateRow: (key: string, updates: Partial<LocalizationRow>) => void;
}

export const ScreenshotPanel = ({ selectedRow, allRows, onUpdateRow }: ScreenshotPanelProps) => {
  const { toast } = useToast();
  const [linkedKeys, setLinkedKeys] = useState<Set<string>>(new Set());
  const [isGeneratingContext, setIsGeneratingContext] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);

  const handleScreenshotUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedRow) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      onUpdateRow(selectedRow.key, { screenshot: base64 });
      toast({
        title: "Screenshot uploaded",
        description: "Screenshot has been attached to this key.",
      });
    };
    reader.readAsDataURL(file);
  };

  const handlePaste = async (e: React.ClipboardEvent) => {
    if (!selectedRow) return;
    
    const items = e.clipboardData?.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const blob = items[i].getAsFile();
        if (blob) {
          const reader = new FileReader();
          reader.onload = (event) => {
            const base64 = event.target?.result as string;
            onUpdateRow(selectedRow.key, { screenshot: base64 });
            toast({
              title: "Screenshot pasted",
              description: "Screenshot has been attached to this key.",
            });
          };
          reader.readAsDataURL(blob);
        }
      }
    }
  };

  const handleGenerateContext = async () => {
    if (!selectedRow) return;
    
    setIsGeneratingContext(true);
    
    // Mock AI call - simulate delay
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    const mockContext = `${selectedRow.translations.en || 'UI element'} - shown in the game interface with visual context from screenshot`;
    onUpdateRow(selectedRow.key, { context: mockContext });
    
    // Update linked keys
    linkedKeys.forEach(key => {
      const row = allRows.find(r => r.key === key);
      if (row) {
        onUpdateRow(key, { context: mockContext });
      }
    });
    
    setIsGeneratingContext(false);
    toast({
      title: "Context generated",
      description: `Updated context for ${linkedKeys.size + 1} keys.`,
    });
  };

  const handleTranslate = async () => {
    if (!selectedRow) return;
    
    setIsTranslating(true);
    
    // Mock AI call - simulate delay
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const mockTranslations = {
      es: `[AI] ${selectedRow.translations.en} (Español)`,
      ja: `[AI] ${selectedRow.translations.en} (日本語)`,
    };
    
    onUpdateRow(selectedRow.key, { 
      translations: { ...selectedRow.translations, ...mockTranslations } 
    });
    
    // Update linked keys
    linkedKeys.forEach(key => {
      const row = allRows.find(r => r.key === key);
      if (row) {
        onUpdateRow(key, { 
          translations: { ...row.translations, ...mockTranslations } 
        });
      }
    });
    
    setIsTranslating(false);
    toast({
      title: "Translations generated",
      description: `Updated translations for ${linkedKeys.size + 1} keys.`,
    });
  };

  const toggleLinkedKey = (key: string) => {
    const newLinked = new Set(linkedKeys);
    if (newLinked.has(key)) {
      newLinked.delete(key);
    } else {
      newLinked.add(key);
    }
    setLinkedKeys(newLinked);
  };

  if (!selectedRow) {
    return (
      <div className="w-64 border-l bg-panel shrink-0 flex items-center justify-center p-8">
        <p className="text-sm text-muted-foreground text-center">
          Select a key to view and manage screenshots
        </p>
      </div>
    );
  }

  return (
    <div className="w-64 border-l bg-panel shrink-0 flex flex-col">
      <div className="p-4 border-b">
        <h3 className="font-semibold text-sm">Screenshot Context</h3>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Screenshot Upload */}
        <div 
          className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary transition-colors"
          onPaste={handlePaste}
        >
          {selectedRow.screenshot ? (
            <img 
              src={selectedRow.screenshot} 
              alt="Screenshot" 
              className="w-full rounded-lg mb-2"
            />
          ) : (
            <div className="space-y-2">
              <Upload className="w-8 h-8 mx-auto text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Drag and drop or click to upload
              </p>
              <p className="text-xs text-muted-foreground">
                Or paste from clipboard
              </p>
            </div>
          )}
          <input
            type="file"
            accept="image/*"
            onChange={handleScreenshotUpload}
            className="hidden"
            id="screenshot-upload"
          />
          <label htmlFor="screenshot-upload" className="cursor-pointer">
            <Button variant="outline" size="sm" className="mt-2" asChild>
              <span>{selectedRow.screenshot ? 'Change' : 'Upload'}</span>
            </Button>
          </label>
        </div>

        {/* Linked Keys */}
        <div>
          <h4 className="text-sm font-semibold mb-2">Linked Keys</h4>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {allRows
              .filter(row => row.key !== selectedRow.key)
              .slice(0, 10)
              .map(row => (
                <div key={row.key} className="flex items-center gap-2">
                  <Checkbox
                    checked={linkedKeys.has(row.key)}
                    onCheckedChange={() => toggleLinkedKey(row.key)}
                  />
                  <span className="text-sm">{row.key}</span>
                </div>
              ))}
          </div>
        </div>

        {/* Token Usage (Mock) */}
        <div>
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
            <span>Token Usage</span>
            <span>847 / 1,000</span>
          </div>
          <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden">
            <div className="h-full bg-primary" style={{ width: '85%' }} />
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="p-4 border-t space-y-2">
        <Button 
          variant="outline" 
          className="w-full gap-2"
          onClick={handleGenerateContext}
          disabled={isGeneratingContext || !selectedRow.screenshot}
        >
          <Sparkles className="w-4 h-4" />
          {isGeneratingContext ? 'Generating...' : 'Generate Context'}
        </Button>
        <Button 
          className="w-full gap-2"
          onClick={handleTranslate}
          disabled={isTranslating || !selectedRow.translations.en}
        >
          <Sparkles className="w-4 h-4" />
          {isTranslating ? 'Translating...' : 'Translate'}
        </Button>
      </div>
    </div>
  );
};
