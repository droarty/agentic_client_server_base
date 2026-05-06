import mongoose, { Document, Schema, Types } from 'mongoose';

export type GroupRole = 'owner' | 'admin' | 'member';

export interface IMembership extends Document {
  userId: Types.ObjectId;
  groupId: Types.ObjectId;
  roles: GroupRole[];
  joinedAt: Date;
}

const membershipSchema = new Schema<IMembership>({
  userId:  { type: Schema.Types.ObjectId, ref: 'User',  required: true },
  groupId: { type: Schema.Types.ObjectId, ref: 'Group', required: true },
  roles:   { type: [String], enum: ['owner', 'admin', 'member'], default: ['member'] },
  joinedAt: { type: Date, default: Date.now },
});

membershipSchema.index({ userId: 1 });
membershipSchema.index({ groupId: 1 });
membershipSchema.index({ userId: 1, groupId: 1 }, { unique: true });

export const Membership = mongoose.model<IMembership>('Membership', membershipSchema);
