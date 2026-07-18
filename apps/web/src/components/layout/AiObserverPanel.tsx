import { useMemo, useRef, useState, useEffect } from 'react';
import { TreeView, type TreeDataItem } from '../ui/tree-view';
import { TwoColumnPanel } from './TwoColumnPanel';
import { JsonEditor } from './JsonEditor';
import { Button } from '@/components/ui/button';

interface TestEntry {
  createdAt: string;
  [key: string]: unknown;
}

interface NodeInfo {
  handlerName: string;
  test?: TestEntry;
}

interface Props {
  tests?: Record<string, TestEntry[]>;
  onAddTest?: (payload: { handlerName: string }) => void;
  [key: string]: unknown;
}

function buildTree(tests: Record<string, TestEntry[]>): { items: TreeDataItem[]; nodeInfo: Map<string, NodeInfo> } {
  const nodeInfo = new Map<string, NodeInfo>();
  const items: TreeDataItem[] = Object.entries(tests).map(([handlerName, handlerTests]) => {
    nodeInfo.set(handlerName, { handlerName });
    const children: TreeDataItem[] = (handlerTests ?? []).map((test, i) => {
      const id = test.createdAt;
      nodeInfo.set(id, { handlerName, test });
      return { id, name: `Test ${i + 1}` };
    });
    return { id: handlerName, name: handlerName, children: children.length > 0 ? children : undefined };
  });
  return { items, nodeInfo };
}

export function AiObserverPanel({ tests, onAddTest }: Props) {
  const testsObj = (tests ?? {}) as Record<string, TestEntry[]>;
  const { items, nodeInfo } = useMemo(() => buildTree(testsObj), [testsObj]);

  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const pendingAddRef = useRef<string | null>(null);
  const prevCountsRef = useRef<Record<string, number>>({});

  useEffect(() => {
    const pendingHandler = pendingAddRef.current;
    if (pendingHandler) {
      const currentCount = (testsObj[pendingHandler] ?? []).length;
      const prevCount = prevCountsRef.current[pendingHandler] ?? 0;
      if (currentCount > prevCount) {
        const newest = testsObj[pendingHandler][currentCount - 1];
        setSelectedId(newest.createdAt);
        pendingAddRef.current = null;
      }
    }
    for (const [handlerName, handlerTests] of Object.entries(testsObj)) {
      prevCountsRef.current[handlerName] = (handlerTests ?? []).length;
    }
  }, [testsObj]);

  const handleSelectChange = (item: TreeDataItem | undefined) => {
    setSelectedId(item?.id);
  };

  const selected = selectedId ? nodeInfo.get(selectedId) : undefined;

  const handleAddTest = () => {
    if (!selected) return;
    pendingAddRef.current = selected.handlerName;
    onAddTest?.({ handlerName: selected.handlerName });
  };

  return (
    <TwoColumnPanel
      left={
        items.length === 0 ? (
          <p className="ai-observer-panel-empty">No AI-routed handlers yet.</p>
        ) : (
          <TreeView data={items} initialSelectedItemId={selectedId} onSelectChange={handleSelectChange} />
        )
      }
      right={
        selected ? (
          <div className="ai-observer-panel-right">
            <div className="ai-observer-panel-header">
              <span className="ai-observer-panel-title">{selected.handlerName}</span>
              <Button type="button" variant="default" onClick={handleAddTest}>Add Test</Button>
            </div>
            {selected.test ? (
              <JsonEditor value={selected.test} />
            ) : (
              <p className="ai-observer-panel-empty">Select a test to edit its input, or click Add Test to create one.</p>
            )}
          </div>
        ) : (
          <p className="ai-observer-panel-empty">Select a handler or test to view details.</p>
        )
      }
    />
  );
}
