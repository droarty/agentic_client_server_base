import { sql, eq } from 'drizzle-orm';
import { artifacts, channels, toPgTextArray, type Database } from '@agentic-client-server-base/db-schema';
import { OutboundMessage } from '@agentic-client-server-base/shared-types';
import { WorkflowContext, WorkflowLogEntry } from './WorkflowEngine';
import { ACCESS_RANK } from '@agentic-client-server-base/access-control';

interface DatabasePersistorDeps {
  db: Database;
  logWorkflowStep: (entry: WorkflowLogEntry) => void;
}

// coalesce(state, '{}') everywhere below — jsonb_set/most jsonb operators are
// strict (NULL in, NULL out), and artifacts.state is nullable, so a bare
// `state` reference would silently wipe the whole column on a doc that has
// never had state written yet.
const STATE_BASE = sql`coalesce(${artifacts.state}, '{}'::jsonb)`;

export function createDatabasePersistor(deps: DatabasePersistorDeps) {
  const { db, logWorkflowStep } = deps;

  async function getArtifactId(channel: string): Promise<string | null> {
    const [channelRow] = await db.select({ artifactId: channels.artifactId }).from(channels).where(eq(channels.channelId, channel));
    return channelRow?.artifactId ?? null;
  }

  return async function persistToDatabase(outbound: OutboundMessage, context: WorkflowContext): Promise<void> {
    const rec = outbound as unknown as Record<string, unknown>;

    if (rec['type'] !== 'update-state') return;

    const userId = context.user?.['id'] as string | undefined;
    if (!userId) return;

    if (ACCESS_RANK[context.permissionLevel ?? 'none'] < ACCESS_RANK['write']) {
      logWorkflowStep({ createdAt: new Date(), channel: outbound.channel, docType: '', handlerName: '', logType: 'error', errorMessage: `persistToDatabase: write access denied for user ${userId}` });
      return;
    }

    const actions = rec['actions'] as Array<Record<string, unknown>> | undefined;
    if (!actions?.length) return;

    const artifactId = await getArtifactId(outbound.channel);
    if (!artifactId) return;

    // Whole invocation wrapped in one transaction, and every action applied in
    // the order it appears — the old Mongo version batched the 5 simple action
    // types into one deferred update while upsert/update-in/slice each fired
    // immediately mid-loop, so a message mixing simple and complex actions on
    // the same path could apply out of order. This fixes that as a side effect
    // of the port, not just an atomicity improvement.
    await db.transaction(async (tx) => {
      for (const action of actions) {
        const actionType = action['actionType'] as string;
        const path = action['path'] as string;
        const value = action['value'];
        const keys = action['keys'] as string[] | undefined;
        if (!path.startsWith('$state.')) continue;
        // '$state.items' -> ['items'] (path within the `state` column itself)
        const jsonPath = toPgTextArray(path.slice(7).split('.'));

        switch (actionType) {
          case 'update': {
            await tx.update(artifacts).set({
              state: sql`jsonb_set(${STATE_BASE}, ${jsonPath}::text[], ${JSON.stringify(value)}::jsonb, true)`,
            }).where(eq(artifacts.id, artifactId));
            break;
          }
          case 'merge': {
            if (typeof value === 'object' && value !== null) {
              await tx.update(artifacts).set({
                state: sql`jsonb_set(${STATE_BASE}, ${jsonPath}::text[], coalesce(${STATE_BASE} #> ${jsonPath}::text[], '{}'::jsonb) || ${JSON.stringify(value)}::jsonb, true)`,
              }).where(eq(artifacts.id, artifactId));
            } else {
              await tx.update(artifacts).set({
                state: sql`jsonb_set(${STATE_BASE}, ${jsonPath}::text[], ${JSON.stringify(value)}::jsonb, true)`,
              }).where(eq(artifacts.id, artifactId));
            }
            break;
          }
          case 'append': {
            const items = Array.isArray(value) ? value : [value];
            await tx.update(artifacts).set({
              state: sql`jsonb_set(${STATE_BASE}, ${jsonPath}::text[], coalesce(${STATE_BASE} #> ${jsonPath}::text[], '[]'::jsonb) || ${JSON.stringify(items)}::jsonb, true)`,
            }).where(eq(artifacts.id, artifactId));
            break;
          }
          case 'prepend': {
            const items = Array.isArray(value) ? value : [value];
            await tx.update(artifacts).set({
              state: sql`jsonb_set(${STATE_BASE}, ${jsonPath}::text[], ${JSON.stringify(items)}::jsonb || coalesce(${STATE_BASE} #> ${jsonPath}::text[], '[]'::jsonb), true)`,
            }).where(eq(artifacts.id, artifactId));
            break;
          }
          case 'upsert': {
            if (!keys?.length) { logWorkflowStep({ createdAt: new Date(), channel: outbound.channel, docType: '', handlerName: '', logType: 'error', errorMessage: 'persistToDatabase: upsert action missing keys array', errorDetail: action }); break; }
            await tx.update(artifacts).set({
              state: sql`jsonb_array_upsert(${STATE_BASE}, ${jsonPath}::text[], ${toPgTextArray(keys)}::text[], ${JSON.stringify(value)}::jsonb)`,
            }).where(eq(artifacts.id, artifactId));
            break;
          }
          case 'remove': {
            if (!keys?.length) { logWorkflowStep({ createdAt: new Date(), channel: outbound.channel, docType: '', handlerName: '', logType: 'error', errorMessage: 'persistToDatabase: remove action missing keys array', errorDetail: action }); break; }
            await tx.update(artifacts).set({
              state: sql`jsonb_array_remove_by_keys(${STATE_BASE}, ${jsonPath}::text[], ${toPgTextArray(keys)}::text[], ${JSON.stringify(value)}::jsonb)`,
            }).where(eq(artifacts.id, artifactId));
            break;
          }
          case 'update-in': {
            const findKey = action['findKey'] as string | undefined;
            const findValue = action['findValue'];
            const subPath = action['subPath'] as string | undefined;
            if (!findKey || !subPath) { logWorkflowStep({ createdAt: new Date(), channel: outbound.channel, docType: '', handlerName: '', logType: 'error', errorMessage: 'persistToDatabase: update-in action missing findKey or subPath', errorDetail: action }); break; }
            await tx.update(artifacts).set({
              state: sql`jsonb_array_update_in(${STATE_BASE}, ${jsonPath}::text[], ${findKey}, ${String(findValue)}, ${toPgTextArray([subPath])}::text[], ${JSON.stringify(value)}::jsonb)`,
            }).where(eq(artifacts.id, artifactId));
            break;
          }
          case 'slice': {
            const start = action['start'] as number | undefined;
            const end = action['end'] as number | undefined;
            if (start === undefined && end === undefined) break;
            await tx.update(artifacts).set({
              state: sql`jsonb_array_slice(${STATE_BASE}, ${jsonPath}::text[], ${start ?? 0}, ${end ?? null})`,
            }).where(eq(artifacts.id, artifactId));
            break;
          }
        }
      }
    });
  };
}
