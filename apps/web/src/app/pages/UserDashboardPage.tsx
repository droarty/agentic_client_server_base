import { useState, useCallback } from 'react';
import { ChatDocument } from '@multiplayer-base/shared-types';
import { PageHeader } from '../components/PageHeader';
import { useDashboardChannelId } from '../hooks/useDashboardChannelId';
import { DashboardDocumentView } from '../components/dashboard/DashboardDocumentView';
import { DocumentPanel } from '../components/dashboard/DocumentPanel';
import { Tabs, TabItem, TabPanel } from '../components/shared/Tabs';

const DOCUMENTS_TAB: TabItem = { id: 'documents', title: 'Documents' };

export function UserDashboardPage() {
  const dashboardChannelId = useDashboardChannelId();
  const [openDocs, setOpenDocs] = useState<ChatDocument[]>([]);
  const [activeTab, setActiveTab] = useState('documents');

  const onOpenDocument = useCallback((doc: ChatDocument) => {
    setOpenDocs((prev) =>
      prev.find((d) => d._id === doc._id) ? prev : [...prev, doc]
    );
    setActiveTab(doc._id);
  }, []);

  const tabs: TabItem[] = [
    DOCUMENTS_TAB,
    ...openDocs.map((d) => ({ id: d._id, title: d.name })),
  ];

  const selectedDocId = activeTab !== 'documents' ? activeTab : null;

  return (
    <div className="page">
      <PageHeader title="User Dashboard" />
      <main>
        {dashboardChannelId ? (
          <>
            <Tabs tabs={tabs} activeTabId={activeTab} onTabSelect={setActiveTab} />
            <TabPanel tabId="documents" activeTabId={activeTab}>
              <DashboardDocumentView
                channelId={dashboardChannelId}
                selectedDocId={selectedDocId}
                onOpenDocument={onOpenDocument}
              />
            </TabPanel>
            {openDocs.map((doc) => (
              <TabPanel key={doc._id} tabId={doc._id} activeTabId={activeTab}>
                <DocumentPanel doc={doc} />
              </TabPanel>
            ))}
          </>
        ) : (
          <p className="doc-empty">Loading…</p>
        )}
      </main>
    </div>
  );
}
