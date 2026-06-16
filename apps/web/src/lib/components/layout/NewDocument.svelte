<script lang="ts">
  let {
    availableTypes = [],
    onCreate,
  }: {
    availableTypes?: string[];
    onCreate?: (payload: { name: string; documentType: string }) => void;
  } = $props();

  let types = $derived(availableTypes as string[]);
  let name = $state('');
  let documentType = $state<string>('configged-chat');
  $effect(() => { if (types[0] && documentType === 'configged-chat') documentType = types[0]; });

  let label = $derived(documentType.charAt(0).toUpperCase() + documentType.slice(1));

  function handleSubmit(e: Event) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onCreate?.({ name: trimmed, documentType });
    name = '';
  }
</script>

<form class="doc-create-form" onsubmit={handleSubmit}>
  <input
    class="doc-create-input"
    type="text"
    placeholder="Document name…"
    bind:value={name}
  />
  {#if types.length > 1}
    <select class="doc-create-type" bind:value={documentType}>
      {#each types as t (t)}
        <option value={t}>{t}</option>
      {/each}
    </select>
  {/if}
  <button type="submit" class="btn-primary doc-create-btn" disabled={!name.trim()}>
    Create {label}
  </button>
</form>
