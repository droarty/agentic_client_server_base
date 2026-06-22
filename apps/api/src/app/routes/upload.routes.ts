import { Router, Response, NextFunction } from 'express';
import multer from 'multer';
import { pack } from 'msgpackr';
import { randomUUID } from 'crypto';
import { authMiddleware, AuthRequest } from '../middleware/auth.middleware';
import { ArtifactModel } from '../models/document.model';
import { fileExtractService } from '../services/fileExtract.service';
import { redis } from '../redis/redis.client';
import { PUBSUB_CHANNEL, DeliveryInstruction } from '../websocket/EventProcessorTypes';
import { WsServerMessage } from '@multiplayer-base/shared-types';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

export const uploadRoutes = Router();

uploadRoutes.use(authMiddleware);

const INITIAL_ANALYSIS_PROMPT =
  'You are analyzing a PDF document to extract structured data. In your FIRST response:\n' +
  '1. Briefly describe what the document contains (1-2 sentences)\n' +
  '2. Propose a schema (list of field names, types, and descriptions) that captures the records in this document\n' +
  '3. Suggest a descriptive name for this asset (e.g., "NGSS Science Standards 2024")\n' +
  '4. Suggest a category for it (e.g., "education-standards", "curriculum", "assessment")\n\n' +
  'You MUST respond with valid JSON only — no markdown, no explanation, no code blocks.\n' +
  'Respond with exactly one of:\n' +
  '{"type":"chat-response","content":"your message"}\n' +
  '{"type":"schema-proposed","content":"your message","schema":{"fields":[{"name":"...","type":"...","description":"..."}],"description":"..."},"assetName":"...","assetCategory":"..."}';

async function publishUpdateState(
  channel: string,
  actions: Array<{ actionType: string; path: string; value: unknown }>
): Promise<void> {
  const socketIds = await redis.smembers(`channel:${channel}`);
  if (socketIds.length === 0) return;
  const outbound = {
    id: randomUUID(),
    type: 'update-state',
    from: 'server',
    to: 'client',
    channel,
    timestamp: new Date().toISOString(),
    actions,
  };
  const frame = pack({ type: 'channel-message', message: outbound } as WsServerMessage);
  await redis.publish(PUBSUB_CHANNEL, pack({ frame, socketIds } as DeliveryInstruction));
}

