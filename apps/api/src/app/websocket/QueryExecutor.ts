import * as path from 'path';
import * as fs from 'fs';
import { MongoClient } from 'mongodb';
import type { ObjectId } from 'mongodb';
import { WorkflowContext, WorkflowLogEntry } from './WorkflowEngine';

interface QueryExecutorDeps {
  mongoClient: MongoClient;
  dbReady: Promise<MongoClient>;
  configDir: string;
  logWorkflowStep: (entry: WorkflowLogEntry) => void;
}

export function createQueryExecutor(deps: QueryExecutorDeps) {
  const { mongoClient, dbReady, configDir, logWorkflowStep } = deps;

  const stringifyId = <T extends { _id: unknown }>(doc: T): Omit<T, '_id'> & { _id: string } =>
    ({ ...doc, _id: String(doc._id) });

  async function getChannelIdForArtifact(artifactId: ObjectId): Promise<string | null> {
    const channelDoc = await mongoClient.db().collection('channels')
      .findOne({ artifactId }, { projection: { channelId: 1 } });
    return (channelDoc?.['channelId'] as string | undefined) ?? null;
  }

  async function getArtifactIdForChannel(channelId: string): Promise<ObjectId | null> {
    const channelDoc = await mongoClient.db().collection('channels')
      .findOne({ channelId }, { projection: { artifactId: 1 } });
    return (channelDoc?.['artifactId'] as ObjectId | undefined) ?? null;
  }

  return async function executeQuery(queryName: string, context: WorkflowContext): Promise<Record<string, unknown>> {
    try {
      await dbReady;
      const db = mongoClient.db();
      if (queryName === 'get-available-types') {
        const systemExclusions = new Set(['user-dashboard', 'log-review', 'group-dashboard', 'create-new-group-workflow', 'manage-members-workflow', 'create-new-document-workflow']);
        const files = fs.readdirSync(configDir);
        const filesystemTypes = files
          .filter((f: string) => f.endsWith('.json'))
          .map((f: string) => f.replace('.json', ''))
          .filter((t: string) => !systemExclusions.has(t));
        const customConfigs = await db.collection('workflowconfigs').find({}, { projection: { name: 1 } }).toArray();
        const customTypes = customConfigs.map((c) => c['name'] as string);
        const availableTypes = [...new Set([...filesystemTypes, ...customTypes])];
        return { availableTypes };
      }
      if (queryName === 'get-user-documents') {
        const userId = context.user?.['id'] as string | undefined;
        if (!userId) return { documents: [] };
        const rawDocs = await db
          .collection('artifacts')
          .find(
            { userId, type: { $ne: 'user-dashboard' } },
            { projection: { _id: 1, name: 1, type: 1, userId: 1, createdAt: 1, updatedAt: 1 } }
          )
          .toArray();
        const { ObjectId: ObjId } = await import('mongodb');
        const artifactIds = rawDocs.map((d) => d._id as ObjectId);
        const channels = artifactIds.length > 0
          ? await db.collection('channels').find({ artifactId: { $in: artifactIds } }, { projection: { artifactId: 1, channelId: 1 } }).toArray()
          : [];
        const channelMap = new Map(channels.map((c) => [String(c['artifactId']), c['channelId'] as string]));
        return { documents: rawDocs.map((d) => ({ ...stringifyId(d), currentChannelId: channelMap.get(String(d._id)) ?? '' })) };
      }
      if (queryName === 'get-reviewable-documents') {
        const userId = context.user?.['id'] as string | undefined;
        if (!userId) return { documents: [] };
        const rawDocs = await db
          .collection('artifacts')
          .find(
            { userId, type: { $nin: ['user-dashboard', 'log-review'] } },
            { projection: { _id: 1, name: 1, type: 1, userId: 1, createdAt: 1, updatedAt: 1 } }
          )
          .toArray();
        const artifactIds = rawDocs.map((d) => d._id as ObjectId);
        const channels = artifactIds.length > 0
          ? await db.collection('channels').find({ artifactId: { $in: artifactIds } }, { projection: { artifactId: 1, channelId: 1 } }).toArray()
          : [];
        const channelMap = new Map(channels.map((c) => [String(c['artifactId']), c['channelId'] as string]));
        return { documents: rawDocs.map((d) => ({ ...stringifyId(d), currentChannelId: channelMap.get(String(d._id)) ?? '' })) };
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
          const artifactId = await getArtifactIdForChannel(channel);
          if (artifactId) rawDoc = await db.collection('artifacts').findOne({ _id: artifactId, userId });
        }
        if (!rawDoc) return { document: null };
        const channelId = await getChannelIdForArtifact(rawDoc._id as ObjectId);
        return { document: { ...stringifyId(rawDoc), currentChannelId: channelId ?? '' } };
      }
      if (queryName === 'get-document-summary') {
        const userId = context.user?.['id'] as string | undefined;
        if (!userId) return { document: null };
        const documentId = context.message['documentId'] as string | undefined;
        const channel = context.message['channel'] as string | undefined;
        const { ObjectId } = await import('mongodb');
        const projection = { projection: { _id: 1, name: 1, type: 1, userId: 1, createdAt: 1, updatedAt: 1 } };
        let rawDoc;
        if (documentId) {
          rawDoc = await db.collection('artifacts').findOne({ _id: new ObjectId(documentId), userId }, projection);
        } else if (channel) {
          const artifactId = await getArtifactIdForChannel(channel);
          if (artifactId) rawDoc = await db.collection('artifacts').findOne({ _id: artifactId, userId }, projection);
        }
        if (!rawDoc) return { document: null };
        const channelId = await getChannelIdForArtifact(rawDoc._id as ObjectId);
        return { document: { ...stringifyId(rawDoc), currentChannelId: channelId ?? '' } };
      }
      if (queryName === 'get-users') {
        const users = await db
          .collection('users')
          .find({}, { projection: { _id: 1, email: 1, roles: 1 } })
          .toArray();
        return { users: users.map(stringifyId) };
      }
      if (queryName === 'create-document') {
        const name = (context.message['name'] as string | undefined)?.trim();
        const type = (context.message['documentType'] as string | undefined) ?? 'configged-chat';
        if (!name) return { document: null, documents: [] };
        const userId = context.user?.['id'] as string | undefined;
        const { randomUUID } = await import('crypto');
        const { ObjectId } = await import('mongodb');
        const now = new Date();
        const configPath = path.join(configDir, `${type}.json`);
        let initialState: Record<string, unknown> | undefined;
        if (fs.existsSync(configPath)) {
          const wfConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as { initialState?: Record<string, unknown> };
          initialState = wfConfig.initialState;
        } else {
          const customConfig = await db.collection('workflowconfigs').findOne({ name: type }, { projection: { initialState: 1 } });
          if (customConfig?.['initialState']) {
            initialState = customConfig['initialState'] as Record<string, unknown>;
          }
        }
        const docFields: Record<string, unknown> = {
          name,
          type,
          userId,
          createdAt: now,
          updatedAt: now,
        };
        if (initialState !== undefined) {
          docFields['state'] = initialState;
        }
        const result = await db.collection('artifacts').insertOne(docFields as any);
        const newChannelId = randomUUID();
        await db.collection('channels').insertOne({
          channelId: newChannelId,
          workflowType: type,
          userId,
          artifactId: result.insertedId,
          createdAt: now,
          updatedAt: now,
        });
        const newDoc = await db.collection('artifacts').findOne({ _id: result.insertedId });
        const rawDocs = await db
          .collection('artifacts')
          .find(
            { userId, type: { $nin: ['user-dashboard', 'log-review'] } },
            { projection: { _id: 1, name: 1, type: 1, userId: 1, createdAt: 1, updatedAt: 1 } }
          )
          .toArray();
        const artifactIds = rawDocs.map((d) => d._id as ObjectId);
        const channels = artifactIds.length > 0
          ? await db.collection('channels').find({ artifactId: { $in: artifactIds } }, { projection: { artifactId: 1, channelId: 1 } }).toArray()
          : [];
        const channelMap = new Map(channels.map((c) => [String(c['artifactId']), c['channelId'] as string]));
        return {
          document: {
            _id: String(newDoc!._id),
            name: newDoc!['name'],
            type: newDoc!['type'],
            userId: newDoc!['userId'],
            currentChannelId: newChannelId,
            createdAt: newDoc!['createdAt'],
            updatedAt: newDoc!['updatedAt'],
          },
          documents: rawDocs.map((d) => ({ ...stringifyId(d), currentChannelId: channelMap.get(String(d._id)) ?? '' })),
        };
      }
      if (queryName === 'get-workflow-logs') {
        const userId = context.user?.['id'] as string | undefined;
        const id = context.message['id'] as string | undefined;
        if (!id) return { id: null, workflowLogs: [] };
        const { ObjectId } = await import('mongodb');
        const artifact = await db.collection('artifacts').findOne(
          { _id: new ObjectId(id), userId },
          { projection: { _id: 1 } }
        );
        if (!artifact) return { id, workflowLogs: [] };
        const channelId = await getChannelIdForArtifact(artifact._id as ObjectId);
        if (!channelId) return { id, workflowLogs: [] };
        const logs = await db.collection('workflowlogs')
          .find({ channel: channelId, parentExecutionId: null, logType: 'handler' })
          .sort({ createdAt: -1 })
          .toArray();
        return { id, workflowLogs: logs.map(stringifyId) };
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
            rawData: structuredClone(route),
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
              rawData: structuredClone(subHandler),
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
        const channelDoc = await db.collection('channels').findOne(
          { channelId: root.channel },
          { projection: { artifactId: 1, userId: 1 } }
        );
        if (!channelDoc) return { id, treeData: [] };
        const artifact = channelDoc['artifactId']
          ? await db.collection('artifacts').findOne({ _id: channelDoc['artifactId'], userId }, { projection: { _id: 1 } })
          : null;
        if (channelDoc['artifactId'] && !artifact) return { id, treeData: [] };
        if (!channelDoc['artifactId'] && channelDoc['userId'] !== userId) return { id, treeData: [] };
        const rootChildren = await buildTree(root.executionId, root.channel);
        const treeData = [{
          id: String(root._id),
          name: `handler: ${root.handlerName}`,
          rawData: structuredClone(root),
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
        const artifact = await db.collection('artifacts').findOne(
          { _id: new ObjectId(id), userId },
          { projection: { _id: 1 } }
        );
        if (!artifact) return { workflowLogs: [] };
        const channelId = await getChannelIdForArtifact(artifact._id as ObjectId);
        if (!channelId) return { workflowLogs: [] };
        const logs = await db.collection('workflowlogs')
          .find({ channel: channelId, parentExecutionId: null, logType: 'handler' })
          .sort({ createdAt: -1 })
          .toArray();
        return { workflowLogs: logs.map(stringifyId) };
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
        const channelDoc = await db.collection('channels').findOne(
          { channelId: root.channel },
          { projection: { artifactId: 1, userId: 1 } }
        );
        if (!channelDoc) return { treeData: [] };
        const artifact = channelDoc['artifactId']
          ? await db.collection('artifacts').findOne({ _id: channelDoc['artifactId'], userId }, { projection: { _id: 1 } })
          : null;
        if (channelDoc['artifactId'] && !artifact) return { treeData: [] };
        if (!channelDoc['artifactId'] && channelDoc['userId'] !== userId) return { treeData: [] };
        const rootChildren = await buildTree(root.executionId, root.channel);
        const treeData = [{
          id: String(root._id),
          name: `handler: ${root.handlerName}`,
          rawData: structuredClone(root),
          children: rootChildren,
        }];
        return { treeData };
      }

      if (queryName === 'get-user-groups') {
        const userId = context.user?.['id'] as string | undefined;
        if (!userId) return { groups: [] };
        const { ObjectId } = await import('mongodb');
        const memberships = await db
          .collection('memberships')
          .find({ userId: new ObjectId(userId) }, { projection: { groupId: 1 } })
          .toArray();
        const groupIds = memberships.map((m) => m['groupId'] as ObjectId);
        if (groupIds.length === 0) return { groups: [] };
        const groups = await db
          .collection('groups')
          .find({ _id: { $in: groupIds }, parentGroupId: null })
          .toArray();
        return { groups: groups.map(stringifyId) };
      }
      if (queryName === 'get-subgroups') {
        const groupId = context.groupId;
        if (!groupId) return { groups: [] };
        const { ObjectId } = await import('mongodb');
        const groups = await db
          .collection('groups')
          .find({ parentGroupId: new ObjectId(groupId) })
          .toArray();
        return { groups: groups.map(stringifyId) };
      }
      if (queryName === 'get-channel-document') {
        const channel = context.message['channel'] as string | undefined;
        if (!channel) return { document: null };
        const artifactId = await getArtifactIdForChannel(channel);
        if (!artifactId) return { document: null };
        const rawDoc = await db.collection('artifacts').findOne({ _id: artifactId });
        return { document: rawDoc ? { ...stringifyId(rawDoc), currentChannelId: channel } : null };
      }
      if (queryName === 'get-or-create-workflow-channel') {
        const workflowType = (context.message['workflowType'] as string | undefined)?.trim();
        const userId = context.user?.['id'] as string | undefined;
        const groupId = context.groupId ?? (context.message['groupId'] as string | undefined);
        const callingChannel = context.message['channel'] as string | undefined;
        if (!workflowType || !userId) return { channelId: null };
        const { randomUUID } = await import('crypto');
        const { ObjectId } = await import('mongodb');
        const query: Record<string, unknown> = { workflowType, userId };
        if (groupId) query['groupId'] = new ObjectId(groupId);
        let channelDoc = await db.collection('channels').findOne(query);
        if (!channelDoc) {
          const now = new Date();
          const newChannelId = randomUUID();
          const doc: Record<string, unknown> = { channelId: newChannelId, workflowType, userId, parentChannelId: callingChannel, createdAt: now, updatedAt: now };
          if (groupId) doc['groupId'] = new ObjectId(groupId);
          await db.collection('channels').insertOne(doc);
          channelDoc = await db.collection('channels').findOne({ channelId: newChannelId });
        }
        return { channelId: channelDoc?.['channelId'] ?? null };
      }
      if (queryName === 'create-subgroup-with-permission') {
        const userId = context.user?.['id'] as string | undefined;
        const groupId = context.groupId;
        const groupName = (context.message['groupName'] as string | undefined)?.trim();
        if (!userId || !groupId || !groupName) return { newGroup: null, result: 'Missing required fields' };
        const { ObjectId } = await import('mongodb');
        const parentGroupObjId = new ObjectId(groupId);
        const userObjId = new ObjectId(userId);
        const membership = await db.collection('memberships').findOne({ userId: userObjId, groupId: parentGroupObjId });
        const roles = (membership?.['roles'] as string[] | undefined) ?? [];
        if (!roles.some((r) => r === 'admin' || r === 'owner')) {
          return { newGroup: null, result: 'Insufficient permissions to create sub-groups in this group' };
        }
        const parentGroup = await db.collection('groups').findOne({ _id: parentGroupObjId });
        if (!parentGroup) return { newGroup: null, result: 'Parent group not found' };
        const ancestors = [...((parentGroup['ancestors'] as unknown[]) ?? []), parentGroupObjId];
        const now = new Date();
        const insertResult = await db.collection('groups').insertOne({ name: groupName, parentGroupId: parentGroupObjId, ancestors, createdAt: now, updatedAt: now });
        await db.collection('memberships').insertOne({ userId: userObjId, groupId: insertResult.insertedId, roles: ['owner'], joinedAt: now, createdAt: now, updatedAt: now });
        return { newGroup: { _id: String(insertResult.insertedId), name: groupName }, result: `Group '${groupName}' created!` };
      }
      if (queryName === 'get-group-members') {
        const userId = context.user?.['id'] as string | undefined;
        const groupId = context.groupId;
        if (!userId || !groupId) return { members: [], isAdmin: false };
        const { ObjectId } = await import('mongodb');
        const groupObjId = new ObjectId(groupId);
        const callerMembership = await db.collection('memberships').findOne({ userId: new ObjectId(userId), groupId: groupObjId });
        const currentUserRoles = (callerMembership?.['roles'] as string[] | undefined) ?? [];
        const isAdmin = currentUserRoles.some((r) => r === 'admin' || r === 'owner');
        const memberships = await db.collection('memberships').find({ groupId: groupObjId }).toArray();
        const memberUserIds = memberships.map((m) => m['userId'] as ObjectId);
        const users = memberUserIds.length > 0
          ? await db.collection('users').find({ _id: { $in: memberUserIds } }, { projection: { _id: 1, email: 1 } }).toArray()
          : [];
        const emailByUserId = new Map(users.map((u) => [String(u._id), u['email'] as string]));
        const members = memberships.map((m) => ({
          _id: String(m['userId']),
          email: emailByUserId.get(String(m['userId'])) ?? 'unknown',
          roles: m['roles'] as string[],
        }));
        return { members, isAdmin };
      }
      if (queryName === 'add-group-member') {
        const userId = context.user?.['id'] as string | undefined;
        const groupId = context.groupId;
        const email = (context.message['email'] as string | undefined)?.trim().toLowerCase();
        if (!userId || !groupId || !email) return { result: 'Missing required fields' };
        const { ObjectId } = await import('mongodb');
        const groupObjId = new ObjectId(groupId);
        const callerMembership = await db.collection('memberships').findOne({ userId: new ObjectId(userId), groupId: groupObjId });
        const callerRoles = (callerMembership?.['roles'] as string[] | undefined) ?? [];
        if (!callerRoles.some((r) => r === 'admin' || r === 'owner')) {
          return { result: 'Insufficient permissions to add members' };
        }
        const targetUser = await db.collection('users').findOne({ email });
        if (!targetUser) return { result: `No user found with email ${email}` };
        const existing = await db.collection('memberships').findOne({ userId: targetUser._id, groupId: groupObjId });
        if (existing) return { result: `${email} is already a member` };
        const now = new Date();
        await db.collection('memberships').insertOne({ userId: targetUser._id, groupId: groupObjId, roles: ['member'], joinedAt: now, createdAt: now, updatedAt: now });
        return { result: `Added ${email} as a member` };
      }
      if (queryName === 'update-group-member-role') {
        const userId = context.user?.['id'] as string | undefined;
        const groupId = context.groupId;
        const targetUserId = context.message['_id'] as string | undefined;
        const newRole = context.message['role'] as string | undefined;
        if (!userId || !groupId || !targetUserId || !newRole || !['admin', 'member'].includes(newRole)) {
          return { result: 'Missing or invalid required fields' };
        }
        const { ObjectId } = await import('mongodb');
        const groupObjId = new ObjectId(groupId);
        const callerMembership = await db.collection('memberships').findOne({ userId: new ObjectId(userId), groupId: groupObjId });
        const callerRoles = (callerMembership?.['roles'] as string[] | undefined) ?? [];
        if (!callerRoles.some((r) => r === 'admin' || r === 'owner')) {
          return { result: 'Insufficient permissions to change member roles' };
        }
        const targetObjId = new ObjectId(targetUserId);
        const targetMembership = await db.collection('memberships').findOne({ userId: targetObjId, groupId: groupObjId });
        if (!targetMembership) return { result: 'Membership not found' };
        if ((targetMembership['roles'] as string[]).includes('owner')) {
          const ownerCount = await db.collection('memberships').countDocuments({ groupId: groupObjId, roles: 'owner' });
          if (ownerCount <= 1) return { result: 'Cannot change role of the last remaining owner' };
        }
        await db.collection('memberships').updateOne({ userId: targetObjId, groupId: groupObjId }, { $set: { roles: [newRole], updatedAt: new Date() } });
        return { result: 'Role updated' };
      }
      if (queryName === 'remove-group-member') {
        const userId = context.user?.['id'] as string | undefined;
        const groupId = context.groupId;
        const targetUserId = context.message['_id'] as string | undefined;
        if (!userId || !groupId || !targetUserId) return { result: 'Missing required fields' };
        const { ObjectId } = await import('mongodb');
        const groupObjId = new ObjectId(groupId);
        const callerMembership = await db.collection('memberships').findOne({ userId: new ObjectId(userId), groupId: groupObjId });
        const callerRoles = (callerMembership?.['roles'] as string[] | undefined) ?? [];
        if (!callerRoles.some((r) => r === 'admin' || r === 'owner')) {
          return { result: 'Insufficient permissions to remove members' };
        }
        const targetObjId = new ObjectId(targetUserId);
        const targetMembership = await db.collection('memberships').findOne({ userId: targetObjId, groupId: groupObjId });
        if (!targetMembership) return { result: 'Membership not found' };
        if ((targetMembership['roles'] as string[]).includes('owner')) {
          const ownerCount = await db.collection('memberships').countDocuments({ groupId: groupObjId, roles: 'owner' });
          if (ownerCount <= 1) return { result: 'Cannot remove the last remaining owner' };
        }
        await db.collection('memberships').deleteOne({ userId: targetObjId, groupId: groupObjId });
        return { result: 'Member removed' };
      }
      if (queryName === 'get-recent-user-documents') {
        const userId = context.user?.['id'] as string | undefined;
        if (!userId) return { documents: [] };
        const config = context.state?.['config'] as Record<string, unknown> | undefined;
        const limit = typeof config?.['recentDocumentLimit'] === 'number' ? config['recentDocumentLimit'] : 10;
        const rawDocs = await db
          .collection('artifacts')
          .find(
            { userId, type: { $nin: ['user-dashboard', 'group-dashboard', 'log-review'] } },
            { projection: { _id: 1, name: 1, type: 1, userId: 1, createdAt: 1, updatedAt: 1 } }
          )
          .sort({ createdAt: -1 })
          .limit(limit)
          .toArray();
        const artifactIds = rawDocs.map((d) => d._id as ObjectId);
        const channels = artifactIds.length > 0
          ? await db.collection('channels').find({ artifactId: { $in: artifactIds } }, { projection: { artifactId: 1, channelId: 1 } }).toArray()
          : [];
        const channelMap = new Map(channels.map((c) => [String(c['artifactId']), c['channelId'] as string]));
        return { documents: rawDocs.map((d) => ({ ...stringifyId(d), currentChannelId: channelMap.get(String(d._id)) ?? '' })) };
      }
      return {};
    } catch (err) {
      logWorkflowStep({ createdAt: new Date(), channel: (context.message['channel'] as string) || '', docType: '', handlerName: queryName, logType: 'error', errorMessage: 'executeQuery error', errorDetail: String(err) });
      return {};
    }
  };
}
