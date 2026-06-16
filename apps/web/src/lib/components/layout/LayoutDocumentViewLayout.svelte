<script lang="ts">
  import LayoutDocumentView from '$lib/components/LayoutDocumentView.svelte';

  let { channelId, viewHandler }: { channelId?: string; viewHandler?: string } = $props();
</script>

<LayoutDocumentView {channelId} {viewHandler} />
