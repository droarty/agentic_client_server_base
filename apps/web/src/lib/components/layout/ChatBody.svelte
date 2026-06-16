<script lang="ts">
  interface ChatMessage {
    messageType: string;
    text: string;
    authorEmail?: string;
    color?: string;
  }

  let { messages = [] }: { messages?: ChatMessage[] } = $props();

  let bottomEl: HTMLDivElement;

  $effect(() => {
    // Track messages length so this runs whenever new messages arrive
    messages.length;
    bottomEl?.scrollIntoView({ behavior: 'smooth' });
  });
</script>

<div class="chat-messages">
  {#if messages.length === 0}
    <p class="chat-empty">No messages yet. Say hello!</p>
  {/if}
  {#each messages as msg, i (i)}
    <div
      class="chat-message chat-message--{msg.messageType}"
      style={msg.color ? `color: ${msg.color}` : undefined}
    >
      <span class="chat-message__author">{msg.authorEmail}</span>
      <span class="chat-message__text">{msg.text}</span>
    </div>
  {/each}
  <div bind:this={bottomEl}></div>
</div>
