export interface SsoProvider {
  provider: string;
  providerId: string;
  email: string;
  displayName?: string;
}

export type Role = 'user' | 'author' | 'admin';

export interface ChatMessage {
  id: string;
  from: string;
  text: string;
  timestamp: string;
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
