<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { Artifact, InboundMessage } from '@multiplayer-base/shared-types';
  import { eventManager } from '$lib/services/EventManager';
  import { subscribeToModel, getModelSnapshot, mountChannel } from '$lib/services/documentModelStore';
  import type { DocModel } from '$lib/services/documentModelStore';
  import LayoutRenderer from './LayoutRenderer.svelte';

  let {
    doc,
    channelId: channelIdProp,
    viewHandler = 'defaultView',
  }: {
    doc?: Artifact;
    channelId?: string;
    viewHandler?: string;
  } = $props();

  let resolvedChannelId = $derived(channelIdProp ?? doc?.currentChannelId ?? '');

  function emit(type: string, payload: Record<string, unknown> = {}) {
    eventManager.publish(resolvedChannelId, {
      type,
      from: 'client' as const,
      to: 'server' as const,
      channel: resolvedChannelId,
      timestamp: new Date().toISOString(),
      ...payload,
    } as unknown as InboundMessage);
  }

  let model = $state<DocModel>({ layoutConfig: [], docState: { state: {}, temp: {} } });

  let unsub: (() => void) | null = null;

  function setup(channelId: string, vh: string) {
    unsub?.();
    model = getModelSnapshot(channelId, vh);
    unsub = subscribeToModel(channelId, vh, () => {
      model = getModelSnapshot(channelId, vh);
    });
    mountChannel(channelId, emit, vh);
  }

  $effect(() => {
    setup(resolvedChannelId, viewHandler);
  });

  onDestroy(() => unsub?.());
</script>

{#if model.layoutConfig.length === 0}
  <p class="doc-empty">Loading…</p>
{:else}
  <LayoutRenderer
    nodes={model.layoutConfig}
    state={model.docState as unknown as Record<string, unknown>}
    {emit}
  />
{/if}
