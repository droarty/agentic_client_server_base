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
    <div className="dev-page">
      <nav className="dev-page-nav">
        <div className="dev-page-nav-header">
          <p className="dev-page-nav-title">Component Library</p>
        </div>
        {Object.entries(grouped).map(([group, entries]) => (
          <div key={group}>
            <p className="dev-page-nav-group-label">{group}</p>
            {entries.map((entry) => (
              <button
                key={entry.id}
                onClick={() => setSelectedId(entry.id)}
                className={`dev-page-nav-btn${selectedId === entry.id ? ' dev-page-nav-btn--active' : ''}`}
              >
                {entry.label}
              </button>
            ))}
          </div>
        ))}
      </nav>

      <main className="dev-page-main">
        {selected ? (
          <>
            <p className="dev-page-breadcrumb">{selected.group}</p>
            <h2 className="dev-page-title">{selected.label}</h2>
            <div className="dev-page-preview">{selected.render()}</div>
          </>
        ) : (
          <p className="dev-page-empty">Select a component from the left panel.</p>
        )}
      </main>
    </div>
  );
}
