<script lang="ts">
  import { goto } from '$app/navigation';
  import { authStore } from '$lib/stores/auth';

  let { children } = $props();

  $effect(() => {
    if (!$authStore.isLoading && !$authStore.user) {
      goto('/login');
    }
  });
</script>

{#if $authStore.isLoading}
  <div class="loading">Loading...</div>
{:else if $authStore.user}
  {@render children()}
{/if}
