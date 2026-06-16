<script lang="ts">
  import { authStore } from '$lib/stores/auth';
  import { apiUpdateMe } from '$lib/services/api';
  import { goto } from '$app/navigation';

  let email = $state($authStore.user?.email ?? '');
  let currentPassword = $state('');
  let newPassword = $state('');
  let confirmNewPassword = $state('');
  let error = $state('');
  let success = $state('');
  let isSubmitting = $state(false);

  async function handleSubmit(e: Event) {
    e.preventDefault();
    error = '';
    success = '';

    if (newPassword && newPassword !== confirmNewPassword) {
      error = 'New passwords do not match';
      return;
    }

    isSubmitting = true;
    try {
      const updates: { email?: string; currentPassword?: string; newPassword?: string } = {};
      if (email !== $authStore.user?.email) updates.email = email;
      if (newPassword) {
        updates.currentPassword = currentPassword;
        updates.newPassword = newPassword;
      }
      const updated = await apiUpdateMe(updates);
      authStore.setUser(updated);
      success = 'Settings updated successfully';
      currentPassword = '';
      newPassword = '';
      confirmNewPassword = '';
    } catch (err: unknown) {
      error =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Failed to update settings';
    } finally {
      isSubmitting = false;
    }
  }

  function handleLogout() {
    authStore.logout();
    goto('/login');
  }
</script>

<div class="page">
  <header class="page-header">
    <h1>Settings</h1>
    <nav>
      <a href="/dashboard" class="btn-secondary">Dashboard</a>
      <button onclick={handleLogout} class="btn-secondary">Logout</button>
    </nav>
  </header>

  <main>
    <div class="settings-card">
      <h2>Account Settings</h2>
      {#if error}
        <div class="error-message" role="alert">{error}</div>
      {/if}
      {#if success}
        <div class="success-message" role="status">{success}</div>
      {/if}
      <form onsubmit={handleSubmit} novalidate>
        <div class="form-group">
          <label for="email">Email</label>
          <input id="email" type="email" bind:value={email} required autocomplete="email" />
        </div>

        <hr />
        <h3>Change Password</h3>
        <p class="hint">Leave blank to keep your current password.</p>

        <div class="form-group">
          <label for="currentPassword">Current Password</label>
          <input id="currentPassword" type="password" bind:value={currentPassword} autocomplete="current-password" placeholder="Required to change password" />
        </div>
        <div class="form-group">
          <label for="newPassword">New Password</label>
          <input id="newPassword" type="password" bind:value={newPassword} autocomplete="new-password" placeholder="At least 6 characters" />
        </div>
        <div class="form-group">
          <label for="confirmNewPassword">Confirm New Password</label>
          <input id="confirmNewPassword" type="password" bind:value={confirmNewPassword} autocomplete="new-password" placeholder="Repeat new password" />
        </div>

        <button type="submit" class="btn-primary" disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : 'Save Changes'}
        </button>
      </form>
    </div>
  </main>
</div>
