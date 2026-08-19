import * as path from 'path';
import * as fs from 'fs';
import { randomUUID } from 'crypto';
import { eq, and, ne, notInArray, inArray, isNull, desc, sql, type SQL } from 'drizzle-orm';
import {
  type Database,
  artifacts,
  channels,
  groups,
  memberships,
  membershipRoles,
  users,
  workflowConfigs,
  workflowLogs,
  artifactGroupPermissions,
  artifactUserPermissions,
} from '@agentic-client-server-base/db-schema';
import { WorkflowContext, WorkflowLogEntry } from './WorkflowEngine';

interface QueryExecutorDeps {
  db: Database;
  configDir: string;
  logWorkflowStep: (entry: WorkflowLogEntry) => void;
  invalidateWorkflowConfig?: (name: string) => void;
}

type ArtifactRow = typeof artifacts.$inferSelect;

// Types the workflow config JSON DSL never sets state on directly.
const SYSTEM_DOC_EXCLUSIONS = ['user-dashboard', 'group-dashboard', 'log-review'];

export function createQueryExecutor(deps: QueryExecutorDeps) {
  const { db, configDir, logWorkflowStep, invalidateWorkflowConfig } = deps;

  function bumpPatchVersion(version: string): string {
    const parts = version.split('.');
    const patch = parseInt(parts[2] ?? '0', 10);
    if (Number.isNaN(patch)) return `${version}-1`;
    parts[2] = String(patch + 1);
    return parts.join('.');
  }

  async function getChannelIdForArtifact(artifactId: string): Promise<string | null> {
    const [channelRow] = await db.select({ channelId: channels.channelId }).from(channels).where(eq(channels.artifactId, artifactId));
    return channelRow?.channelId ?? null;
  }

  async function getArtifactIdForChannel(channelId: string): Promise<string | null> {
    const [channelRow] = await db.select({ artifactId: channels.artifactId }).from(channels).where(eq(channels.channelId, channelId));
    return channelRow?.artifactId ?? null;
  }

  function toDocSummary(artifact: ArtifactRow, currentChannelId: string) {
    return {
      _id: artifact.id,
      name: artifact.name,
      type: artifact.type,
      userId: artifact.userId,
      parentId: artifact.parentId ?? undefined,
      currentChannelId,
      createdAt: artifact.createdAt,
      updatedAt: artifact.updatedAt,
    };
  }

  async function toFullDoc(artifact: ArtifactRow, currentChannelId: string) {
    const [groupPerms, userPerms] = await Promise.all([
      db.select().from(artifactGroupPermissions).where(eq(artifactGroupPermissions.artifactId, artifact.id)),
      db.select().from(artifactUserPermissions).where(eq(artifactUserPermissions.artifactId, artifact.id)),
    ]);
    return {
      _id: artifact.id,
      name: artifact.name,
      type: artifact.type,
      userId: artifact.userId,
      groupId: artifact.groupId ?? undefined,
      parentId: artifact.parentId ?? undefined,
      currentChannelId,
      permissions: groupPerms.map((p) => ({ groupId: p.groupId, access: p.access })),
      userPermissions: userPerms.map((p) => ({ userId: p.userId, access: p.access })),
      permissionManagerMode: artifact.permissionManagerMode,
      state: artifact.state ?? undefined,
      createdAt: artifact.createdAt,
      updatedAt: artifact.updatedAt,
    };
  }

  // The 5 queries that used to fetch artifacts then separately fetch matching
  // channels and join by artifactId in application code — now a single JOIN.
  async function listDocsWithChannels(whereClause: SQL) {
    const rows = await db
      .select({ artifact: artifacts, channelId: channels.channelId })
      .from(artifacts)
      .leftJoin(channels, eq(channels.artifactId, artifacts.id))
      .where(whereClause)
      .orderBy(desc(artifacts.createdAt));
    return rows.map(({ artifact, channelId }) => toDocSummary(artifact, channelId ?? ''));
  }

  async function membershipRolesFor(membershipId: string): Promise<string[]> {
    const rows = await db.select({ role: membershipRoles.role }).from(membershipRoles).where(eq(membershipRoles.membershipId, membershipId));
    return rows.map((r) => r.role);
  }

  async function callerHasAnyRole(groupId: string, userId: string, roles: ('admin' | 'owner')[]): Promise<boolean> {
    const [membership] = await db.select().from(memberships).where(and(eq(memberships.groupId, groupId), eq(memberships.userId, userId)));
    if (!membership) return false;
    const roleRows = await db
      .select()
      .from(membershipRoles)
      .where(and(eq(membershipRoles.membershipId, membership.id), inArray(membershipRoles.role, roles)));
    return roleRows.length > 0;
  }

  return async function executeQuery(queryName: string, context: WorkflowContext): Promise<Record<string, unknown>> {
    try {
      if (queryName === 'get-available-types') {
        const systemExclusions = new Set(['user-dashboard', 'log-review', 'group-dashboard', 'create-new-group-workflow', 'manage-members-workflow', 'browse-documents-workflow', 'create-new-document-workflow', 'workflow-builder']);
        const files = fs.readdirSync(configDir);
        const filesystemTypes = files
          .filter((f: string) => f.endsWith('.json'))
          .map((f: string) => f.replace('.json', ''))
          .filter((t: string) => !systemExclusions.has(t));
        const customConfigs = await db.select({ name: workflowConfigs.name }).from(workflowConfigs);
        const customTypes = customConfigs.map((c) => c.name);
        const availableTypes = [...new Set([...filesystemTypes, ...customTypes])];
        return { availableTypes };
      }

      if (queryName === 'get-user-documents') {
        const userId = context.user?.['id'] as string | undefined;
        if (!userId) return { documents: [] };
        const documents = await listDocsWithChannels(and(eq(artifacts.userId, userId), ne(artifacts.type, 'user-dashboard')));
        return { documents };
      }

      if (queryName === 'get-document') {
        const userId = context.user?.['id'] as string | undefined;
        if (!userId) return { document: null };
        const documentId = context.message['documentId'] as string | undefined;
        const channel = context.message['channel'] as string | undefined;
        const artifactId = documentId ?? (channel ? await getArtifactIdForChannel(channel) : undefined);
        if (!artifactId) return { document: null };
        const [artifact] = await db.select().from(artifacts).where(and(eq(artifacts.id, artifactId), eq(artifacts.userId, userId)));
        if (!artifact) return { document: null };
        const channelId = await getChannelIdForArtifact(artifact.id);
        return { document: await toFullDoc(artifact, channelId ?? '') };
      }

      if (queryName === 'get-document-summary') {
        const userId = context.user?.['id'] as string | undefined;
        if (!userId) return { document: null };
        const documentId = context.message['documentId'] as string | undefined;
        const channel = context.message['channel'] as string | undefined;
        const artifactId = documentId ?? (channel ? await getArtifactIdForChannel(channel) : undefined);
        if (!artifactId) return { document: null };
        const [artifact] = await db.select().from(artifacts).where(and(eq(artifacts.id, artifactId), eq(artifacts.userId, userId)));
        if (!artifact) return { document: null };
        const channelId = await getChannelIdForArtifact(artifact.id);
        return { document: toDocSummary(artifact, channelId ?? '') };
      }

      if (queryName === 'get-users') {
        const rows = await db.select({ id: users.id, email: users.email }).from(users);
        return { users: rows.map((u) => ({ _id: u.id, email: u.email })) };
      }

      if (queryName === 'create-workflow-builder-document') {
        const userId = context.user?.['id'] as string | undefined;
        const configPath = path.join(configDir, 'workflow-builder.json');
        const wfConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as { initialState?: Record<string, unknown> };
        const newChannelId = await db.transaction(async (tx) => {
          const [artifact] = await tx
            .insert(artifacts)
            .values({ name: 'New Workflow', type: 'workflow-builder', userId: userId!, state: wfConfig.initialState ?? {} })
            .returning();
          const [channel] = await tx
            .insert(channels)
            .values({ workflowType: 'workflow-builder', userId: userId!, artifactId: artifact.id })
            .returning();
          return channel.channelId;
        });
        return { channelId: newChannelId };
      }

      if (queryName === 'create-document') {
        const name = (context.message['name'] as string | undefined)?.trim();
        const type = (context.message['documentType'] as string | undefined) ?? 'configged-chat';
        const parentIdRaw = (context.message['parentId'] as string | undefined)?.trim();
        if (!name) return { document: null, documents: [] };
        const userId = context.user?.['id'] as string | undefined;

        const configPath = path.join(configDir, `${type}.json`);
        let initialState: Record<string, unknown> | undefined;
        if (fs.existsSync(configPath)) {
          const wfConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as { initialState?: Record<string, unknown> };
          initialState = wfConfig.initialState;
        } else {
          const [customConfig] = await db.select({ initialState: workflowConfigs.initialState }).from(workflowConfigs).where(eq(workflowConfigs.name, type));
          if (customConfig?.initialState) initialState = customConfig.initialState as Record<string, unknown>;
        }

        let parentId: string | undefined;
        if (parentIdRaw) {
          const [parentArtifact] = await db.select({ id: artifacts.id }).from(artifacts).where(eq(artifacts.id, parentIdRaw));
          if (!parentArtifact) return { document: null, documents: [] };
          parentId = parentArtifact.id;
        }

        const { newDoc, newChannelId } = await db.transaction(async (tx) => {
          const [artifact] = await tx
            .insert(artifacts)
            .values({
              name,
              type,
              userId: userId!,
              parentId,
              ...(initialState !== undefined ? { state: initialState } : {}),
            })
            .returning();
          const [channel] = await tx.insert(channels).values({ workflowType: type, userId: userId!, artifactId: artifact.id }).returning();
          return { newDoc: artifact, newChannelId: channel.channelId };
        });

        const documents = await listDocsWithChannels(and(eq(artifacts.userId, userId!), notInArray(artifacts.type, ['user-dashboard', 'log-review'])));
        return {
          document: toDocSummary(newDoc, newChannelId),
          documents,
        };
      }

      if (queryName === 'get-workflow-builder-context') {
        const channel = context.message['channel'] as string | undefined;
        const artifactId = channel ? await getArtifactIdForChannel(channel) : null;
        const [artifact] = artifactId ? await db.select({ state: artifacts.state }).from(artifacts).where(eq(artifacts.id, artifactId)) : [];
        const state = (artifact?.state as Record<string, unknown> | undefined) ?? {};
        return {
          text: context.message['text'],
          senderEmail: context.message['senderEmail'],
          plan: state['plan'] ?? '',
          draftConfig: state['draftConfig'] ?? null,
        };
      }

      if (queryName === 'publish-workflow-config') {
        const channel = context.message['channel'] as string | undefined;
        const artifactId = channel ? await getArtifactIdForChannel(channel) : null;
        const [artifact] = artifactId ? await db.select({ state: artifacts.state }).from(artifacts).where(eq(artifacts.id, artifactId)) : [];
        const draft = ((artifact?.state as Record<string, unknown> | undefined)?.['draftConfig']) as Record<string, unknown> | undefined;
        const name = draft?.['name'] as string | undefined;
        const handlers = draft?.['handlers'] as Record<string, unknown> | undefined;
        if (!draft || !name || !handlers) {
          return { type: 'workflow-publish-error', errorMessage: 'No valid draft to publish yet — the draft needs a name and handlers.' };
        }
        const userId = context.user?.['id'] as string | undefined;
        const displayName = (draft['displayName'] as string | undefined) ?? name;
        const initialState = (draft['initialState'] as Record<string, unknown> | undefined) ?? {};

        const [existing] = await db.select().from(workflowConfigs).where(eq(workflowConfigs.name, name));
        if (existing && existing.createdBy && existing.createdBy !== userId) {
          return { type: 'workflow-publish-error', errorMessage: `A workflow named "${name}" already exists and belongs to another user — choose a different name.` };
        }
        const nextVersion = existing ? bumpPatchVersion(existing.version) : '1.0.0';

        await db
          .insert(workflowConfigs)
          .values({ name, displayName, version: nextVersion, initialState, handlers, createdBy: userId })
          .onConflictDoUpdate({
            target: workflowConfigs.name,
            set: { displayName, version: nextVersion, initialState, handlers, createdBy: userId, updatedAt: new Date() },
          });
        invalidateWorkflowConfig?.(name);

        return { type: 'workflow-published', publishedName: name, publishedVersion: nextVersion };
      }

      async function buildTree(executionId: string, channel: string): Promise<unknown[]> {
        const entries = await db
          .select()
          .from(workflowLogs)
          .where(and(eq(workflowLogs.channel, channel), eq(workflowLogs.executionId, executionId), inArray(workflowLogs.logType, ['route', 'error', 'tool'])))
          .orderBy(workflowLogs.stepIndex, workflowLogs.createdAt);
        const routes = entries.filter((e) => e.logType !== 'tool');
        const toolsByStep = new Map<number, typeof entries>();
        for (const toolEntry of entries.filter((e) => e.logType === 'tool')) {
          const key = toolEntry.stepIndex ?? -1;
          const arr = toolsByStep.get(key) ?? [];
          arr.push(toolEntry);
          toolsByStep.set(key, arr);
        }
        const children: unknown[] = [];
        for (const route of routes) {
          const routeNode: Record<string, unknown> = {
            id: route.id,
            name: route.logType === 'error'
              ? `[${route.stepIndex ?? '?'}] error: ${route.errorMessage ?? ''}`
              : `[${route.stepIndex ?? '?'}] route: ${Array.isArray(route.route) ? (route.route as string[]).join(', ') : route.route}`,
            rawData: structuredClone(route),
            children: [],
          };
          for (const toolEntry of toolsByStep.get(route.stepIndex ?? -1) ?? []) {
            (routeNode.children as unknown[]).push({
              id: toolEntry.id,
              name: `tool: ${(toolEntry.message as Record<string, unknown> | undefined)?.['tool'] ?? '?'}`,
              rawData: structuredClone(toolEntry),
              children: [],
            });
          }
          const [subHandler] = await db
            .select()
            .from(workflowLogs)
            .where(and(eq(workflowLogs.channel, channel), eq(workflowLogs.parentExecutionId, executionId), eq(workflowLogs.stepIndex, route.stepIndex ?? -1), eq(workflowLogs.logType, 'handler')));
          if (subHandler) {
            const subChildren = await buildTree(subHandler.executionId!, channel);
            (routeNode.children as unknown[]).push({
              id: subHandler.id,
              name: `handler: ${subHandler.handlerName}`,
              rawData: structuredClone(subHandler),
              children: subChildren,
            });
          }
          children.push(routeNode);
        }
        return children;
      }

      if (queryName === 'get-channel-log-tree') {
        const userId = context.user?.['id'] as string | undefined;
        const targetChannelId = context.targetChannelId;
        if (!targetChannelId) return { treeData: [], artifactState: null };
        const [channelDoc] = await db.select().from(channels).where(eq(channels.channelId, targetChannelId));
        if (!channelDoc) return { treeData: [], artifactState: null };
        // Document-backed channels are owned via their artifact's userId; stateless channels
        // (no artifactId — e.g. workflow-builder, browse-documents-workflow) carry userId directly.
        const [artifact] = channelDoc.artifactId
          ? await db.select().from(artifacts).where(and(eq(artifacts.id, channelDoc.artifactId), eq(artifacts.userId, userId!)))
          : [];
        if (channelDoc.artifactId && !artifact) return { treeData: [], artifactState: null };
        if (!channelDoc.artifactId && channelDoc.userId !== userId) return { treeData: [], artifactState: null };
        const roots = await db
          .select()
          .from(workflowLogs)
          .where(and(eq(workflowLogs.channel, targetChannelId), isNull(workflowLogs.parentExecutionId), eq(workflowLogs.logType, 'handler')))
          .orderBy(desc(workflowLogs.createdAt));
        const treeData = await Promise.all(roots.map(async (root) => ({
          id: root.id,
          name: `handler: ${root.handlerName}`,
          rawData: structuredClone(root),
          children: await buildTree(root.executionId!, targetChannelId),
        })));
        return { treeData, artifactState: artifact?.state ?? null };
      }

      if (queryName === 'get-user-groups') {
        const userId = context.user?.['id'] as string | undefined;
        if (!userId) return { groups: [] };
        const membershipRows = await db.select({ groupId: memberships.groupId }).from(memberships).where(eq(memberships.userId, userId));
        const groupIds = membershipRows.map((m) => m.groupId);
        if (groupIds.length === 0) return { groups: [] };
        const rows = await db.select().from(groups).where(and(inArray(groups.id, groupIds), isNull(groups.parentGroupId)));
        return { groups: rows.map((g) => ({ _id: g.id, name: g.name, parentGroupId: g.parentGroupId ?? undefined, ancestors: g.ancestors })) };
      }

      if (queryName === 'get-subgroups') {
        const groupId = context.groupId;
        if (!groupId) return { groups: [] };
        const rows = await db.select().from(groups).where(eq(groups.parentGroupId, groupId));
        return { groups: rows.map((g) => ({ _id: g.id, name: g.name, parentGroupId: g.parentGroupId ?? undefined, ancestors: g.ancestors })) };
      }

      if (queryName === 'get-channel-document') {
        const channel = context.message['channel'] as string | undefined;
        if (!channel) return { document: null };
        const artifactId = await getArtifactIdForChannel(channel);
        if (!artifactId) return { document: null };
        const [artifact] = await db.select().from(artifacts).where(eq(artifacts.id, artifactId));
        return { document: artifact ? await toFullDoc(artifact, channel) : null };
      }

      if (queryName === 'get-or-create-workflow-channel') {
        const workflowType = (context.message['workflowType'] as string | undefined)?.trim();
        const userId = context.user?.['id'] as string | undefined;
        const groupId = context.groupId ?? (context.message['groupId'] as string | undefined);
        const callingChannel = context.message['channel'] as string | undefined;
        if (!workflowType || !userId) return { channelId: null };
        const whereClause = groupId
          ? and(eq(channels.workflowType, workflowType), eq(channels.userId, userId), eq(channels.groupId, groupId))
          : and(eq(channels.workflowType, workflowType), eq(channels.userId, userId), isNull(channels.groupId));
        let [channelDoc] = await db.select().from(channels).where(whereClause);
        if (!channelDoc) {
          [channelDoc] = await db
            .insert(channels)
            .values({ workflowType, userId, groupId: groupId ?? null, parentChannelId: callingChannel ?? null })
            .returning();
        }
        return { channelId: channelDoc?.channelId ?? null };
      }

      if (queryName === 'create-subgroup-with-permission') {
        const userId = context.user?.['id'] as string | undefined;
        const groupId = context.groupId;
        const groupName = (context.message['groupName'] as string | undefined)?.trim();
        if (!userId || !groupId || !groupName) return { newGroup: null, result: 'Missing required fields' };
        if (!(await callerHasAnyRole(groupId, userId, ['admin', 'owner']))) {
          return { newGroup: null, result: 'Insufficient permissions to create sub-groups in this group' };
        }
        const [parentGroup] = await db.select().from(groups).where(eq(groups.id, groupId));
        if (!parentGroup) return { newGroup: null, result: 'Parent group not found' };
        const ancestors = [...parentGroup.ancestors, groupId];
        const newGroup = await db.transaction(async (tx) => {
          const [group] = await tx.insert(groups).values({ name: groupName, parentGroupId: groupId, ancestors }).returning();
          const [membership] = await tx.insert(memberships).values({ userId, groupId: group.id }).returning();
          await tx.insert(membershipRoles).values({ membershipId: membership.id, role: 'owner' });
          return group;
        });
        return { newGroup: { _id: newGroup.id, name: newGroup.name }, result: `Group '${groupName}' created!` };
      }

      if (queryName === 'get-group-members') {
        const userId = context.user?.['id'] as string | undefined;
        const groupId = context.groupId;
        if (!userId || !groupId) return { members: [], isAdmin: false };
        const isAdmin = await callerHasAnyRole(groupId, userId, ['admin', 'owner']);
        const rows = await db
          .select({ userId: memberships.userId, membershipId: memberships.id, email: users.email, role: membershipRoles.role })
          .from(memberships)
          .innerJoin(users, eq(users.id, memberships.userId))
          .leftJoin(membershipRoles, eq(membershipRoles.membershipId, memberships.id))
          .where(eq(memberships.groupId, groupId));
        const byUser = new Map<string, { _id: string; email: string; roles: string[] }>();
        for (const row of rows) {
          const existing = byUser.get(row.userId);
          if (existing) {
            if (row.role) existing.roles.push(row.role);
          } else {
            byUser.set(row.userId, { _id: row.userId, email: row.email, roles: row.role ? [row.role] : [] });
          }
        }
        return { members: [...byUser.values()], isAdmin };
      }

      if (queryName === 'add-group-member') {
        const userId = context.user?.['id'] as string | undefined;
        const groupId = context.groupId;
        const email = (context.message['email'] as string | undefined)?.trim().toLowerCase();
        if (!userId || !groupId || !email) return { result: 'Missing required fields' };
        if (!(await callerHasAnyRole(groupId, userId, ['admin', 'owner']))) {
          return { result: 'Insufficient permissions to add members' };
        }
        const [targetUser] = await db.select().from(users).where(eq(users.email, email));
        if (!targetUser) return { result: `No user found with email ${email}` };
        const [existing] = await db.select().from(memberships).where(and(eq(memberships.userId, targetUser.id), eq(memberships.groupId, groupId)));
        if (existing) return { result: `${email} is already a member` };
        const [membership] = await db.insert(memberships).values({ userId: targetUser.id, groupId }).returning();
        await db.insert(membershipRoles).values({ membershipId: membership.id, role: 'member' });
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
        if (!(await callerHasAnyRole(groupId, userId, ['admin', 'owner']))) {
          return { result: 'Insufficient permissions to change member roles' };
        }
        const [targetMembership] = await db.select().from(memberships).where(and(eq(memberships.userId, targetUserId), eq(memberships.groupId, groupId)));
        if (!targetMembership) return { result: 'Membership not found' };
        const targetRoles = await membershipRolesFor(targetMembership.id);
        if (targetRoles.includes('owner')) {
          const [{ count }] = await db
            .select({ count: sql<number>`count(distinct ${memberships.id})` })
            .from(memberships)
            .innerJoin(membershipRoles, and(eq(membershipRoles.membershipId, memberships.id), eq(membershipRoles.role, 'owner')))
            .where(eq(memberships.groupId, groupId));
          if (Number(count) <= 1) return { result: 'Cannot change role of the last remaining owner' };
        }
        await db.transaction(async (tx) => {
          await tx.delete(membershipRoles).where(eq(membershipRoles.membershipId, targetMembership.id));
          await tx.insert(membershipRoles).values({ membershipId: targetMembership.id, role: newRole as 'admin' | 'member' });
        });
        return { result: 'Role updated' };
      }

      if (queryName === 'remove-group-member') {
        const userId = context.user?.['id'] as string | undefined;
        const groupId = context.groupId;
        const targetUserId = context.message['_id'] as string | undefined;
        if (!userId || !groupId || !targetUserId) return { result: 'Missing required fields' };
        if (!(await callerHasAnyRole(groupId, userId, ['admin', 'owner']))) {
          return { result: 'Insufficient permissions to remove members' };
        }
        const [targetMembership] = await db.select().from(memberships).where(and(eq(memberships.userId, targetUserId), eq(memberships.groupId, groupId)));
        if (!targetMembership) return { result: 'Membership not found' };
        const targetRoles = await membershipRolesFor(targetMembership.id);
        if (targetRoles.includes('owner')) {
          const [{ count }] = await db
            .select({ count: sql<number>`count(distinct ${memberships.id})` })
            .from(memberships)
            .innerJoin(membershipRoles, and(eq(membershipRoles.membershipId, memberships.id), eq(membershipRoles.role, 'owner')))
            .where(eq(memberships.groupId, groupId));
          if (Number(count) <= 1) return { result: 'Cannot remove the last remaining owner' };
        }
        // membership_roles rows cascade-delete via their FK to memberships.
        await db.delete(memberships).where(and(eq(memberships.userId, targetUserId), eq(memberships.groupId, groupId)));
        return { result: 'Member removed' };
      }

      if (queryName === 'get-recent-user-documents') {
        const userId = context.user?.['id'] as string | undefined;
        if (!userId) return { documents: [] };
        const config = context.state?.['config'] as Record<string, unknown> | undefined;
        const limit = typeof config?.['recentDocumentLimit'] === 'number' ? config['recentDocumentLimit'] : 10;
        const rows = await db
          .select({ artifact: artifacts, channelId: channels.channelId })
          .from(artifacts)
          .leftJoin(channels, eq(channels.artifactId, artifacts.id))
          .where(and(eq(artifacts.userId, userId), notInArray(artifacts.type, SYSTEM_DOC_EXCLUSIONS)))
          .orderBy(desc(artifacts.createdAt))
          .limit(limit);
        return { documents: rows.map(({ artifact, channelId }) => toDocSummary(artifact, channelId ?? '')) };
      }

      if (queryName === 'get-group-documents') {
        const userId = context.user?.['id'] as string | undefined;
        const groupId = context.groupId;
        if (!userId) return { documents: [] };
        const scopeClause = groupId ? eq(artifacts.groupId, groupId) : isNull(artifacts.groupId);
        const documents = await listDocsWithChannels(
          and(
            eq(artifacts.userId, userId),
            scopeClause,
            notInArray(artifacts.type, [...SYSTEM_DOC_EXCLUSIONS, 'create-new-group-workflow', 'manage-members-workflow', 'browse-documents-workflow'])
          )
        );
        return { documents };
      }

      if (queryName === 'get-child-documents') {
        const userId = context.user?.['id'] as string | undefined;
        const parentIdRaw = context.message['parentId'] as string | undefined;
        if (!userId || !parentIdRaw) return { documents: [] };
        const documents = await listDocsWithChannels(and(eq(artifacts.parentId, parentIdRaw), eq(artifacts.userId, userId)));
        return { documents };
      }

      if (queryName === 'rename-artifact') {
        const userId = context.user?.['id'] as string | undefined;
        const documentId = context.message['_id'] as string | undefined;
        const name = (context.message['name'] as string | undefined)?.trim();
        if (!userId || !documentId || !name) return { result: 'Missing required fields' };
        const [artifact] = await db.select().from(artifacts).where(eq(artifacts.id, documentId));
        if (!artifact) return { result: 'Document not found' };
        if (artifact.userId !== userId) return { result: 'Insufficient permissions to rename this document' };
        await db.update(artifacts).set({ name, updatedAt: new Date() }).where(eq(artifacts.id, documentId));
        return { result: `Renamed to "${name}"` };
      }

      if (queryName === 'delete-artifact') {
        const userId = context.user?.['id'] as string | undefined;
        const documentId = context.message['_id'] as string | undefined;
        if (!userId || !documentId) return { result: 'Missing required fields' };
        const [artifact] = await db.select().from(artifacts).where(eq(artifacts.id, documentId));
        if (!artifact) return { result: 'Document not found' };
        if (artifact.userId !== userId) return { result: 'Insufficient permissions to delete this document' };
        // channels.artifact_id -> artifacts.id is ON DELETE CASCADE, so the
        // matching channel is removed automatically — no separate delete needed.
        await db.delete(artifacts).where(eq(artifacts.id, documentId));
        return { result: 'Document deleted' };
      }

      return {};
    } catch (err) {
      logWorkflowStep({ createdAt: new Date(), channel: (context.message['channel'] as string) || '', docType: '', handlerName: queryName, logType: 'error', errorMessage: 'executeQuery error', errorDetail: String(err) });
      return {};
    }
  };
}
