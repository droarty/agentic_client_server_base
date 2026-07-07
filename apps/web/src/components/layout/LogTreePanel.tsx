import { useMemo } from 'react';
import { TreeView, type TreeDataItem } from '../ui/tree-view';
import { TwoColumnPanel } from './TwoColumnPanel';
import { JsonView } from './JsonView';

interface LogTreeNode {
  id: string;
  name: string;
  rawData: Record<string, unknown>;
  children?: LogTreeNode[];
}

interface Props {
  treeData?: unknown;
  selectedLog?: unknown;
  artifactState?: unknown;
  onSelect?: (payload: { selectedLog: LogTreeNode }) => void;
  [key: string]: unknown;
}

function toTreeDataItems(nodes: LogTreeNode[]): TreeDataItem[] {
  return nodes.map((node) => ({
    id: node.id,
    name: node.name,
    children: node.children && node.children.length > 0 ? toTreeDataItems(node.children) : undefined,
  }));
}

function findNode(nodes: LogTreeNode[], id: string): LogTreeNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    if (node.children) {
      const found = findNode(node.children, id);
      if (found) return found;
    }
  }
  return null;
}

export function LogTreePanel({ treeData, selectedLog, artifactState, onSelect }: Props) {
  const nodes = Array.isArray(treeData) ? (treeData as LogTreeNode[]) : [];
  const selectedNode = (selectedLog as LogTreeNode | null | undefined) ?? null;

  const items = useMemo(() => toTreeDataItems(nodes), [nodes]);

  const handleSelect = (item: TreeDataItem | undefined) => {
    if (!item) return;
    const node = findNode(nodes, item.id);
    if (node) onSelect?.({ selectedLog: node });
  };

  return (
    <TwoColumnPanel
      left={
        items.length === 0 ? (
          <p className="log-tree-empty">No tree data.</p>
        ) : (
          <TreeView data={items} initialSelectedItemId={selectedNode?.id} onSelectChange={handleSelect} />
        )
      }
      right={
        <div className="log-review-right">
          <h4>Artifact State</h4>
          <JsonView config={(artifactState as Record<string, unknown>) ?? null} emptyMessage="No state." />
          <h4>Selected Log</h4>
          {selectedNode ? (
            <JsonView config={selectedNode.rawData} />
          ) : (
            <p className="log-tree-empty">Select a node to view details.</p>
          )}
        </div>
      }
    />
  );
}
