<script lang="ts">
  import PageHeader from '$lib/components/PageHeader.svelte';
  import LayoutDocumentView from '$lib/components/LayoutDocumentView.svelte';
  import { dashboardChannelId } from '$lib/stores/dashboardChannelId';
</script>

<div class="page">
  <PageHeader title="User Dashboard" />
  <main>
    {#if $dashboardChannelId}
      <LayoutDocumentView channelId={$dashboardChannelId} />
    {:else}
      <p class="doc-empty">Loading…</p>
    {/if}
  </main>
</div>
