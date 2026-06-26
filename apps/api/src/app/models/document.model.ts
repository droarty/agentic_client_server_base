import mongoose, { Document, Schema, Types } from 'mongoose';
import { randomUUID } from 'crypto';
import type { ArtifactAccess } from '@agentic-client-server-base/shared-types';

export interface IArtifactPermission {
  groupId: Types.ObjectId;
  access: ArtifactAccess;
}

export interface IArtifact extends Document {
  name: string;
  type: string;
  userId?: string;
  groupId?: Types.ObjectId;
  permissions: IArtifactPermission[];
  currentChannelId: string;
  state?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const artifactPermissionSchema = new Schema<IArtifactPermission>(
  {
    groupId: { type: Schema.Types.ObjectId, ref: 'Group', required: true },
    access: { type: String, enum: ['read', 'write', 'admin'], required: true },
  },
  { _id: false }
);

const artifactSchema = new Schema<IArtifact>(
  {
    name: { type: String, required: true, trim: true },
    type: { type: String, required: true },
    userId: { type: String },
    groupId: { type: Schema.Types.ObjectId, ref: 'Group' },
    permissions: { type: [artifactPermissionSchema], default: [] },
    currentChannelId: { type: String, default: () => randomUUID() },
    state: { type: Schema.Types.Mixed, default: undefined },
  },
  { timestamps: true }
);

artifactSchema.index({ 'permissions.groupId': 1 });
artifactSchema.index({ groupId: 1 });

export const ArtifactModel = mongoose.model<IArtifact>('Artifact', artifactSchema);
