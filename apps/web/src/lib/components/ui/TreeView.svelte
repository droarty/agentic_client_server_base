<script lang="ts">
  export interface TreeDataItem {
    id: string;
    name: string;
    children?: TreeDataItem[];
  }

  let {
    data,
    onSelectChange,
  }: {
    data: TreeDataItem[];
    onSelectChange?: (item: TreeDataItem | undefined) => void;
  } = $props();

  let selectedId = $state<string | undefined>(undefined);

  function select(item: TreeDataItem) {
    selectedId = item.id;
    onSelectChange?.(item);
  }
</script>

<div class="tree-view overflow-hidden relative p-2" role="tree">
  {#each data as item (item.id)}
    <TreeItem {item} {selectedId} {select} />
  {/each}
</div>

{#snippet TreeItem(item: TreeDataItem, selectedId: string | undefined, select: (item: TreeDataItem) => void)}
  {#if item.children && item.children.length > 0}
    <TreeNode {item} {selectedId} {select} />
  {:else}
    <TreeLeaf {item} {selectedId} {select} />
  {/if}
{/snippet}

{#snippet TreeNode(item: TreeDataItem, selectedId: string | undefined, select: (item: TreeDataItem) => void)}
  {@const isSelected = selectedId === item.id}
  <details class="tree-node">
    <summary
      class="tree-row"
      class:selected={isSelected}
      onclick={() => select(item)}
      role="treeitem"
      aria-selected={isSelected}
    >
      <span class="chevron">›</span>
      {item.name}
    </summary>
    <div class="ml-4 pl-1 border-l border-border pb-1">
      {#each item.children ?? [] as child (child.id)}
        <TreeItem item={child} {selectedId} {select} />
      {/each}
    </div>
  </details>
{/snippet}

{#snippet TreeLeaf(item: TreeDataItem, selectedId: string | undefined, select: (item: TreeDataItem) => void)}
  {@const isSelected = selectedId === item.id}
  <div
    class="tree-row ml-5"
    class:selected={isSelected}
    onclick={() => select(item)}
    role="treeitem"
    aria-selected={isSelected}
    tabindex="0"
    onkeydown={(e) => e.key === 'Enter' && select(item)}
  >
    {item.name}
  </div>
{/snippet}

<style>
  .tree-row {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.35rem 0.5rem;
    cursor: pointer;
    border-radius: 4px;
    font-size: 0.8rem;
    list-style: none;
  }
  .tree-row:hover {
    background: hsl(var(--accent) / 0.7);
  }
  .tree-row.selected {
    background: hsl(var(--accent) / 0.7);
    color: var(--accent-foreground);
  }
  details > summary { list-style: none; }
  details > summary::-webkit-details-marker { display: none; }
  details[open] .chevron { transform: rotate(90deg); }
  .chevron {
    display: inline-block;
    transition: transform 0.15s;
    color: hsl(var(--accent-foreground) / 0.5);
    font-size: 0.75rem;
    width: 1rem;
  }
</style>
