import * as path from 'path';
import * as fs from 'fs';
import { MongoClient } from 'mongodb';
import { WorkflowContext, WorkflowLogEntry } from './WorkflowEngine';

interface QueryExecutorDeps {
  mongoClient: MongoClient;
  dbReady: Promise<MongoClient>;
  configDir: string;
  logWorkflowStep: (entry: WorkflowLogEntry) => void;
}

export function createQueryExecutor(deps: QueryExecutorDeps) {
  const { mongoClient, dbReady, configDir, logWorkflowStep } = deps;

  return async function executeQuery(queryName: string, context: WorkflowContext): Promise<Record<string, unknown>> {
    try {
      await dbReady;
      const db = mongoClient.db();
      if (queryName === 'get-available-types') {
        const files = fs.readdirSync(configDir);
        const availableTypes = files
          .filter((f: string) => f.endsWith('.json'))
          .map((f: string) => f.replace('.json', ''))
          .filter((t: string) => t !== 'user-dashboard');
        return { availableTypes };
      }
      if (queryName === 'get-user-documents') {
        const userId = context.user?.['id'] as string | undefined;
        if (!userId) return { documents: [] };
        const rawDocs = await db
          .collection('artifacts')
          .find(
            { userId, type: { $ne: 'user-dashboard' } },
            { projection: { _id: 1, name: 1, type: 1, userId: 1, currentChannelId: 1, createdAt: 1, updatedAt: 1 } }
          )
          .toArray();
        return { documents: JSON.parse(JSON.stringify(rawDocs)) };
      }
      if (queryName === 'get-reviewable-documents') {
        const userId = context.user?.['id'] as string | undefined;
        if (!userId) return { documents: [] };
        const rawDocs = await db
          .collection('artifacts')
          .find(
            { userId, type: { $nin: ['user-dashboard', 'log-review'] } },
            { projection: { _id: 1, name: 1, type: 1, userId: 1, currentChannelId: 1, createdAt: 1, updatedAt: 1 } }
          )
          .toArray();
        return { documents: JSON.parse(JSON.stringify(rawDocs)) };
      }
      if (queryName === 'get-document') {
        const userId = context.user?.['id'] as string | undefined;
        if (!userId) return { document: null };
        const documentId = context.message['documentId'] as string | undefined;
        const channel = context.message['channel'] as string | undefined;
        const { ObjectId } = await import('mongodb');
        let rawDoc;
        if (documentId) {
          rawDoc = await db.collection('artifacts').findOne({ _id: new ObjectId(documentId), userId });
        } else if (channel) {
          rawDoc = await db.collection('artifacts').findOne({ currentChannelId: channel, userId });
        }
        return { document: rawDoc ? JSON.parse(JSON.stringify(rawDoc)) : null };
      }
      if (queryName === 'get-document-summary') {
        const userId = context.user?.['id'] as string | undefined;
        if (!userId) return { document: null };
        const documentId = context.message['documentId'] as string | undefined;
        const channel = context.message['channel'] as string | undefined;
        const { ObjectId } = await import('mongodb');
        const projection = { projection: { _id: 1, name: 1, type: 1, userId: 1, currentChannelId: 1, createdAt: 1, updatedAt: 1 } };
        let rawDoc;
        if (documentId) {
          rawDoc = await db.collection('artifacts').findOne({ _id: new ObjectId(documentId), userId }, projection);
        } else if (channel) {
          rawDoc = await db.collection('artifacts').findOne({ currentChannelId: channel, userId }, projection);
        }
        return { document: rawDoc ? JSON.parse(JSON.stringify(rawDoc)) : null };
      }
      if (queryName === 'get-users') {
        const users = await db
          .collection('users')
          .find({}, { projection: { _id: 1, email: 1, roles: 1 } })
          .toArray();
        return { users: JSON.parse(JSON.stringify(users)) };
      }
      if (queryName === 'create-document') {
        const name = (context.message['name'] as string | undefined)?.trim();
        const type = (context.message['documentType'] as string | undefined) ?? 'configged-chat';
        if (!name) return { document: null, documents: [] };
        const userId = context.user?.['id'] as string | undefined;
        const { randomUUID } = await import('crypto');
        const now = new Date();
        const configPath = path.join(configDir, `${type}.json`);
        let initialState: Record<string, unknown> | undefined;
        if (fs.existsSync(configPath)) {
          const wfConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as { initialState?: Record<string, unknown> };
          initialState = wfConfig.initialState;
        }
        const docFields: Record<string, unknown> = {
          name,
          type,
          userId,
          currentChannelId: randomUUID(),
          createdAt: now,
          updatedAt: now,
        };
        if (initialState !== undefined) {
          docFields['state'] = initialState;
        }
        const result = await db.collection('artifacts').insertOne(docFields as any);
        const newDoc = await db.collection('artifacts').findOne({ _id: result.insertedId });
        const rawDocs = await db
          .collection('artifacts')
          .find(
            { userId, type: { $nin: ['user-dashboard', 'log-review'] } },
            { projection: { _id: 1, name: 1, type: 1, userId: 1, currentChannelId: 1, createdAt: 1, updatedAt: 1 } }
          )
          .toArray();
        return {
          document: JSON.parse(JSON.stringify({
            _id: newDoc!._id,
            name: newDoc!.name,
            type: newDoc!.type,
            userId: newDoc!.userId,
            currentChannelId: newDoc!.currentChannelId,
            createdAt: newDoc!.createdAt,
            updatedAt: newDoc!.updatedAt,
          })),
          documents: JSON.parse(JSON.stringify(rawDocs)),
        };
      }
      if (queryName === 'get-workflow-logs') {
        const userId = context.user?.['id'] as string | undefined;
        const id = context.message['id'] as string | undefined;
        if (!id) return { id: null, workflowLogs: [] };
        const { ObjectId } = await import('mongodb');
        const doc = await db.collection('artifacts').findOne(
          { _id: new ObjectId(id), userId },
          { projection: { currentChannelId: 1 } }
        );
        if (!doc) return { id, workflowLogs: [] };
        const logs = await db.collection('workflowlogs')
          .find({ channel: doc.currentChannelId, parentExecutionId: null, logType: 'handler' })
          .sort({ createdAt: -1 })
          .toArray();
        return { id, workflowLogs: JSON.parse(JSON.stringify(logs)) };
      }
      async function buildTree(executionId: string, channel: string): Promise<unknown[]> {
        const routes = await db
          .collection('workflowlogs')
          .find({ channel, executionId, logType: { $in: ['route', 'error'] } })
          .sort({ stepIndex: 1 })
          .toArray();
        const children: unknown[] = [];
        for (const route of routes) {
          const routeNode: Record<string, unknown> = {
            id: String(route._id),
            name: route.logType === 'error'
              ? `[${route.stepIndex ?? '?'}] error: ${route.errorMessage ?? ''}`
              : `[${route.stepIndex ?? '?'}] route: ${Array.isArray(route.route) ? (route.route as string[]).join(', ') : route.route}`,
            rawData: JSON.parse(JSON.stringify(route)),
            children: [],
          };
          const subHandler = await db.collection('workflowlogs').findOne({
            channel,
            parentExecutionId: executionId,
            stepIndex: route.stepIndex,
            logType: 'handler',
          });
          if (subHandler) {
            const subChildren = await buildTree(subHandler.executionId, channel);
            (routeNode.children as unknown[]).push({
              id: String(subHandler._id),
              name: `handler: ${subHandler.handlerName}`,
              rawData: JSON.parse(JSON.stringify(subHandler)),
              children: subChildren,
            });
          }
          children.push(routeNode);
        }
        return children;
      }

      if (queryName === 'get-log-tree') {
        const userId = context.user?.['id'] as string | undefined;
        const id = context.message['id'] as string | undefined;
        if (!id) return { id: null, treeData: [] };
        const { ObjectId } = await import('mongodb');
        const root = await db.collection('workflowlogs').findOne({ _id: new ObjectId(id) });
        if (!root) return { id, treeData: [] };
        const artifact = await db.collection('artifacts').findOne(
          { currentChannelId: root.channel, userId },
          { projection: { _id: 1 } }
        );
        if (!artifact) return { id, treeData: [] };
        const rootChildren = await buildTree(root.executionId, root.channel);
        const treeData = [{
          id: String(root._id),
          name: `handler: ${root.handlerName}`,
          rawData: JSON.parse(JSON.stringify(root)),
          children: rootChildren,
        }];
        return { id, treeData };
      }
      if (queryName === 'rehydrate-workflow-logs') {
        const userId = context.user?.['id'] as string | undefined;
        const document = context.message['document'] as Record<string, unknown> | null;
        const docState = document?.['state'] as Record<string, unknown> | undefined;
        const id = docState?.['selectedDocumentId'] as string | undefined;
        if (!id) return { workflowLogs: [] };
        const { ObjectId } = await import('mongodb');
        const doc = await db.collection('artifacts').findOne(
          { _id: new ObjectId(id), userId },
          { projection: { currentChannelId: 1 } }
        );
        if (!doc) return { workflowLogs: [] };
        const logs = await db.collection('workflowlogs')
          .find({ channel: doc.currentChannelId, parentExecutionId: null, logType: 'handler' })
          .sort({ createdAt: -1 })
          .toArray();
        return { workflowLogs: JSON.parse(JSON.stringify(logs)) };
      }
      if (queryName === 'rehydrate-log-tree') {
        const userId = context.user?.['id'] as string | undefined;
        const document = context.message['document'] as Record<string, unknown> | null;
        const docState = document?.['state'] as Record<string, unknown> | undefined;
        const id = docState?.['selectedLogId'] as string | undefined;
        if (!id) return { treeData: [] };
        const { ObjectId } = await import('mongodb');
        const root = await db.collection('workflowlogs').findOne({ _id: new ObjectId(id) });
        if (!root) return { treeData: [] };
        const artifact = await db.collection('artifacts').findOne(
          { currentChannelId: root.channel, userId },
          { projection: { _id: 1 } }
        );
        if (!artifact) return { treeData: [] };
        const rootChildren = await buildTree(root.executionId, root.channel);
        const treeData = [{
          id: String(root._id),
          name: `handler: ${root.handlerName}`,
          rawData: JSON.parse(JSON.stringify(root)),
          children: rootChildren,
        }];
        return { treeData };
      }

      return {};
    } catch (err) {
      logWorkflowStep({ createdAt: new Date(), channel: (context.message['channel'] as string) || '', docType: '', handlerName: queryName, logType: 'error', errorMessage: 'executeQuery error', errorDetail: String(err) });
      return {};
    }
  };
}
