import { useState, useRef, ReactNode, Suspense } from 'react';
import { Artifact } from '@multiplayer-base/shared-types';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { getDocumentComponent } from '@/app/registry/documentRegistry';

interface Props {
  openDocs?: Artifact[];
  loadedDocs?: Artifact[];
  onFirstActivate?: (payload: { id: string }) => void;
  children?: ReactNode;
  [key: string]: unknown;
}

export function SmartTabs({ openDocs = [], loadedDocs = [], onFirstActivate, children }: Props) {
  const [activeTab, setActiveTab] = useState('dashboard');
  const activatedRef = useRef<Set<string>>(new Set());

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    if (value !== 'dashboard' && !activatedRef.current.has(value)) {
      activatedRef.current.add(value);
      onFirstActivate?.({ id: value });
    }
  };

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange}>
      <TabsList variant="line">
        <TabsTrigger variant="line" value="dashboard">Dashboard</TabsTrigger>
        {(openDocs as Artifact[]).map((doc) => (
          <TabsTrigger key={doc._id} variant="line" value={doc._id}>{doc.name}</TabsTrigger>
        ))}
      </TabsList>

      <TabsContent value="dashboard">
        {children}
      </TabsContent>

      {(openDocs as Artifact[]).map((doc) => {
        const loaded = (loadedDocs as Artifact[]).find((d) => d._id === doc._id);
        const DocComponent = getDocumentComponent(doc.type);
        return (
          <TabsContent key={doc._id} value={doc._id}>
            {loaded && DocComponent ? (
              <Suspense fallback={<p className="doc-empty">Loading…</p>}>
                <DocComponent doc={loaded} />
              </Suspense>
            ) : (
              <p className="doc-empty">Loading…</p>
            )}
          </TabsContent>
        );
      })}
    </Tabs>
  );
}
