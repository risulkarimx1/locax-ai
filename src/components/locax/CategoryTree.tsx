import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ChevronRight, ChevronDown, Plus, FileText } from "lucide-react";
import type { LocalizationRow } from "@/types/locax";
import { cn } from "@/lib/utils";

interface CategoryTreeProps {
  rows: LocalizationRow[];
  selectedKey: string | null;
  onSelectKey: (key: string) => void;
  onAddKey: (category: string, newRow: LocalizationRow) => void;
}

export const CategoryTree = ({ rows, selectedKey, onSelectKey, onAddKey }: CategoryTreeProps) => {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['ui', 'dialog']));
  const [addKeyDialogOpen, setAddKeyDialogOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyEnglish, setNewKeyEnglish] = useState("");
  const [newKeyContext, setNewKeyContext] = useState("");

  // Group rows by category
  const categories = rows.reduce((acc, row) => {
    const [category] = row.key.split(':');
    if (!acc[category]) acc[category] = [];
    acc[category].push(row);
    return acc;
  }, {} as Record<string, LocalizationRow[]>);

  const toggleCategory = (category: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(category)) {
      newExpanded.delete(category);
    } else {
      newExpanded.add(category);
    }
    setExpandedCategories(newExpanded);
  };

  const handleAddKey = () => {
    if (!newKeyName || !newKeyEnglish) return;

    const fullKey = `${selectedCategory}:${newKeyName}`;
    const newRow: LocalizationRow = {
      key: fullKey,
      context: newKeyContext,
      translations: { en: newKeyEnglish },
    };

    onAddKey(selectedCategory, newRow);
    setAddKeyDialogOpen(false);
    setNewKeyName("");
    setNewKeyEnglish("");
    setNewKeyContext("");
    onSelectKey(fullKey);
  };

  return (
    <>
      <div className="w-64 border-r bg-panel shrink-0 flex flex-col">
        <div className="p-4 border-b">
          <h3 className="font-semibold text-sm">Key Tree</h3>
          <p className="text-xs text-muted-foreground mt-1">{rows.length} keys</p>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {Object.entries(categories).map(([category, categoryRows]) => (
            <div key={category} className="mb-1">
              <div className="flex items-center justify-between group">
                <button
                  onClick={() => toggleCategory(category)}
                  className="flex items-center gap-1 px-2 py-1.5 text-sm rounded hover:bg-panel-hover flex-1"
                >
                  {expandedCategories.has(category) ? (
                    <ChevronDown className="w-4 h-4" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}
                  <FileText className="w-4 h-4 text-muted-foreground" />
                  <span>{category}</span>
                  <span className="text-xs text-muted-foreground ml-auto">
                    {categoryRows.length}
                  </span>
                </button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100"
                  onClick={() => {
                    setSelectedCategory(category);
                    setAddKeyDialogOpen(true);
                  }}
                >
                  <Plus className="w-3.5 h-3.5" />
                </Button>
              </div>

              {expandedCategories.has(category) && (
                <div className="ml-5 mt-0.5 space-y-0.5">
                  {categoryRows.map(row => {
                    const keyName = row.key.split(':')[1];
                    return (
                      <button
                        key={row.key}
                        onClick={() => onSelectKey(row.key)}
                        className={cn(
                          "w-full text-left px-2 py-1.5 text-sm rounded hover:bg-panel-hover",
                          selectedKey === row.key && "bg-primary/10 text-primary font-medium"
                        )}
                      >
                        {keyName}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <Dialog open={addKeyDialogOpen} onOpenChange={setAddKeyDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Key to {selectedCategory}</DialogTitle>
            <DialogDescription>
              Create a new localization key under the {selectedCategory} category.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="keyName">Key Name</Label>
              <Input
                id="keyName"
                placeholder="e.g., start_button"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="english">English Text (required)</Label>
              <Input
                id="english"
                placeholder="e.g., Start Game"
                value={newKeyEnglish}
                onChange={(e) => setNewKeyEnglish(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="context">Context</Label>
              <Textarea
                id="context"
                placeholder="e.g., Main menu start button"
                value={newKeyContext}
                onChange={(e) => setNewKeyContext(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddKeyDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddKey} disabled={!newKeyName || !newKeyEnglish}>
              Add Key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
