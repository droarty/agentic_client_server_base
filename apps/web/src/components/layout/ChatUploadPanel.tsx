import { useState, useRef, useEffect, FormEvent, KeyboardEvent } from 'react';
import { Button } from '@/components/ui/button';

interface ChatMsg {
  role: 'user' | 'assistant';
  content: string;
}

interface Props {
  channelId?: string;
  chatHistory?: ChatMsg[];
  uploadStatus?: string;
  assetName?: string;
  assetCategory?: string;
  existingVersion?: number | null;
  savedVersion?: number | null;
  recordCount?: number;
  saveIntent?: string | null;
  emit?: (type: string, payload: Record<string, unknown>) => void;
  [key: string]: unknown;
}

export function ChatUploadPanel({
  channelId,
  chatHistory = [],
  uploadStatus = 'idle',
  assetName,
  assetCategory,
  existingVersion,
  savedVersion,
  recordCount = 0,
  saveIntent,
  emit,
}: Props) {
  const [text, setText] = useState('');
  const [localUploading, setLocalUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !channelId) return;
    setLocalUploading(true);
    try {
      const token = localStorage.getItem('token');
      const formData = new FormData();
      formData.append('file', file);
      await fetch(`/api/documents/channel/${channelId}/upload`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
    } catch (err) {
      console.error('Upload error:', err);
    } finally {
      setLocalUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const sendChat = () => {
    const trimmed = text.trim();
    if (!trimmed || !emit) return;
    emit('send-chat-message', { text: trimmed });
    setText('');
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    sendChat();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendChat();
    }
  };

  const isUploading = localUploading || uploadStatus === 'uploading' || uploadStatus === 'analyzing';
  const isExtracting = uploadStatus === 'extracting' || uploadStatus === 'checking';

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border">
        <h2 className="font-semibold text-sm">Structured Asset Creator</h2>
        {assetName && (
          <p className="text-xs text-muted-foreground mt-0.5">
            {assetName}
            {assetCategory && <span className="ml-1 opacity-60">· {assetCategory}</span>}
            {saveIntent === 'replace' && existingVersion != null && (
              <span className="ml-1 text-amber-600">· Will replace v{existingVersion}</span>
            )}
            {saveIntent === 'new-version' && existingVersion != null && (
              <span className="ml-1 text-blue-600">· Will save as v{existingVersion + 1}</span>
            )}
          </p>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {chatHistory.length === 0 && uploadStatus === 'idle' && (
          <p className="text-sm text-muted-foreground">
            Upload a PDF to begin. Claude will analyze its structure and help you define a schema.
          </p>
        )}
        {chatHistory.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                msg.role === 'user'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-foreground'
              }`}
            >
              <p className="whitespace-pre-wrap">{msg.content}</p>
            </div>
          </div>
        ))}
        {(isUploading || isExtracting) && (
          <div className="flex justify-start">
            <div className="bg-muted rounded-lg px-3 py-2 text-sm text-muted-foreground flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-primary animate-pulse" />
              {isUploading ? 'Analyzing your PDF…' : 'Extracting records…'}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Bottom action area */}
      <div className="border-t border-border p-3 space-y-2">
        {/* Idle — file upload */}
        {uploadStatus === 'idle' && (
          <div className="flex flex-col gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,application/pdf"
              className="hidden"
              onChange={handleFileChange}
            />
            <Button
              variant="default"
              className="w-full"
              onClick={() => fileInputRef.current?.click()}
              disabled={!channelId}
            >
              Upload PDF
            </Button>
          </div>
        )}

        {/* Uploading / analyzing — no input */}
        {(isUploading || isExtracting) && null}

        {/* Version conflict */}
        {uploadStatus === 'version-check' && (
          <div className="space-y-2">
            <p className="text-xs text-center text-muted-foreground">
              <strong>{assetName}</strong> already exists at v{existingVersion}. What would you like to do?
            </p>
            <div className="flex gap-2">
              <Button
                variant="destructive"
                size="sm"
                className="flex-1"
                onClick={() => emit?.('choose-replace', {})}
              >
                Replace v{existingVersion}
              </Button>
              <Button
                variant="default"
                size="sm"
                className="flex-1"
                onClick={() => emit?.('choose-new-version', {})}
              >
                Save as v{(existingVersion ?? 0) + 1}
              </Button>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => emit?.('change-asset-identity', {})}
            >
              Change name / category
            </Button>
          </div>
        )}

        {/* Schema discussion / proposed */}
        {(uploadStatus === 'schema-discussion' || uploadStatus === 'schema-proposed') && (
          <div className="space-y-2">
            {uploadStatus === 'schema-proposed' && (
              <Button
                variant="default"
                className="w-full"
                onClick={() => emit?.('confirm-schema', {})}
              >
                Confirm Schema &amp; Extract
              </Button>
            )}
            <form onSubmit={handleSubmit} className="flex gap-2">
              <textarea
                className="flex-1 min-h-[36px] max-h-[100px] resize-none rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder="Refine the schema or ask a question…"
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={1}
              />
              <Button type="submit" size="sm" disabled={!text.trim()}>
                Send
              </Button>
            </form>
          </div>
        )}

        {/* Review — accept or reject */}
        {uploadStatus === 'review' && (
          <div className="space-y-2">
            <p className="text-xs text-center text-muted-foreground">
              {recordCount} records extracted. Accept to save or revise the schema.
            </p>
            <div className="flex gap-2">
              <Button
                variant="default"
                className="flex-1"
                onClick={() => emit?.('accept-import', {})}
              >
                Accept Import
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => emit?.('reject-import', {})}
              >
                Revise Schema
              </Button>
            </div>
          </div>
        )}

        {/* Complete */}
        {uploadStatus === 'complete' && (
          <div className="space-y-2">
            <div className="rounded-md bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-800 text-center">
              ✓ Saved <strong>{assetName}</strong> as v{savedVersion} · {recordCount} records
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => fileInputRef.current?.click()}
              >
                Upload another PDF
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,application/pdf"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
