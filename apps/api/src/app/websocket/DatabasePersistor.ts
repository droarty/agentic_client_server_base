import { MongoClient } from 'mongodb';
import { OutboundMessage } from '@multiplayer-base/shared-types';
import { WorkflowContext, WorkflowLogEntry } from './WorkflowEngine';

interface DatabasePersistorDeps {
  mongoClient: MongoClient;
  dbReady: Promise<MongoClient>;
  logWorkflowStep: (entry: WorkflowLogEntry) => void;
}

export function createDatabasePersistor(deps: DatabasePersistorDeps) {
  const { mongoClient, dbReady, logWorkflowStep } = deps;

  return async function persistToDatabase(outbound: OutboundMessage, context: WorkflowContext): Promise<void> {
    await dbReady;
    const db = mongoClient.db();
    const rec = outbound as unknown as Record<string, unknown>;

    if (rec['type'] !== 'update-state') return;

    const userId = context.user?.['id'] as string | undefined;
    if (!userId) return;

    const actions = rec['actions'] as Array<Record<string, unknown>> | undefined;
    if (!actions?.length) return;

    const setOps: Record<string, unknown> = {};
    const pushOps: Record<string, unknown> = {};
    const pullOps: Record<string, unknown> = {};

    for (const action of actions) {
      const actionType = action['actionType'] as string;
      const path = action['path'] as string;
      const value = action['value'];
      const keys = action['keys'] as string[] | undefined;
      if (!path.startsWith('$state.')) continue;
      const mongoPath = path.slice(1);

      switch (actionType) {
        case 'update':
          setOps[mongoPath] = value;
          break;
        case 'merge':
          if (typeof value === 'object' && value !== null) {
            for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
              setOps[`${mongoPath}.${k}`] = v;
            }
          } else {
            setOps[mongoPath] = value;
          }
          break;
        case 'append': {
          const items = Array.isArray(value) ? value : [value];
          pushOps[mongoPath] = { $each: items };
          break;
        }
        case 'prepend': {
          const items = Array.isArray(value) ? value : [value];
          pushOps[mongoPath] = { $each: items, $position: 0 };
          break;
        }
        case 'upsert': {
          if (!keys?.length) { logWorkflowStep({ createdAt: new Date(), channel: outbound.channel, docType: '', handlerName: '', logType: 'error', errorMessage: 'persistToDatabase: upsert action missing keys array', errorDetail: action }); break; }
          const item = value as Record<string, unknown>;
          const fieldRef = `$${mongoPath}`;
          const matchCond = keys.length === 1
            ? { $eq: [`$$el.${keys[0]}`, item[keys[0]]] }
            : { $and: keys.map((k) => ({ $eq: [`$$el.${k}`, item[k]] })) };
          const inCond = keys.length === 1
            ? { $in: [item[keys[0]], { $map: { input: { $ifNull: [fieldRef, []] }, as: 'el', in: `$$el.${keys[0]}` } }] }
            : { $gt: [{ $size: { $filter: { input: { $ifNull: [fieldRef, []] }, as: 'el', cond: matchCond } } }, 0] };
          await db.collection('artifacts').updateOne(
            { currentChannelId: outbound.channel, userId },
            [{
              $set: {
                [mongoPath]: {
                  $cond: {
                    if: inCond,
                    then: { $map: { input: fieldRef, as: 'el', in: { $cond: { if: matchCond, then: item, else: '$$el' } } } },
                    else: { $concatArrays: [{ $ifNull: [fieldRef, []] }, [item]] },
                  },
                },
              },
            }] as any
          );
          break;
        }
        case 'remove': {
          if (!keys?.length) { logWorkflowStep({ createdAt: new Date(), channel: outbound.channel, docType: '', handlerName: '', logType: 'error', errorMessage: 'persistToDatabase: remove action missing keys array', errorDetail: action }); break; }
          const matcher = value as Record<string, unknown>;
          const pullMatcher: Record<string, unknown> = {};
          for (const k of keys) pullMatcher[k] = matcher[k];
          pullOps[mongoPath] = pullMatcher;
          break;
        }
        case 'update-in': {
          const findKey = action['findKey'] as string | undefined;
          const findValue = action['findValue'];
          const subPath = action['subPath'] as string | undefined;
          if (!findKey || !subPath) { logWorkflowStep({ createdAt: new Date(), channel: outbound.channel, docType: '', handlerName: '', logType: 'error', errorMessage: 'persistToDatabase: update-in action missing findKey or subPath', errorDetail: action }); break; }
          await db.collection('artifacts').updateOne(
            { currentChannelId: outbound.channel, userId },
            { $set: { [`${mongoPath}.$[elem].${subPath}`]: value } } as any,
            { arrayFilters: [{ [`elem.${findKey}`]: findValue }] }
          );
          break;
        }
        case 'slice': {
          const start = action['start'] as number | undefined;
          const end = action['end'] as number | undefined;
          if (start === undefined && end === undefined) break;
          const fieldRef = `$${mongoPath}`;
          const sliceExpr = end !== undefined
            ? { $slice: [fieldRef, start ?? 0, end] }
            : { $slice: [fieldRef, start] };
          await db.collection('artifacts').updateOne(
            { currentChannelId: outbound.channel, userId },
            [{ $set: { [mongoPath]: sliceExpr } }] as any
          );
          break;
        }
      }
    }

    const mongoUpdate: Record<string, unknown> = {};
    if (Object.keys(setOps).length) mongoUpdate['$set'] = setOps;
    if (Object.keys(pushOps).length) mongoUpdate['$push'] = pushOps;
    if (Object.keys(pullOps).length) mongoUpdate['$pull'] = pullOps;

    if (Object.keys(mongoUpdate).length) {
      await db.collection('artifacts').updateOne(
        { currentChannelId: outbound.channel, userId }, mongoUpdate as any
      );
    }
  };
}
