import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IGroup extends Document {
  name: string;
  parentGroupId?: Types.ObjectId;
  ancestors: Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const groupSchema = new Schema<IGroup>(
  {
    name: { type: String, required: true, trim: true },
    parentGroupId: { type: Schema.Types.ObjectId, ref: 'Group', default: null },
    ancestors: { type: [Schema.Types.ObjectId], ref: 'Group', default: [] },
  },
  { timestamps: true }
);

groupSchema.index({ ancestors: 1 });

export const Group = mongoose.model<IGroup>('Group', groupSchema);
