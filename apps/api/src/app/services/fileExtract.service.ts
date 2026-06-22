import Anthropic, { toFile } from '@anthropic-ai/sdk';
import type { BetaRequestDocumentBlock, BetaMessageParam } from '@anthropic-ai/sdk/resources/beta/messages/messages';

const FILES_BETA = 'files-api-2025-04-14' as const;

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

function fileDocBlock(fileId: string): BetaRequestDocumentBlock {
  return {
    type: 'document',
    source: { type: 'file', file_id: fileId },
  } as BetaRequestDocumentBlock;
}

class FileExtractService {
  private getClient(): Anthropic {
    return new Anthropic({ apiKey: process.env['ANTHROPIC_API_KEY'] });
  }

  async uploadToFilesApi(buffer: Buffer, fileName: string): Promise<string> {
    const client = this.getClient();
    const file = await client.beta.files.upload(
      { file: await toFile(buffer, fileName, { type: 'application/pdf' }) },
      { headers: { 'anthropic-beta': FILES_BETA } }
    );
    return file.id;
  }

  async fileChat(params: {
    fileId: string;
    chatHistory: ChatMessage[];
    userMessage: string;
    systemPrompt: string;
    model?: string;
    maxTokens?: number;
  }): Promise<string> {
    const { fileId, chatHistory, userMessage, systemPrompt, model, maxTokens } = params;
    const client = this.getClient();

    const messages: BetaMessageParam[] = [];

    if (chatHistory.length === 0) {
      messages.push({
        role: 'user',
        content: [
          fileDocBlock(fileId),
          { type: 'text', text: userMessage },
        ],
      });
    } else {
      const [firstHistory, ...rest] = chatHistory;
      messages.push({
        role: 'user',
        content: [
          fileDocBlock(fileId),
          { type: 'text', text: firstHistory.content },
        ],
      });
      for (const msg of rest) {
        messages.push({ role: msg.role, content: msg.content });
      }
      messages.push({ role: 'user', content: userMessage });
    }

    const response = await client.beta.messages.create({
      model: model ?? 'claude-opus-4-8',
      max_tokens: maxTokens ?? 2048,
      system: systemPrompt,
      messages,
      betas: [FILES_BETA],
    });

    const block = response.content[0];
    if (block.type !== 'text') throw new Error('Unexpected non-text response from fileChat');
    return block.text.trim();
  }

  async extractFromFile(params: {
    fileId: string;
    schema: Record<string, unknown>;
    systemPrompt: string;
    model?: string;
    maxTokens?: number;
  }): Promise<string> {
    const { fileId, schema, systemPrompt, model, maxTokens } = params;
    const client = this.getClient();

    const schemaText = JSON.stringify(schema, null, 2);
    const response = await client.beta.messages.create({
      model: model ?? 'claude-opus-4-8',
      max_tokens: maxTokens ?? 16000,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: [
            fileDocBlock(fileId),
            { type: 'text', text: `Extract all records using this schema:\n\n${schemaText}` },
          ],
        },
      ],
      betas: [FILES_BETA],
    });

    const block = response.content[0];
    if (block.type !== 'text') throw new Error('Unexpected non-text response from extractFromFile');
    return block.text.trim();
  }

  async deleteFile(fileId: string): Promise<void> {
    const client = this.getClient();
    await client.beta.files.delete(fileId, undefined, { headers: { 'anthropic-beta': FILES_BETA } });
  }
}

export const fileExtractService = new FileExtractService();
