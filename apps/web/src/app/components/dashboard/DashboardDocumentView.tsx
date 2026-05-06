import { useEffect, useRef } from 'react';
import { UpdateStateMessage, ArtifactSummary, Artifact } from '@multiplayer-base/shared-types';
import { DocumentStateProvider, useDocumentState } from '../../context/DocumentStateContext';
import { useDocumentChannel } from '../../hooks/useDocumentChannel';
import { DocumentListPanel } from './DocumentListPanel';
import { getDocumentTypes } from '../../registry/documentRegistry';

interface Props {
  channelId: string;
  selectedDocId: string | null;
  onOpenDocument: (doc: Artifact) => void;
}

function DashboardContent({ channelId, selectedDocId, onOpenDocument }: Props) {
  const { messages, emit } = useDocumentChannel(channelId);
  const { state, dispatch } = useDocumentState();
  const processedRef = useRef(0);

  useEffect(() => {
    const newMessages = messages.slice(processedRef.current);
    processedRef.current = messages.length;
    for (const msg of newMessages) {
      if (msg.type === 'update-state') {
        const m = msg as UpdateStateMessage;
        if (!m.actions?.length) continue;
        let selectedDoc: Artifact | undefined;
        const stateUpdate: Record<string, unknown> = {};
        for (const action of m.actions) {
          if (action.path === 'selectedDocument') {
            selectedDoc = action.value as Artifact;
          } else {
            stateUpdate[action.path] = action.value;
          }
        }
        if (selectedDoc) onOpenDocument(selectedDoc);
        if (Object.keys(stateUpdate).length > 0) dispatch({ state: stateUpdate });
      }
    }
  }, [messages, dispatch, onOpenDocument]);

  const documents = (state['documents'] as ArtifactSummary[]) ?? [];

  return (
    <div className="dashboard-layout">
      <DocumentListPanel
        documents={documents}
        selectedId={selectedDocId}
        onSelect={(id) => emit('select-document', { documentId: id })}
        onRefresh={() => emit('get-document-list')}
        availableTypes={getDocumentTypes()}
        onCreate={(name, documentType) => emit('create-document', { name, documentType })}
      />
    </div>
  );
}

export function DashboardDocumentView({ channelId, selectedDocId, onOpenDocument }: Props) {
  return (
    <DocumentStateProvider>
      <DashboardContent channelId={channelId} selectedDocId={selectedDocId} onOpenDocument={onOpenDocument} />
    </DocumentStateProvider>
  );
}
