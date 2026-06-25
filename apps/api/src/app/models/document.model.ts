import mongoose, { Document, Schema } from 'mongoose';
import { randomUUID } from 'crypto';

export interface IArtifact extends Document {
  name: string;
  type: string;
  userId?: string;
  currentChannelId: string;
  state?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const artifactSchema = new Schema<IArtifact>(
  {
    name: { type: String, required: true, trim: true },
    type: { type: String, required: true },
    userId: { type: String },
    currentChannelId: { type: String, default: () => randomUUID() },
    state: { type: Schema.Types.Mixed, default: undefined },
  },
  { timestamps: true }
);

export const ArtifactModel = mongoose.model<IArtifact>('Artifact', artifactSchema);