uploadRoutes.post('/channel/:channelId/upload', upload.single('file'), async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { channelId } = req.params;
    const file = req.file;
    if (!file) {
      res.status(400).json({ message: 'No file uploaded' });
      return;
    }
    if (file.mimetype !== 'application/pdf') {
      res.status(400).json({ message: 'Only PDF files are supported' });
      return;
    }

    const doc = await ArtifactModel.findOne({ currentChannelId: channelId });
    if (!doc || doc.type !== 'mid-sized-structured-asset-creator') {
      res.status(404).json({ message: 'Document not found' });
      return;
    }

    const documentId = doc._id.toString();
    const channel = channelId;
    const fileName = file.originalname;

    // Respond immediately — the AI analysis is async
    res.status(202).json({ message: 'Upload received, analyzing…' });

    // Notify clients that we're uploading
    await publishUpdateState(channel, [
      { actionType: 'update', path: '$state.uploadStatus', value: 'uploading' },
      { actionType: 'update', path: '$state.fileName', value: fileName },
    ]);

    // Upload to Anthropic Files API
    const fileId = await fileExtractService.uploadToFilesApi(file.buffer, fileName);

    // Persist fileId and notify clients we're now analyzing
    await ArtifactModel.findByIdAndUpdate(documentId, {
      $set: {
        'state.fileId': fileId,
        'state.fileName': fileName,
        'state.uploadStatus': 'analyzing',
        'state.chatHistory': [],
        'state.proposedSchema': null,
        'state.extractedData': null,
        'state.saveIntent': null,
        'state.existingVersion': null,
        'state.existingAssetId': null,
        'state.savedVersion': null,
      },
    });

    await publishUpdateState(channel, [
      { actionType: 'update', path: '$state.fileId', value: fileId },
      { actionType: 'update', path: '$state.uploadStatus', value: 'analyzing' },
      { actionType: 'update', path: '$state.chatHistory', value: [] },
    ]);

    // Initial AI analysis — first file-chat call
    const raw = await fileExtractService.fileChat({
      fileId,
      chatHistory: [],
      userMessage: 'Please analyze this document.',
      systemPrompt: INITIAL_ANALYSIS_PROMPT,
      model: 'claude-opus-4-8',
      maxTokens: 2048,
    });

    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      console.error('Upload route: invalid JSON from initial analysis:', raw.slice(0, 300));
      await publishUpdateState(channel, [
        { actionType: 'update', path: '$state.uploadStatus', value: 'schema-discussion' },
        {
          actionType: 'append', path: '$state.chatHistory',
          value: { role: 'assistant', content: 'I analyzed your document but had trouble formatting my response. Please describe the structure you want and I\'ll help from here.' },
        },
      ]);
      return;
    }

    const assistantMessage = { role: 'assistant', content: (parsed['content'] as string) ?? '' };

    if (parsed['type'] === 'schema-proposed') {
      // Persist the initial schema and chat history
      await ArtifactModel.findByIdAndUpdate(documentId, {
        $set: {
          'state.proposedSchema': parsed['schema'],
          'state.assetName': parsed['assetName'],
          'state.assetCategory': parsed['assetCategory'],
          'state.uploadStatus': 'checking',
        },
        $push: { 'state.chatHistory': assistantMessage },
      });

      // Notify clients with updated state
      await publishUpdateState(channel, [
        { actionType: 'append', path: '$state.chatHistory', value: assistantMessage },
        { actionType: 'update', path: '$state.proposedSchema', value: parsed['schema'] },
        { actionType: 'update', path: '$state.assetName', value: parsed['assetName'] },
        { actionType: 'update', path: '$state.assetCategory', value: parsed['assetCategory'] },
        { actionType: 'update', path: '$state.uploadStatus', value: 'checking' },
      ]);

      // Check if asset already exists
      const { StructuredAssetModel } = await import('../models/structured-asset.model');
      const assetName = parsed['assetName'] as string | undefined;
      const assetCategory = parsed['assetCategory'] as string | undefined;

      if (assetName && assetCategory) {
        const existing = await StructuredAssetModel
          .findOne({ name: assetName, category: assetCategory })
          .sort({ assetVersion: -1 });

        if (existing) {
          await ArtifactModel.findByIdAndUpdate(documentId, {
            $set: {
              'state.existingVersion': existing.assetVersion,
              'state.existingAssetId': existing._id.toString(),
              'state.saveIntent': null,
              'state.uploadStatus': 'version-check',
            },
          });
          await publishUpdateState(channel, [
            { actionType: 'update', path: '$state.existingVersion', value: existing.assetVersion },
            { actionType: 'update', path: '$state.existingAssetId', value: existing._id.toString() },
            { actionType: 'update', path: '$state.saveIntent', value: null },
            { actionType: 'update', path: '$state.uploadStatus', value: 'version-check' },
          ]);
        } else {
          await ArtifactModel.findByIdAndUpdate(documentId, {
            $set: { 'state.saveIntent': 'create', 'state.uploadStatus': 'schema-proposed' },
          });
          await publishUpdateState(channel, [
            { actionType: 'update', path: '$state.saveIntent', value: 'create' },
            { actionType: 'update', path: '$state.uploadStatus', value: 'schema-proposed' },
          ]);
        }
      } else {
        await ArtifactModel.findByIdAndUpdate(documentId, { $set: { 'state.uploadStatus': 'schema-discussion' } });
        await publishUpdateState(channel, [{ actionType: 'update', path: '$state.uploadStatus', value: 'schema-discussion' }]);
      }
    } else {
      // chat-response — Claude needs more discussion before proposing a schema
      await ArtifactModel.findByIdAndUpdate(documentId, {
        $set: { 'state.uploadStatus': 'schema-discussion' },
        $push: { 'state.chatHistory': assistantMessage },
      });
      await publishUpdateState(channel, [
        { actionType: 'append', path: '$state.chatHistory', value: assistantMessage },
        { actionType: 'update', path: '$state.uploadStatus', value: 'schema-discussion' },
      ]);
    }
  } catch (err) {
    next(err);
  }
});
