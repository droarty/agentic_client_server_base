import { useState, useMemo } from 'react';
import { TreeView, type TreeDataItem } from '../ui/tree-view';
import { TwoColumnPanel } from './TwoColumnPanel';

interface LogTreeNode {
  id: string;
  name: string;
  rawData: Record<string, unknown>;
  children?: LogTreeNode[];
}

interface Props {
  treeData?: unknown;
  [key: string]: unknown;
}

const OMIT_KEYS = new Set(['id', 'name', 'children', 'rawData', '_id', '__v']);

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

function formatValue(val: unknown): string {
  if (val == null) return '';
  if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(val)) {
    return new Date(val).toLocaleString();
  }
  if (typeof val === 'object') return JSON.stringify(val, null, 2);
  return String(val);
}

function NodeDetails({ node }: { node: LogTreeNode }) {
  const entries = Object.entries(node.rawData).filter(([k]) => !OMIT_KEYS.has(k));
  return (
    <div className="log-tree-details">
      {entries.map(([key, val]) => (
        <div key={key} className="log-tree-entry">
          <span className="log-tree-key">{key}: </span>
          <span className="log-tree-value">{formatValue(val)}</span>
        </div>
      ))}
    </div>
  );
}

export function LogTreePanel({ treeData }: Props) {
  const [selectedNode, setSelectedNode] = useState<LogTreeNode | null>(null);

  const nodes = Array.isArray(treeData) ? (treeData as LogTreeNode[]) : [];

  const items = useMemo(() => toTreeDataItems(nodes), [nodes]);

  const handleSelect = (item: TreeDataItem | undefined) => {
    if (!item) return;
    setSelectedNode(findNode(nodes, item.id));
  };

  return (
    <TwoColumnPanel
      left={
        items.length === 0 ? (
          <p className="log-tree-empty">No tree data.</p>
        ) : (
          <TreeView data={items} onSelectChange={handleSelect} />
        )
      }
      right={
        selectedNode ? (
          <NodeDetails node={selectedNode} />
        ) : (
          <p className="log-tree-empty">Select a node to view details.</p>
        )
      }
    />
  );
}
