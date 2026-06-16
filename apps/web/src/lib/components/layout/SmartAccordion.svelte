<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    items?: Record<string, unknown>[];
    idField?: string;
    triggerFields?: string[];
    selectedId?: string | null;
    onSelect?: (payload: { id: string | null }) => void;
    children?: Snippet;
  }

  let {
    items = [],
    idField = 'id',
    triggerFields = [],
    selectedId,
    onSelect,
    children,
  }: Props = $props();

  let openValue = $state<string>('');
  $effect(() => { if (typeof selectedId === 'string' && openValue === '') openValue = selectedId; });

  function getField(item: Record<string, unknown>, field: string): string {
    const val = item[field];
    if (val == null) return '';
    if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(val)) {
      return new Date(val).toLocaleString();
    }
    return String(val);
  }

  function toggle(id: string) {
    const next = openValue === id ? '' : id;
    openValue = next;
    onSelect?.({ id: next || null });
  }

  let isSelected = $derived((id: string) =>
    selectedId !== undefined ? selectedId === id && openValue === id : openValue === id
  );
</script>

{#if items.length === 0}
  <p class="text-muted-foreground text-xs">No entries found.</p>
{:else}
  <div class="accordion w-full">
    {#each items as item (String(item[idField] ?? ''))}
      {@const id = String(item[idField] ?? '')}
      {@const triggerText = (triggerFields as string[]).map((f) => getField(item, f)).filter(Boolean).join(' · ')}
      {@const open = openValue === id}
      <div class="accordion-item">
        <button
          class="accordion-trigger"
          onclick={() => toggle(id)}
          aria-expanded={open}
        >
          {triggerText || id}
          <span class="accordion-chevron" class:open>{open ? '▲' : '▼'}</span>
        </button>
        {#if open}
          <div class="accordion-content">
            {#if isSelected(id)}
              {@render children?.()}
            {:else}
              <p class="text-muted-foreground text-xs">Loading…</p>
            {/if}
          </div>
        {/if}
      </div>
    {/each}
  </div>
{/if}

<style>
  .accordion-item {
    border-bottom: 1px solid var(--border);
  }
  .accordion-trigger {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
    padding: 0.75rem;
    background: none;
    border: none;
    text-align: left;
    font-size: 0.875rem;
    cursor: pointer;
  }
  .accordion-content {
    padding: 0.5rem 0.75rem 0.75rem;
  }
  .accordion-chevron {
    font-size: 0.6rem;
    color: var(--muted-foreground);
  }
</style>
