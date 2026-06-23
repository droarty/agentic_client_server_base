export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface SchemaField {
  name: string;
  type: string;
  description?: string;
  required?: boolean;
}

export interface StructuredAssetSchema {
  fields: SchemaField[];
  description: string;
}

export interface StructuredAsset {
  _id: string;
  name: string;
  category: string;
  assetVersion: number;
  schema: StructuredAssetSchema;
  schemaDescription: string;
  data: Record<string, unknown>[];
  recordCount: number;
  sourceFileName: string;
  sourceDocumentId: string;
  createdAt: string;
  updatedAt: string;
}

export interface StructuredAssetSummary {
  _id: string;
  name: string;
  category: string;
  assetVersion: number;
  recordCount: number;
  sourceFileName: string;
  createdAt: string;
}
