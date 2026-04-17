import { useEffect, useRef } from 'react';
import { UpdateStateMessage, DocumentSummary, ChatDocument } from '@multiplayer-base/shared-types';
import { DocumentStateProvider, useDocumentState } from '../../context/DocumentStateContext';
import { useDocumentChannel } from '../../hooks/useDocumentChannel';
import { DocumentListPanel } from './DocumentListPanel';
import { DocumentPanel } from './DocumentPanel';

function DashboardContent({ channelId }: { channelId: string }) {
  const { messages, emit } = useDocumentChannel(channelId);
  const { state, dispatch } = useDocumentState();
  const processedRef = useRef(0);

  useEffect(() => {
    const newMessages = messages.slice(processedRef.current);
    processedRef.current = messages.length;
    for (const msg of newMessages) {
      if (msg.type === 'update-state') {
        const m = msg as UpdateStateMessage;
        dispatch({ state: m.state, append: m.append });
      }
    }
  }, [messages, dispatch]);

  const documents = (state['documents'] as DocumentSummary[]) ?? [];
  const selectedDocument = (state['selectedDocument'] as unknown as ChatDocument) ?? null;

  return (
    <div className="dashboard-layout">
      <DocumentListPanel
        documents={documents}
        selectedId={selectedDocument?._id ?? null}
        onSelect={(id) => emit('select-document', { documentId: id })}
        onRefresh={() => emit('get-document-list')}
        onCreate={(name) => emit('create-document', { name, type: 'chat' })}
      />
      {selectedDocument && <DocumentPanel doc={selectedDocument} />}
    </div>
  );
}

export function DashboardDocumentView({ channelId }: { channelId: string }) {
  return (
    <DocumentStateProvider>
      <DashboardContent channelId={channelId} />
    </DocumentStateProvider>
  );
}
