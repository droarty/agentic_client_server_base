<script lang="ts">
  import { setContext } from 'svelte';
  import type { Snippet } from 'svelte';

  let { children }: { children?: Snippet } = $props();

  interface TabEntry { id: string; title: string }

  let tabs = $state<TabEntry[]>([]);
  let activeTab = $state('');

  $effect(() => {
    if (tabs.length > 0 && !activeTab) activeTab = tabs[0].id;
  });

  setContext('smartTabs', {
    registerTab(id: string, title: string) {
      const existing = tabs.find((t) => t.id === id);
      if (existing && existing.title === title) return;
      tabs = [...tabs.filter((t) => t.id !== id), { id, title }];
    },
    unregisterTab(id: string) {
      tabs = tabs.filter((t) => t.id !== id);
    },
    get activeTab() { return activeTab; },
  });
</script>

<div class="smart-tabs">
  <div class="smart-tabs__list" role="tablist">
    {#each tabs as tab (tab.id)}
      <button
        class="smart-tabs__trigger"
        class:active={activeTab === tab.id}
        role="tab"
        aria-selected={activeTab === tab.id}
        onclick={() => (activeTab = tab.id)}
      >
        {tab.title}
      </button>
    {/each}
  </div>
  {@render children?.()}
</div>

<style>
  .smart-tabs__list {
    display: flex;
    border-bottom: 1px solid var(--border);
    margin-bottom: 0.5rem;
  }
  .smart-tabs__trigger {
    padding: 0.5rem 1rem;
    border: none;
    background: none;
    cursor: pointer;
    font-size: 0.9rem;
    color: var(--muted-foreground);
    border-bottom: 2px solid transparent;
    margin-bottom: -1px;
  }
  .smart-tabs__trigger.active {
    color: var(--foreground);
    border-bottom-color: var(--primary);
    font-weight: 500;
  }
</style>
