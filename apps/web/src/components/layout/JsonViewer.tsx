import { useState } from 'react';
import { Button } from '@/components/ui/button';

interface Props {
  data?: unknown;
  schemaPreview?: unknown;
  title?: string;
  emptyMessage?: string;
  [key: string]: unknown;
}

function JsonTree({ value, depth = 0 }: { value: unknown; depth?: number }) {
  const [collapsed, setCollapsed] = useState(depth > 1);

  if (value === null || value === undefined) {
    return <span className="text-muted-foreground italic text-xs">null</span>;
  }

  if (typeof value === 'boolean') {
    return <span className="text-blue-500 text-xs">{String(value)}</span>;
  }

  if (typeof value === 'number') {
    return <span className="text-orange-500 text-xs">{value}</span>;
  }

  if (typeof value === 'string') {
    return <span className="text-green-600 text-xs">"{value}"</span>;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-xs text-muted-foreground">[]</span>;
    return (
      <span>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          [{collapsed ? `…${value.length}` : ''}]
        </button>
        {!collapsed && (
          <div className="ml-4">
            {value.map((item, i) => (
              <div key={i} className="py-0.5">
                <span className="text-muted-foreground text-xs">{i}: </span>
                <JsonTree value={item} depth={depth + 1} />
              </div>
            ))}
          </div>
        )}
      </span>
    );
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return <span className="text-xs text-muted-foreground">{'{}'}</span>;
    return (
      <span>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          {'{'}
          {collapsed ? `…${entries.length}` : ''}
          {collapsed ? '}' : ''}
        </button>
        {!collapsed && (
          <div className="ml-4">
            {entries.map(([k, v]) => (
              <div key={k} className="py-0.5">
                <span className="text-purple-600 text-xs font-medium">{k}</span>
                <span className="text-muted-foreground text-xs">: </span>
                <JsonTree value={v} depth={depth + 1} />
              </div>
            ))}
            {'}'}
          </div>
        )}
      </span>
    );
  }

  return <span className="text-xs">{String(value)}</span>;
}

function DataTable({ records }: { records: Record<string, unknown>[] }) {
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  if (records.length === 0) return <p className="text-xs text-muted-foreground p-4">No records.</p>;

  const cols = Array.from(new Set(records.flatMap(Object.keys))).slice(0, 10);
  const pageRecords = records.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(records.length / PAGE_SIZE);

  return (
    <div className="flex flex-col h-full">
      <div className="overflow-auto flex-1">
        <table className="w-full text-xs border-collapse">
          <thead className="sticky top-0 bg-muted">
            <tr>
              {cols.map((col) => (
                <th key={col} className="text-left px-2 py-1 border-b border-border font-medium whitespace-nowrap">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRecords.map((row, i) => (
              <tr key={i} className="border-b border-border/50 hover:bg-muted/30">
                {cols.map((col) => (
                  <td key={col} className="px-2 py-1 max-w-[200px] truncate">
                    {row[col] == null ? (
                      <span className="text-muted-foreground italic">—</span>
                    ) : (
                      String(row[col])
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-3 py-2 border-t border-border text-xs text-muted-foreground">
          <span>
            {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, records.length)} of {records.length}
          </span>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-6 px-2 text-xs"
              disabled={page === 0}
              onClick={() => setPage(page - 1)}
            >
              ‹
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-6 px-2 text-xs"
              disabled={page >= totalPages - 1}
              onClick={() => setPage(page + 1)}
            >
              ›
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function JsonViewer({ data, schemaPreview, title = 'Preview', emptyMessage = 'Nothing to show yet.' }: Props) {
  const [showRaw, setShowRaw] = useState(false);

  const displayData = data ?? schemaPreview;

  if (displayData == null) {
    return (
      <div className="flex items-center justify-center h-full p-8 text-sm text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }

  const isArray = Array.isArray(displayData);
  const records = isArray ? (displayData as Record<string, unknown>[]) : null;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h2 className="font-semibold text-sm">{title}</h2>
        <div className="flex items-center gap-2">
          {records && (
            <span className="text-xs text-muted-foreground">{records.length} records</span>
          )}
          {isArray && (
            <Button
              variant="outline"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => setShowRaw(!showRaw)}
            >
              {showRaw ? 'Table' : 'JSON'}
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {records && !showRaw ? (
          <DataTable records={records} />
        ) : (
          <div className="p-4 font-mono">
            <JsonTree value={displayData} depth={0} />
          </div>
        )}
      </div>
    </div>
  );
}
