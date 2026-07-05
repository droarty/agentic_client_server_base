import mongoose, { Document, Schema, Types } from 'mongoose';
import { randomUUID } from 'crypto';

export interface IChannel extends Document {
  channelId: string;
  workflowType: string;
  userId: string;
  artifactId?: Types.ObjectId;
  groupId?: Types.ObjectId;
  parentChannelId?: string;
  responseHandler?: string;
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
    parentChannelId: { type: String },
    responseHandler: { type: String },
  },
  { timestamps: true }
);

channelSchema.index({ channelId: 1 }, { unique: true });
channelSchema.index({ artifactId: 1 }, { unique: true, sparse: true });
channelSchema.index({ workflowType: 1, userId: 1, groupId: 1 }, { unique: true, sparse: true });

export const ChannelModel = mongoose.model<IChannel>('Channel', channelSchema);
