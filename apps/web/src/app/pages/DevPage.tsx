import { useState } from 'react';
import { allMocks, MockEntry } from '../dev/index';

export function DevPage() {
  const [selectedId, setSelectedId] = useState<string>(allMocks[0]?.id ?? '');

  const grouped = allMocks.reduce<Record<string, MockEntry[]>>((acc, m) => {
    (acc[m.group] ??= []).push(m);
    return acc;
  }, {});

  const selected = allMocks.find((m) => m.id === selectedId);

  return (
    <div className="flex h-screen bg-background">
      <nav className="w-56 shrink-0 border-r border-border flex flex-col overflow-y-auto bg-muted/30">
        <div className="px-4 py-3 border-b border-border">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Component Library</p>
        </div>
        {Object.entries(grouped).map(([group, entries]) => (
          <div key={group}>
            <p className="px-4 pt-4 pb-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {group}
            </p>
            {entries.map((entry) => (
              <button
                key={entry.id}
                onClick={() => setSelectedId(entry.id)}
                className={`w-full text-left px-4 py-1.5 text-sm transition-colors ${
                  selectedId === entry.id
                    ? 'bg-accent text-accent-foreground font-medium'
                    : 'text-foreground hover:bg-accent/50'
                }`}
              >
                {entry.label}
              </button>
            ))}
          </div>
        ))}
      </nav>

      <main className="flex-1 overflow-auto p-8">
        {selected ? (
          <>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
              {selected.group}
            </p>
            <h2 className="text-lg font-semibold text-foreground mb-4">{selected.label}</h2>
            <div className="inline-block border border-border rounded-lg overflow-hidden">
              {selected.render()}
            </div>
          </>
        ) : (
          <p className="text-muted-foreground text-sm">Select a component from the left panel.</p>
        )}
      </main>
    </div>
  );
}
