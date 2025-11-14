import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/locax/EmptyState";
import type { LocalizationRow } from "@/types/locax";
import { cn } from "@/lib/utils";

interface LocalizationTableProps {
  rows: LocalizationRow[];
  languages: string[];
  selectedKey: string | null;
  onSelectKey: (key: string) => void;
  onUpdateRow: (key: string, updates: Partial<LocalizationRow>) => void;
}

export const LocalizationTable = ({ 
  rows, 
  languages, 
  selectedKey, 
  onSelectKey, 
  onUpdateRow 
}: LocalizationTableProps) => {
  const [editingCell, setEditingCell] = useState<{ key: string; field: string } | null>(null);
  const [editValue, setEditValue] = useState("");

  const startEditing = (key: string, field: string, currentValue: string) => {
    setEditingCell({ key, field });
    setEditValue(currentValue);
  };

  const saveEdit = () => {
    if (!editingCell) return;

    const { key, field } = editingCell;
    
    if (field === 'context') {
      onUpdateRow(key, { context: editValue });
    } else {
      const row = rows.find(r => r.key === key);
      if (row) {
        onUpdateRow(key, {
          translations: { ...row.translations, [field]: editValue }
        });
      }
    }

    setEditingCell(null);
    setEditValue("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      saveEdit();
    } else if (e.key === 'Escape') {
      setEditingCell(null);
      setEditValue("");
    }
  };

  return (
    <div className="flex-1 overflow-auto bg-background">
      {rows.length === 0 ? (
        <EmptyState 
          message="No localization keys found"
          description="Add a new key using the + button next to a category in the tree, or adjust your search query."
        />
      ) : (
        <table className="w-full border-collapse">
        <thead className="sticky top-0 z-10 bg-panel border-b">
          <tr>
            <th className="text-left px-4 py-3 text-sm font-semibold w-48">Key</th>
            <th className="text-left px-4 py-3 text-sm font-semibold w-64">Context</th>
            {languages.map(lang => (
              <th key={lang} className="text-left px-4 py-3 text-sm font-semibold min-w-48">
                {lang.toUpperCase()}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(row => {
            const isSelected = row.key === selectedKey;
            const keyName = row.key.split(':')[1] || row.key;

            return (
              <tr
                key={row.key}
                onClick={() => onSelectKey(row.key)}
                className={cn(
                  "border-b hover:bg-panel-hover cursor-pointer transition-colors",
                  isSelected && "bg-primary/5"
                )}
              >
                <td className="px-4 py-3 text-sm font-mono">
                  <div className={cn(
                    isSelected ? "whitespace-normal" : "whitespace-nowrap overflow-hidden text-ellipsis"
                  )}>
                    {keyName}
                  </div>
                </td>
                <td 
                  className="px-4 py-3 text-sm text-muted-foreground"
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    startEditing(row.key, 'context', row.context);
                  }}
                >
                  {editingCell?.key === row.key && editingCell.field === 'context' ? (
                    <Textarea
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onBlur={saveEdit}
                      onKeyDown={handleKeyDown}
                      autoFocus
                      className="min-h-[60px]"
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <div className={cn(
                      isSelected ? "whitespace-normal" : "whitespace-nowrap overflow-hidden text-ellipsis"
                    )}>
                      {row.context || <span className="text-muted-foreground/50">No context</span>}
                    </div>
                  )}
                </td>
                {languages.map(lang => {
                  const text = row.translations[lang] || '';
                  return (
                    <td 
                      key={lang}
                      className="px-4 py-3 text-sm"
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        startEditing(row.key, lang, text);
                      }}
                    >
                      {editingCell?.key === row.key && editingCell.field === lang ? (
                        <Textarea
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={saveEdit}
                          onKeyDown={handleKeyDown}
                          autoFocus
                          className="min-h-[60px]"
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <div className={cn(
                          isSelected ? "whitespace-normal" : "whitespace-nowrap overflow-hidden text-ellipsis",
                          !text && "text-muted-foreground/30"
                        )}>
                          {text || 'Empty'}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      )}
    </div>
  );
};
