<script lang="ts">
  import type { ArtifactSummary } from '@multiplayer-base/shared-types';

  let {
    items = [],
    onSelect,
  }: {
    items?: ArtifactSummary[];
    onSelect?: (payload: { documentId: string }) => void;
  } = $props();
</script>

{#if items.length === 0}
  <p class="doc-empty">No documents yet.</p>
{:else}
  <ul class="doc-list">
    {#each items as doc (doc._id)}
      <li
        class="doc-list-item"
        onclick={() => onSelect?.({ documentId: doc._id })}
        tabindex="0"
        onkeydown={(e) => e.key === 'Enter' && onSelect?.({ documentId: doc._id })}
      >
        <span class="doc-name">{doc.name}</span>
        <span class="doc-type">{doc.type}</span>
      </li>
    {/each}
  </ul>
{/if}
