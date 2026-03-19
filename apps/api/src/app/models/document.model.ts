import mongoose, { Document, Schema } from 'mongoose';
import { randomUUID } from 'crypto';
import { OutboundMessage } from '@multiplayer-base/shared-types';

export interface IChatDocument extends Document {
  name: string;
  type: 'chat';
  currentChannelId: string;
  messages: OutboundMessage[];
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
    type: { type: String, enum: ['chat'], default: 'chat' },
    currentChannelId: { type: String, default: () => randomUUID() },
    messages: { type: [outboundMessageSchema], default: [] },
  },
  { timestamps: true }
);

export const ChatDocumentModel = mongoose.model<IChatDocument>('ChatDocument', chatDocumentSchema);
