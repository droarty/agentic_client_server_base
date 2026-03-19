export interface SsoProvider {
  provider: string;
  providerId: string;
  email: string;
  displayName?: string;
}

export type Role = 'user' | 'author' | 'admin';

// Base type for all messages sent through a channel
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

export interface User {
  _id: string;
  email: string;
  hasPassword: boolean;
  roles: Role[];
  ssoProviders: SsoProvider[];
  createdAt: string;
  updatedAt: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  confirmPassword: string;
}

export interface UpdateUserRequest {
  email?: string;
  currentPassword?: string;
  newPassword?: string;
}

export interface ApiError {
  message: string;
  errors?: Record<string, string>;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}
