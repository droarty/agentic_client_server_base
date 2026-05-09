import mongoose, { Document, Schema } from 'mongoose';
import { randomUUID } from 'crypto';
import { OutboundMessage } from '@multiplayer-base/shared-types';

export interface IArtifact extends Document {
  name: string;
  type: 'user-dashboard' | 'configged-chat';
  userId?: string;
  currentChannelId: string;
  messages: OutboundMessage[];
  state?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const outboundMessageSchema = new Schema(
  {
    id: String,
    type: String,
    from: String,
    to: String,
    channel: String,
    timestamp: String,
    authorEmail: String,
    text: String,
    color: String,
  },
  { _id: false }
);

const artifactSchema = new Schema<IArtifact>(
  {
    name: { type: String, required: true, trim: true },
    type: { type: String, enum: ['user-dashboard', 'configged-chat'], default: 'configged-chat' },
    userId: { type: String },
    currentChannelId: { type: String, default: () => randomUUID() },
    messages: { type: [outboundMessageSchema], default: [] },
    state: { type: Schema.Types.Mixed, default: undefined },
  },
  { timestamps: true }
);

export const ArtifactModel = mongoose.model<IArtifact>('Artifact', artifactSchema);
