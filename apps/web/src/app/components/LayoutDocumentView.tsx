import { useSyncExternalStore, useEffect, useCallback, useContext, useMemo, createContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { Artifact, InboundMessage } from '@agentic-client-server-base/shared-types';
import { eventManager } from '../services/EventManager';
import { LayoutRenderer } from '../../components/LayoutRenderer';
import { subscribeToModel, getModelSnapshot, mountChannel, onRedirect } from '../services/documentModelStore';

interface Props {
  doc?: Artifact;
  channelId?: string;
  viewHandler?: string;
  groupId?: string;
}

// Tracks which channelIds are already being rendered above the current point in the tree.
// A layoutDocumentView node's channelId is resolved from live docState (e.g. $temp.nestedChannelId),
// so a data bug can point it at an ancestor's own channel — without this guard that produces
// unbounded synchronous recursion (documentModelStore's cache makes the nested mount a same-tick
// cache hit, so there's no async gap where React could otherwise break the cycle).
const DocumentViewAncestryContext = createContext<ReadonlySet<string>>(new Set());

export function LayoutDocumentView({ doc, channelId: channelIdProp, viewHandler = 'defaultView', groupId }: Props) {
  const resolvedChannelId = channelIdProp ?? doc?.currentChannelId ?? '';
  const ancestry = useContext(DocumentViewAncestryContext);
  const isRecursive = !!resolvedChannelId && ancestry.has(resolvedChannelId);

  const navigate = useNavigate();

  useEffect(() => {
    return onRedirect(resolvedChannelId, (url) => navigate(url));
  }, [resolvedChannelId, navigate]);

  const emit = useCallback((type: string, payload: Record<string, unknown> = {}) => {
    eventManager.publish(resolvedChannelId, {
      type,
      from: 'client' as const,
      to: 'server' as const,
      channel: resolvedChannelId,
      timestamp: new Date().toISOString(),
      ...(groupId ? { groupId } : {}),
      ...payload,
    } as unknown as InboundMessage);
  }, [resolvedChannelId, groupId]);

  useEffect(() => {
    if (!isRecursive) mountChannel(resolvedChannelId, emit, viewHandler);
  }, [resolvedChannelId, emit, viewHandler, isRecursive]);

  const model = useSyncExternalStore(
    useCallback((cb) => subscribeToModel(resolvedChannelId, viewHandler, cb), [resolvedChannelId, viewHandler]),
    useCallback(() => getModelSnapshot(resolvedChannelId, viewHandler), [resolvedChannelId, viewHandler])
  );

  const childAncestry = useMemo(() => new Set([...ancestry, resolvedChannelId]), [ancestry, resolvedChannelId]);

  if (isRecursive) {
    return <p className="doc-error">This document is already open above — refusing to nest it inside itself.</p>;
  }

  if (model.layoutConfig.length === 0) {
    return <p className="doc-empty">Loading…</p>;
  }

  return (
    <DocumentViewAncestryContext.Provider value={childAncestry}>
      <LayoutRenderer
        nodes={model.layoutConfig}
        state={model.docState as unknown as Record<string, unknown>}
        emit={emit}
      />
    </DocumentViewAncestryContext.Provider>
  );
}
