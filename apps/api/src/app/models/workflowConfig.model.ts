import mongoose, { Document, Schema } from 'mongoose';

export interface IWorkflowConfig extends Document {
  name: string;
  displayName: string;
  version: string;
  initialState: Record<string, unknown>;
  handlers: Record<string, unknown>;
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

const workflowConfigSchema = new Schema<IWorkflowConfig>(
  {
    name: { type: String, required: true, unique: true, trim: true },
    displayName: { type: String, required: true, trim: true },
    version: { type: String, required: true },
    initialState: { type: Schema.Types.Mixed, default: {} },
    handlers: { type: Schema.Types.Mixed, required: true },
    createdBy: { type: String },
  },
  { timestamps: true }
);

export const WorkflowConfigModel = mongoose.model<IWorkflowConfig>('WorkflowConfig', workflowConfigSchema);
