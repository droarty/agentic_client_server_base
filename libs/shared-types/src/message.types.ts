export interface Message {
  type: string;
  id: string;
  from: string;
  timestamp: string;
}

export interface ChatMessage extends Message {
  type: 'chat';
  text: string;
}

export interface ColorfulChatMessage extends Message {
  type: 'colorful-chat';
  text: string;
  color: string;
}

export type AnyMessage = ChatMessage | ColorfulChatMessage;

// WebSocket message types (client ↔ server)
export type WsClientMessage =
  | { type: 'auth'; token: string }
  | { type: 'subscribe'; channel: string }
  | { type: 'channel-message'; channel: string; message: AnyMessage };

export type WsServerMessage =
  | { type: 'auth_success' }
  | { type: 'auth_error'; message: string }
  | { type: 'channel-message'; channel: string; message: AnyMessage };
