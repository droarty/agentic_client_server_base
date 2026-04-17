export interface SsoProvider {
  provider: string;
  providerId: string;
  email: string;
  displayName?: string;
}

export type Role = 'user' | 'author' | 'admin';

export * from './message.types';
import type { OutboundMessage } from './message.types';

export interface DocumentSummary {
  _id: string;
  name: string;
  type: string;
  currentChannelId: string;
}

export interface ChatDocument {
  _id: string;
  name: string;
  type: 'chat';
  currentChannelId: string;
  messages: OutboundMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface DashboardDocument {
  _id: string;
  name: string;
  type: 'user-dashboard';
  currentChannelId: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
}

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
