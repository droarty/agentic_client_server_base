<script lang="ts">
  import '../app.css';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { authStore, initAuth } from '$lib/stores/auth';
  import { onMount } from 'svelte';

  let { children } = $props();

  const publicRoutes = ['/login', '/register', '/auth/callback'];

  onMount(() => {
    initAuth();
  });
</script>

{@render children()}
