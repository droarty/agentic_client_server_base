<script lang="ts">
  import { authStore } from '$lib/stores/auth';
  import PageHeader from '$lib/components/PageHeader.svelte';

  const DASHBOARD_CARDS = [
    { path: '/dashboard/user',   label: 'User Dashboard',   description: 'Your profile and account overview.' },
    { path: '/dashboard/author', label: 'Author Dashboard', description: 'Manage and publish your content.' },
    { path: '/dashboard/admin',  label: 'Admin Dashboard',  description: 'Manage users.' },
  ];
</script>

<div class="page">
  <PageHeader title="Dashboard" />
  <main>
    <p class="dashboard-welcome">Welcome back, <strong>{$authStore.user?.email}</strong></p>
    <div class="role-cards">
      {#each DASHBOARD_CARDS as card (card.path)}
        <a href={card.path} class="role-card">
          <h2>{card.label}</h2>
          <p>{card.description}</p>
        </a>
      {/each}
    </div>
  </main>
</div>
