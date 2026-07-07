import mongoose, { Document, Schema, Types } from 'mongoose';
import { randomUUID } from 'crypto';

export interface IChannel extends Document {
  channelId: string;
  workflowType: string;
  userId: string;
  artifactId?: Types.ObjectId;
  groupId?: Types.ObjectId;
  targetArtifactId?: Types.ObjectId;
  parentChannelId?: string;
  responseHandler?: string;
  isSessionChannel?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const channelSchema = new Schema<IChannel>(
  {
    channelId: { type: String, required: true, default: () => randomUUID() },
    workflowType: { type: String, required: true },
    userId: { type: String, required: true },
    artifactId: { type: Schema.Types.ObjectId, ref: 'Artifact' },
    groupId: { type: Schema.Types.ObjectId, ref: 'Group' },
    // The artifact a stateless session channel is *about* (e.g. log-review reviewing another
    // document's logs) — distinct from artifactId, which means "this channel's own backing
    // document". Kept separate so the artifactId unique-sparse index (one channel per document)
    // isn't violated when multiple users review the same target artifact.
    targetArtifactId: { type: Schema.Types.ObjectId, ref: 'Artifact' },
    parentChannelId: { type: String },
    responseHandler: { type: String },
    // Set only on stateless workflow-session channels (see getOrCreateWorkflowSession), never
    // on document-backed channels. Exists purely so the index below can be scoped to session
    // channels via partialFilterExpression — MongoDB partial indexes don't support $exists:false,
    // so an "absent artifactId" condition can't be expressed directly.
    isSessionChannel: { type: Boolean },
  },
  { timestamps: true }
);

channelSchema.index({ channelId: 1 }, { unique: true });
channelSchema.index({ artifactId: 1 }, { unique: true, sparse: true });
// Only applies to stateless workflow-session channels, which are looked up by
// { workflowType, userId, groupId, targetArtifactId } and reused rather than duplicated.
// Document-backed channels must not be constrained by this — otherwise creating two documents
// of the same type for the same user (and group) would collide. targetArtifactId is included
// so reviewing two different artifacts (e.g. log-review) doesn't collide into one channel.
channelSchema.index(
  { workflowType: 1, userId: 1, groupId: 1, targetArtifactId: 1 },
  { unique: true, partialFilterExpression: { isSessionChannel: true } }
);

export const ChannelModel = mongoose.model<IChannel>('Channel', channelSchema);
