import { type Database } from '@agentic-client-server-base/db-schema';
import { EventProcessorRequest } from '@agentic-client-server-base/shared-types';
import { PickedMediaItem } from './services/google-photos-picker.client';
import { runAssetTransform } from './services/asset-transform';
import { WorkflowLogEntry } from './WorkflowEngine';

export interface AssetTransformJob {
  channel: string;
  user?: { id: string; email: string };
  assetId: number;
  item: PickedMediaItem;
}

export interface AssetTransformManagerDeps {
  db: Database;
  logWorkflowStep?: (entry: WorkflowLogEntry) => void;
  handleInboundEvent: (input: EventProcessorRequest) => Promise<void>;
}

// Fire-and-forget-then-re-enter, mirroring AIEventManager: publish() kicks
// off the download/convert/upload work without blocking the caller (the
// database-query that triggered it has already returned by the time this
// resolves); once it settles, a synthetic message re-enters the workflow via
// handleInboundEvent exactly like a fresh inbound event, triggering the
// asset-transform-completed handler which pushes the live update.
export class AssetTransformManager {
  constructor(private deps: AssetTransformManagerDeps) { }

  publish(job: AssetTransformJob): void {
    this.process(job).catch((err) => console.error('AssetTransformManager error:', err));
  }

  private async process(job: AssetTransformJob): Promise<void> {
    const { channel, user, assetId, item } = job;
    const row = await runAssetTransform(this.deps.db, user!.id, assetId, item);

    if (row.transformStatus === 'failed') {
      this.deps.logWorkflowStep?.({
        createdAt: new Date(),
        channel,
        docType: '',
        handlerName: 'asset-transform',
        logType: 'error',
        errorMessage: 'Failed to download/persist picked media item',
        errorDetail: JSON.stringify((row.metadata as Record<string, unknown> | null)?.['transformErrors']),
      });
    }

    await this.deps.handleInboundEvent({
      message: {
        type: 'asset-transform-completed',
        channel,
        timestamp: new Date().toISOString(),
        assetPublicId: row.publicId,
        sourceUrl: row.sourceUrl,
        thumbnailSrc: row.thumbnailSrc,
        transformStatus: row.transformStatus,
        metadata: row.metadata,
      },
      user,
    });
  }
}
