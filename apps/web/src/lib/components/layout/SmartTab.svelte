<script lang="ts">
  import { getContext, onMount, onDestroy } from 'svelte';
  import type { Snippet } from 'svelte';

  let {
    id: externalId,
    title = '',
    children,
  }: { id?: string; title?: string; children?: Snippet } = $props();

  const ctx = getContext<{
    registerTab: (id: string, title: string) => void;
    unregisterTab: (id: string) => void;
    get activeTab(): string;
  }>('smartTabs');

  let id = $derived(externalId ?? crypto.randomUUID());

  onMount(() => ctx?.registerTab(id, title));
  onDestroy(() => ctx?.unregisterTab(id));
</script>

{#if ctx?.activeTab === id}
  <div class="smart-tab-content" role="tabpanel">
    {@render children?.()}
  </div>
{/if}
