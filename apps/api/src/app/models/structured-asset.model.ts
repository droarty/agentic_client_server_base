import mongoose, { Document, Schema } from 'mongoose';

export interface IStructuredAsset extends Document {
  name: string;
  category: string;
  assetVersion: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schema: any;
  schemaDescription: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any[];
  recordCount: number;
  sourceFileName: string;
  sourceDocumentId: string;
  createdAt: Date;
  updatedAt: Date;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const structuredAssetSchema = new Schema<IStructuredAsset>(
  {
    name: { type: String, required: true, trim: true },
    category: { type: String, required: true, trim: true },
    assetVersion: { type: Number, required: true, default: 1 },
    schema: { type: Schema.Types.Mixed, required: true },
    schemaDescription: { type: String, default: '' },
    data: { type: Array, required: true, default: [] },
    recordCount: { type: Number, required: true, default: 0 },
    sourceFileName: { type: String, default: '' },
    sourceDocumentId: { type: String, default: '' },
  } as any,
  { timestamps: true }
);

structuredAssetSchema.index({ name: 1, category: 1, assetVersion: 1 }, { unique: true });
structuredAssetSchema.index({ category: 1 });

export const StructuredAssetModel = mongoose.model<IStructuredAsset>('StructuredAsset', structuredAssetSchema);
