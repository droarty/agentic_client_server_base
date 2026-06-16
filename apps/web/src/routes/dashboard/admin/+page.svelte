<script lang="ts">
  import { onMount } from 'svelte';
  import { authStore } from '$lib/stores/auth';
  import { apiGetUsers } from '$lib/services/api';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import type { User } from '@multiplayer-base/shared-types';

  let users = $state<User[]>([]);
  let isLoading = $state(true);
  let error = $state('');

  onMount(() => {
    apiGetUsers()
      .then((u) => (users = u))
      .catch(() => (error = 'Failed to load users'))
      .finally(() => (isLoading = false));
  });
</script>

<div class="page">
  <PageHeader title="Admin Dashboard" />
  <main>
    <h2>User Management</h2>
    {#if isLoading}
      <p>Loading...</p>
    {:else if error}
      <div class="error-message" role="alert">{error}</div>
    {:else}
      <table class="users-table">
        <thead>
          <tr>
            <th>Email</th>
            <th>Joined</th>
          </tr>
        </thead>
        <tbody>
          {#each users as u (u._id)}
            <tr>
              <td>
                {u.email}
                {#if u._id === $authStore.user?._id}
                  <span class="badge">you</span>
                {/if}
              </td>
              <td>{new Date(u.createdAt).toLocaleDateString()}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </main>
</div>
