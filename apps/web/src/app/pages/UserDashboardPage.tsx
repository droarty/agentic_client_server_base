import { useState, useCallback } from 'react';
import { Artifact } from '@multiplayer-base/shared-types';
import { PageHeader } from '../components/PageHeader';
import { useDashboardChannelId } from '../hooks/useDashboardChannelId';
import { DashboardDocumentView } from '../components/dashboard/DashboardDocumentView';
import { DocumentPanel } from '../components/dashboard/DocumentPanel';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

export function UserDashboardPage() {
  const dashboardChannelId = useDashboardChannelId();
  const [openDocs, setOpenDocs] = useState<Artifact[]>([]);
  const [activeTab, setActiveTab] = useState('documents');

  const onOpenDocument = useCallback((doc: Artifact) => {
    setOpenDocs((prev) =>
      prev.find((d) => d._id === doc._id) ? prev : [...prev, doc]
    );
    setActiveTab(doc._id);
  }, []);

  const selectedDocId = activeTab !== 'documents' ? activeTab : null;

  return (
    <div className="page">
      <PageHeader title="User Dashboard" />
      <main>
        {dashboardChannelId ? (
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList variant="line">
              <TabsTrigger variant="line" value="documents">Documents</TabsTrigger>
              {openDocs.map((doc) => (
                <TabsTrigger key={doc._id} variant="line" value={doc._id}>{doc.name}</TabsTrigger>
              ))}
            </TabsList>
            <TabsContent value="documents">
              <DashboardDocumentView
                channelId={dashboardChannelId}
                selectedDocId={selectedDocId}
                onOpenDocument={onOpenDocument}
              />
            </TabsContent>
            {openDocs.map((doc) => (
              <TabsContent key={doc._id} value={doc._id}>
                <DocumentPanel doc={doc} />
              </TabsContent>
            ))}
          </Tabs>
        ) : (
          <p className="doc-empty">Loading…</p>
        )}
      </main>
    </div>
  );
}
