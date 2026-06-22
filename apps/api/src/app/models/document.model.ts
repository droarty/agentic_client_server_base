import mongoose, { Document, Schema } from 'mongoose';
import { randomUUID } from 'crypto';

export interface IArtifact extends Document {
  name: string;
  type: 'user-dashboard' | 'configged-chat' | 'brazil_vs_morocco' | 'mid-sized-structured-asset-creator';
  userId?: string;
  currentChannelId: string;
  state?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const artifactSchema = new Schema<IArtifact>(
  {
    name: { type: String, required: true, trim: true },
    type: { type: String, enum: ['user-dashboard', 'configged-chat', 'brazil_vs_morocco', 'mid-sized-structured-asset-creator'], default: 'configged-chat' },
    userId: { type: String },
    currentChannelId: { type: String, default: () => randomUUID() },
    state: { type: Schema.Types.Mixed, default: undefined },
  },
  { timestamps: true }
);

export const ArtifactModel = mongoose.model<IArtifact>('Artifact', artifactSchema);
