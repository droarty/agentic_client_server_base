<script lang="ts">
  import { authStore } from '$lib/stores/auth';
  import { goto } from '$app/navigation';

  let { title }: { title: string } = $props();

  function handleLogout() {
    authStore.logout();
    goto('/login');
  }
</script>

<header class="page-header">
  <h1>{title}</h1>
  <nav>
    <span>{$authStore.user?.email}</span>
    <a href="/dashboard" class="btn-secondary">Dashboard</a>
    <a href="/settings" class="btn-secondary">Settings</a>
    <button onclick={handleLogout} class="btn-secondary">Logout</button>
  </nav>
</header>
