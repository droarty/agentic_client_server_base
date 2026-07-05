import { useState, useEffect } from 'react';
import { LayoutDocumentView } from '@/app/components/LayoutDocumentView';
import { apiGetOrCreateWorkflowSession } from '@/app/services/api';

interface Props {
  channelId?: string;
  workflowType?: string;
  groupId?: string;
  parentChannelId?: string;
  responseHandler?: string;
  viewHandler?: string;
  [key: string]: unknown;
}

export function LayoutDocumentViewLayout({ channelId: channelIdProp, workflowType, groupId, parentChannelId, responseHandler, viewHandler }: Props) {
  const [fetchedChannelId, setFetchedChannelId] = useState<string | undefined>();

  useEffect(() => {
    if (!channelIdProp && workflowType) {
      apiGetOrCreateWorkflowSession({ workflowType, groupId, parentChannelId, responseHandler }).then(({ channelId }) => setFetchedChannelId(channelId));
    } else if (!workflowType) {
      setFetchedChannelId(undefined);
    }
  }, [channelIdProp, workflowType, groupId, parentChannelId, responseHandler]);

  const resolvedChannelId = channelIdProp ?? fetchedChannelId;

  if (!resolvedChannelId) return null;

  return (
    <LayoutDocumentView
      channelId={resolvedChannelId}
      groupId={groupId}
      viewHandler={viewHandler as string | undefined}
    />
  );
}
