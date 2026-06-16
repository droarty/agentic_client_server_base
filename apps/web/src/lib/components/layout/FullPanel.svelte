<script lang="ts">
  import type { Snippet } from 'svelte';

  let { targetId, children }: { targetId?: string; children?: Snippet } = $props();
</script>

<div id={targetId} class="full-panel">
  {@render children?.()}
</div>
