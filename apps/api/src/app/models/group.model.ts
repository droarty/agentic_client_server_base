import mongoose, { Document, Schema } from 'mongoose';

export interface IGroup extends Document {
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

const groupSchema = new Schema<IGroup>(
  {
    name: { type: String, required: true, trim: true },
  },
  { timestamps: true }
);

export const Group = mongoose.model<IGroup>('Group', groupSchema);
