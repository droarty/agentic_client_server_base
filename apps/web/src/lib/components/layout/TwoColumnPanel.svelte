<script lang="ts">
  import type { Snippet } from 'svelte';
  import { cn } from '$lib/utils';

  let {
    left,
    right,
    leftClassName,
    rightClassName,
  }: {
    left?: Snippet;
    right?: Snippet;
    leftClassName?: string;
    rightClassName?: string;
  } = $props();
</script>

<div class="flex h-full w-full overflow-hidden">
  <div class={cn('overflow-y-auto border-r border-border', leftClassName ?? 'w-1/3')}>
    {@render left?.()}
  </div>
  <div class={cn('flex-1 overflow-y-auto', rightClassName)}>
    {@render right?.()}
  </div>
</div>
