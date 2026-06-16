<script lang="ts">
  import type { LayoutNode } from '@multiplayer-base/shared-types';
  import LayoutNodeComponent from './LayoutNode.svelte';

  let {
    nodes,
    state,
    emit,
  }: {
    nodes: LayoutNode[];
    state: Record<string, unknown>;
    emit: (type: string, payload?: Record<string, unknown>) => void;
  } = $props();
</script>

{#each nodes as node, i (i)}
  <LayoutNodeComponent {node} {state} {emit} />
{/each}
