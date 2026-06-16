<script lang="ts">
  let { onAddText }: { onAddText?: (payload: { text: string }) => void } = $props();

  let text = $state('');

  function submit() {
    const trimmed = text.trim();
    if (!trimmed || !onAddText) return;
    onAddText({ text: trimmed });
    text = '';
  }

  function handleSubmit(e: Event) {
    e.preventDefault();
    submit();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }
</script>

<form class="chat-input" onsubmit={handleSubmit}>
  <textarea
    class="chat-input__field"
    placeholder="Type a message…"
    bind:value={text}
    onkeydown={handleKeydown}
    rows={1}
  ></textarea>
  <button type="submit" class="btn-primary" disabled={!text.trim()}>Send</button>
</form>
