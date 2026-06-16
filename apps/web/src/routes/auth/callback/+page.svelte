<script lang="ts">
  import { page } from '$app/state';
  import { apiExchangeOAuthCode } from '$lib/services/api';
  import { onMount } from 'svelte';

  let didExchange = false;

  onMount(() => {
    if (didExchange) return;
    didExchange = true;

    const code = page.url.searchParams.get('code');
    const error = page.url.searchParams.get('error');

    if (error || !code) {
      window.location.replace('/login?error=oauth_failed');
      return;
    }

    apiExchangeOAuthCode(code)
      .then((token) => {
        localStorage.setItem('token', token);
        window.location.replace('/dashboard');
      })
      .catch(() => {
        window.location.replace('/login?error=oauth_failed');
      });
  });
</script>

<div class="loading">Signing you in...</div>
