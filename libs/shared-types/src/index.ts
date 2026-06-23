export interface SsoProvider {
  provider: string;
  providerId: string;
  email: string;
  displayName?: string;
}

export * from './message.types';
export * from './group.types';
export * from './structured-asset.types';

export interface ArtifactSummary {
  _id: string;
  name: string;
  type: string;
  userId?: string;
  currentChannelId: string;
  createdAt: string;
  updatedAt: string;
}

export interface Artifact {
  _id: string;
  name: string;
  type: string;
  currentChannelId: string;
  state?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardArtifact {
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
