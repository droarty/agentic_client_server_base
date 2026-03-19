import mongoose, { Document, Schema } from 'mongoose';
import { randomUUID } from 'crypto';

export interface IChatDocument extends Document {
  name: string;
  type: 'chat';
  currentChannelId: string;
  createdAt: Date;
  updatedAt: Date;
}

const chatDocumentSchema = new Schema<IChatDocument>(
  {
    name: { type: String, required: true, trim: true },
    type: { type: String, enum: ['chat'], default: 'chat' },
    currentChannelId: { type: String, default: () => randomUUID() },
  },
  { timestamps: true }
);

export const ChatDocumentModel = mongoose.model<IChatDocument>('ChatDocument', chatDocumentSchema);
