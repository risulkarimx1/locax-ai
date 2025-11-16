import { useMemo, useState } from "react";
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
  const [newKeyDescription, setNewKeyDescription] = useState("");
  const [newKeyContext, setNewKeyContext] = useState("");

  const { categorized, uncategorized } = useMemo(() => {
    const grouped: Record<string, LocalizationRow[]> = {};
    const noCategory: LocalizationRow[] = [];

    for (const row of rows) {
      const colonIndex = row.key.indexOf(":");
      const hasCategory = colonIndex > 0 && colonIndex < row.key.length - 1;

      if (!hasCategory) {
        noCategory.push(row);
        continue;
      }

      const category = row.key.slice(0, colonIndex);
      if (!grouped[category]) {
        grouped[category] = [];
      }
      grouped[category].push(row);
    }

    return { categorized: grouped, uncategorized: noCategory };
  }, [rows]);

  const categoryList = useMemo(
    () => Object.keys(categorized).sort((a, b) => a.localeCompare(b)),
    [categorized]
  );

  const openAddKeyDialog = (category?: string) => {
    const fallbackCategory = category ?? categoryList[0] ?? "";
    setSelectedCategory(fallbackCategory);
    setAddKeyDialogOpen(true);
  };

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
    const trimmedCategory = selectedCategory.trim();
    const trimmedKey = newKeyName.trim();
    const trimmedEnglish = newKeyEnglish.trim();

    if (!trimmedCategory || !trimmedKey || !trimmedEnglish) {
      return;
    }

    const fullKey = `${trimmedCategory}:${trimmedKey}`;
    const newRow: LocalizationRow = {
      key: fullKey,
      type: "Text",
      description: newKeyDescription.trim(),
      context: newKeyContext.trim(),
      translations: { en: trimmedEnglish },
    };

    onAddKey(trimmedCategory, newRow);
    setAddKeyDialogOpen(false);
    setNewKeyName("");
    setNewKeyEnglish("");
    setNewKeyDescription("");
    setNewKeyContext("");
    onSelectKey(fullKey);
  };

  return (
    <>
      <div className="w-64 border-r bg-panel shrink-0 flex flex-col">
        <div className="p-4 border-b flex items-center justify-between gap-2">
          <div>
            <h3 className="font-semibold text-sm">Key Tree</h3>
            <p className="text-xs text-muted-foreground mt-1">{rows.length} keys</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => openAddKeyDialog()}
            aria-label="Add new key"
          >
            <Plus className="w-4 h-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {Object.entries(categorized).map(([category, categoryRows]) => (
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
                  onClick={() => openAddKeyDialog(category)}
                >
                  <Plus className="w-3.5 h-3.5" />
                </Button>
              </div>

              {expandedCategories.has(category) && (
                <div className="ml-5 mt-0.5 space-y-0.5">
                  {categoryRows.map(row => {
                    const colonIndex = row.key.indexOf(":");
                    const keyName = colonIndex >= 0 ? row.key.slice(colonIndex + 1) || row.key : row.key;
                    return (
                      <button
                        key={row.key}
                        onClick={() => onSelectKey(row.key)}
                        className={cn(
                          "w-full text-left px-2 py-1.5 text-sm rounded hover:bg-panel-hover",
                          selectedKey === row.key && "bg-primary/10 text-primary font-semibold shadow-[0_0_0_1px_rgba(59,130,246,0.35)]"
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

          {uncategorized.length > 0 && (
            <div className="mt-3">
              <p className="px-2 py-1 text-xs font-semibold uppercase text-muted-foreground">Other Keys</p>
              <div className="space-y-0.5">
                {uncategorized.map(row => (
                  <button
                    key={row.key}
                    onClick={() => onSelectKey(row.key)}
                    className={cn(
                      "w-full text-left px-2 py-1.5 text-sm rounded hover:bg-panel-hover",
                      selectedKey === row.key && "bg-primary/10 text-primary font-semibold shadow-[0_0_0_1px_rgba(59,130,246,0.35)]"
                    )}
                  >
                    {row.key}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <Dialog open={addKeyDialogOpen} onOpenChange={setAddKeyDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Key</DialogTitle>
            <DialogDescription>
              {selectedCategory
                ? `Key will be placed under the ${selectedCategory} category.`
                : "Choose a category for this localization key."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="categoryName">Category</Label>
              <Input
                id="categoryName"
                placeholder="e.g., ui"
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
              />
              {categoryList.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {categoryList.map(category => (
                    <button
                      type="button"
                      key={category}
                      onClick={() => setSelectedCategory(category)}
                      className={cn(
                        "px-2 py-0.5 rounded-full border text-xs",
                        selectedCategory === category
                          ? "border-primary text-primary bg-primary/10"
                          : "border-border text-muted-foreground hover:bg-panel-hover"
                      )}
                    >
                      {category}
                    </button>
                  ))}
                </div>
              )}
            </div>
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
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea
                id="description"
                placeholder="e.g., Main menu start button"
                value={newKeyDescription}
                onChange={(e) => setNewKeyDescription(e.target.value)}
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="context">Context (optional)</Label>
              <Textarea
                id="context"
                placeholder="e.g., Describe usage for translators"
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
            <Button
              onClick={handleAddKey}
              disabled={!selectedCategory.trim() || !newKeyName.trim() || !newKeyEnglish.trim()}
            >
              Add Key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
