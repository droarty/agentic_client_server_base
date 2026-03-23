// Base type for all channel messages
export interface Message {
  type: string;
  from: 'client' | 'server';
  to: 'client' | 'server';
  channel: string;
  timestamp: string;
}

// ── Inbound (client → server) ─────────────────────────────────────────────

export interface AddTextMessage extends Message {
  type: 'add-text';
  from: 'client';
  to: 'server';
  senderEmail?: string;
  text: string;
}

export interface AddColorfulTextMessage extends Message {
  type: 'add-colorful-text';
  from: 'client';
  to: 'server';
  senderEmail?: string;
  text: string;
  color: string;
}

export type InboundMessage = AddTextMessage | AddColorfulTextMessage | AiResponse;

// ── Outbound (server → client) ────────────────────────────────────────────

export interface DisplayTextMessage extends Message {
  type: 'display-text';
  from: 'server';
  to: 'client';
  id: string;
  authorEmail: string;
  text: string;
  targetId?: string;
}

export interface DisplayColorfulTextMessage extends Message {
  type: 'display-colorful-text';
  from: 'server';
  to: 'client';
  id: string;
  authorEmail: string;
  text: string;
  color: string;
  targetId?: string;
}

export interface PanelItem {
  locationId: string;
  widthProportion: number;
  overflowX?: string;
  overflowY?: string;
}

export interface HorizontalWorkspaceMessage extends Message {
  type: 'horizontal-workspace';
  from: 'server';
  to: 'client';
  panels: PanelItem[];
  targetId?: string;
}

export interface VerticalWorkspaceMessage extends Message {
  type: 'vertical-workspace';
  from: 'server';
  to: 'client';
  panels: PanelItem[];
  targetId?: string;
}

export interface TabItem {
  title: string;
  locationId: string;
}

export interface SimpleTabMessage extends Message {
  type: 'simple-tab';
  from: 'server';
  to: 'client';
  tabs: TabItem[];
  targetId?: string;
}

export interface DisplayJsonMessage extends Message {
  type: 'display-json';
  from: 'server';
  to: 'client';
  json: object;
  targetId?: string;
}

export type OutboundMessage = DisplayTextMessage | DisplayColorfulTextMessage | SimpleTabMessage | HorizontalWorkspaceMessage | VerticalWorkspaceMessage | DisplayJsonMessage;

export type AnyMessage = InboundMessage | OutboundMessage;

// ── AI service messages (server ↔ ai-service) ─────────────────────────────

export interface ValidateTextMessage {
  type: 'validate-text';
  from: 'server';
  to: 'ai-service';
  channel: string;
  timestamp: string;
  text: string;
  senderEmail?: string;
}

export interface ValidTextAiResponse {
  type: 'valid-text';
  from: 'ai-service';
  to: 'server';
  channel: string;
  timestamp: string;
  text: string;
  senderEmail?: string;
}

export interface InappropriateTextAiResponse {
  type: 'inappropriate-text';
  from: 'ai-service';
  to: 'server';
  channel: string;
  timestamp: string;
  senderEmail?: string;
}

export type AiResponse = ValidTextAiResponse | InappropriateTextAiResponse;

// ── WebSocket protocol envelopes ──────────────────────────────────────────

export type WsClientMessage =
  | { type: 'auth'; token: string }
  | { type: 'subscribe'; channel: string }
  | { type: 'unsubscribe'; channel: string }
  | { type: 'channel-message'; message: InboundMessage };

export type WsServerMessage =
  | { type: 'auth_success' }
  | { type: 'auth_error'; message: string }
  | { type: 'channel-message'; message: OutboundMessage };
