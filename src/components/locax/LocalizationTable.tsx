import { useEffect, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/locax/EmptyState";
import type { LocalizationRow } from "@/types/locax";
import { cn } from "@/lib/utils";

type ColumnWidths = Record<string, number>;

const MIN_COLUMN_WIDTH = 140;
const DEFAULT_COLUMN_WIDTHS = {
  key: 200,
  context: 300,
  lang: 220,
};

const getLangColumnKey = (lang: string) => `lang-${lang}`;

const getDefaultWidth = (columnKey: string): number => {
  if (columnKey === "key") return DEFAULT_COLUMN_WIDTHS.key;
  if (columnKey === "context") return DEFAULT_COLUMN_WIDTHS.context;
  return DEFAULT_COLUMN_WIDTHS.lang;
};

const normalizeWidths = (current: ColumnWidths, languages: string[]): ColumnWidths => {
  const orderedKeys = ["key", "context", ...languages.map(getLangColumnKey)];
  const next: ColumnWidths = {};

  orderedKeys.forEach((key) => {
    next[key] = current[key] ?? getDefaultWidth(key);
  });

  return next;
};

const createInitialWidths = (languages: string[]): ColumnWidths => {
  return normalizeWidths({}, languages);
};

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
  const [columnWidths, setColumnWidths] = useState<ColumnWidths>(() => createInitialWidths(languages));

  useEffect(() => {
    setColumnWidths(prev => normalizeWidths(prev, languages));
  }, [languages]);

  const getColumnWidth = (columnKey: string) => columnWidths[columnKey] ?? getDefaultWidth(columnKey);

  const handleResizeStart = (columnKey: string, event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();

    const startX = event.clientX;
    const startWidth = getColumnWidth(columnKey);

    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX;
      const nextWidth = Math.max(MIN_COLUMN_WIDTH, startWidth + delta);
      setColumnWidths(prev => ({ ...prev, [columnKey]: nextWidth }));
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

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
        <table className="w-full border-collapse table-fixed">
          <colgroup>
            <col style={{ width: `${getColumnWidth('key')}px` }} />
            <col style={{ width: `${getColumnWidth('context')}px` }} />
            {languages.map(lang => (
              <col 
                key={lang} 
                style={{ width: `${getColumnWidth(getLangColumnKey(lang))}px` }} 
              />
            ))}
          </colgroup>
          <thead className="sticky top-0 z-10 bg-panel border-b">
          <tr>
            <th className="relative px-4 py-3 text-sm font-semibold text-left whitespace-nowrap group select-none">
              Key
              <span
                aria-hidden="true"
                onMouseDown={(e) => handleResizeStart('key', e)}
                className="absolute right-0 top-0 h-full w-2 cursor-col-resize select-none bg-transparent group-hover:bg-border"
              />
            </th>
            <th className="relative px-4 py-3 text-sm font-semibold text-left whitespace-nowrap group select-none">
              Context
              <span
                aria-hidden="true"
                onMouseDown={(e) => handleResizeStart('context', e)}
                className="absolute right-0 top-0 h-full w-2 cursor-col-resize select-none bg-transparent group-hover:bg-border"
              />
            </th>
            {languages.map(lang => {
              const columnKey = getLangColumnKey(lang);
              return (
                <th 
                  key={columnKey} 
                  className="relative px-4 py-3 text-sm font-semibold text-left whitespace-nowrap group select-none"
                >
                  {lang.toUpperCase()}
                  <span
                    aria-hidden="true"
                    onMouseDown={(e) => handleResizeStart(columnKey, e)}
                    className="absolute right-0 top-0 h-full w-2 cursor-col-resize select-none bg-transparent group-hover:bg-border"
                  />
                </th>
              );
            })}
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
