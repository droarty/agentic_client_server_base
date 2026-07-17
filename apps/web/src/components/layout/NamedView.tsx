import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { LayoutRenderer } from '../LayoutRenderer';
import { mountChannel, unmountChannel, subscribeToModel, getModelSnapshot } from '@/app/services/documentModelStore';

const EMPTY_MODEL = { layoutConfig: [], docState: { state: {}, temp: {} } };

interface Props {
  viewHandler: string;
  channelId?: string;
  emit?: (type: string, payload?: Record<string, unknown>) => void;
  [key: string]: unknown;
}

export function NamedView({ viewHandler, channelId, emit }: Props) {
  useEffect(() => {
    if (!channelId || !emit) return;
    mountChannel(channelId, emit, viewHandler);
    return () => unmountChannel(channelId, viewHandler);
  }, [channelId, emit, viewHandler]);

  const model = useSyncExternalStore(
    useCallback((cb) => (channelId ? subscribeToModel(channelId, viewHandler, cb) : () => {}), [channelId, viewHandler]),
    useCallback(() => (channelId ? getModelSnapshot(channelId, viewHandler) : EMPTY_MODEL), [channelId, viewHandler])
  );

  if (!channelId || !emit) return null;
  if (model.layoutConfig.length === 0) return <p className="doc-empty">Loading…</p>;

  return (
    <LayoutRenderer
      nodes={model.layoutConfig}
      state={model.docState as unknown as Record<string, unknown>}
      emit={emit}
      channelId={channelId}
    />
  );
}
