import { useSyncExternalStore, useEffect, useCallback } from 'react';
import { Artifact, InboundMessage } from '@multiplayer-base/shared-types';
import { eventManager } from '../services/EventManager';
import { LayoutRenderer } from '../../components/LayoutRenderer';
import { subscribeToModel, getModelSnapshot, mountChannel } from '../services/documentModelStore';

interface Props {
  doc?: Artifact;
  channelId?: string;
  viewHandler?: string;
}

export function LayoutDocumentView({ doc, channelId: channelIdProp, viewHandler = 'initialize' }: Props) {
  const resolvedChannelId = channelIdProp ?? doc?.currentChannelId ?? '';

  const emit = useCallback((type: string, payload: Record<string, unknown> = {}) => {
    eventManager.publish(resolvedChannelId, {
      type,
      from: 'client' as const,
      to: 'server' as const,
      channel: resolvedChannelId,
      timestamp: new Date().toISOString(),
      ...payload,
    } as unknown as InboundMessage);
  }, [resolvedChannelId]);

  useEffect(() => {
    mountChannel(resolvedChannelId, emit, viewHandler);
  }, [resolvedChannelId, emit, viewHandler]);

  const model = useSyncExternalStore(
    useCallback((cb) => subscribeToModel(resolvedChannelId, viewHandler, cb), [resolvedChannelId, viewHandler]),
    useCallback(() => getModelSnapshot(resolvedChannelId, viewHandler), [resolvedChannelId, viewHandler])
  );

  if (model.layoutConfig.length === 0) {
    return <p className="doc-empty">Loading…</p>;
  }

  return (
    <LayoutRenderer
      nodes={model.layoutConfig}
      state={model.docState as unknown as Record<string, unknown>}
      emit={emit}
    />
  );
}
