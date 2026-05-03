import mongoose, { Document, Schema } from 'mongoose';
import { randomUUID } from 'crypto';
import { OutboundMessage } from '@multiplayer-base/shared-types';

export interface IChatDocument extends Document {
  name: string;
  type: 'chat' | 'user-dashboard' | 'configged-chat';
  userId?: string;
  currentChannelId: string;
  messages: OutboundMessage[];
  state?: Record<string, unknown>;
  users?: unknown[];
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

const chatDocumentSchema = new Schema<IChatDocument>(
  {
    name: { type: String, required: true, trim: true },
    type: { type: String, enum: ['chat', 'user-dashboard', 'configged-chat'], default: 'chat' },
    userId: { type: String },
    currentChannelId: { type: String, default: () => randomUUID() },
    messages: { type: [outboundMessageSchema], default: [] },
    state: { type: Schema.Types.Mixed, default: undefined },
    users: { type: [Schema.Types.Mixed], default: undefined },
  },
  { timestamps: true }
);

export const ChatDocumentModel = mongoose.model<IChatDocument>('ChatDocument', chatDocumentSchema);
