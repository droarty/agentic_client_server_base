<script lang="ts">
  import TreeView, { type TreeDataItem } from '$lib/components/ui/TreeView.svelte';

  interface LogTreeNode {
    id: string;
    name: string;
    rawData: Record<string, unknown>;
    children?: LogTreeNode[];
  }

  let { treeData }: { treeData?: unknown } = $props();

  const OMIT_KEYS = new Set(['id', 'name', 'children', 'rawData', '_id', '__v']);

  let nodes = $derived(Array.isArray(treeData) ? (treeData as LogTreeNode[]) : []);

  function toTreeDataItems(ns: LogTreeNode[]): TreeDataItem[] {
    return ns.map((n) => ({
      id: n.id,
      name: n.name,
      children: n.children?.length ? toTreeDataItems(n.children) : undefined,
    }));
  }

  function findNode(ns: LogTreeNode[], id: string): LogTreeNode | null {
    for (const n of ns) {
      if (n.id === id) return n;
      if (n.children) {
        const found = findNode(n.children, id);
        if (found) return found;
      }
    }
    return null;
  }

  function formatValue(val: unknown): string {
    if (val == null) return '';
    if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(val)) return new Date(val).toLocaleString();
    if (typeof val === 'object') return JSON.stringify(val, null, 2);
    return String(val);
  }

  let items = $derived(toTreeDataItems(nodes));
  let selectedNode = $state<LogTreeNode | null>(null);

  function handleSelect(item: TreeDataItem | undefined) {
    if (!item) return;
    selectedNode = findNode(nodes, item.id);
  }
</script>

<div class="flex h-full w-full overflow-hidden">
  <div class="overflow-y-auto border-r border-border w-1/3">
    {#if items.length === 0}
      <p class="text-xs text-muted-foreground p-3">No tree data.</p>
    {:else}
      <TreeView data={items} onSelectChange={handleSelect} />
    {/if}
  </div>
  <div class="flex-1 overflow-y-auto">
    {#if selectedNode}
      <div class="p-3 space-y-1">
        {#each Object.entries(selectedNode.rawData).filter(([k]) => !OMIT_KEYS.has(k)) as [key, val] (key)}
          <div class="text-xs">
            <span class="font-medium text-foreground">{key}: </span>
            <span class="text-muted-foreground font-mono whitespace-pre-wrap break-all">{formatValue(val)}</span>
          </div>
        {/each}
      </div>
    {:else}
      <p class="text-xs text-muted-foreground p-3">Select a node to view details.</p>
    {/if}
  </div>
</div>
