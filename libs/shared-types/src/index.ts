export interface SsoProvider {
  provider: string;
  providerId: string;
  email: string;
  displayName?: string;
}

export * from './message.types';
export * from './group.types';

export interface ArtifactSummary {
  _id: string;
  name: string;
  type: string;
  userId?: string;
  groupId?: string;
  parentId?: string;
  currentChannelId: string;
  permissions: import('./group.types').ArtifactPermission[];
  userPermissions: import('./group.types').UserArtifactPermission[];
  permissionManagerMode: import('./group.types').ArtifactPermissionMode;
  createdAt: string;
  updatedAt: string;
}

export interface Artifact {
  _id: string;
  name: string;
  type: string;
  groupId?: string;
  parentId?: string;
  currentChannelId: string;
  permissions: import('./group.types').ArtifactPermission[];
  userPermissions: import('./group.types').UserArtifactPermission[];
  permissionManagerMode: import('./group.types').ArtifactPermissionMode;
  state?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDocumentRequest {
  name: string;
  workflowType: string;
  groupId?: string;
  targetUserId?: string;
  parentId?: string;
}

export interface SetUserPermissionRequest {
  userId: string;
  access: import('./group.types').ArtifactAccess;
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

export interface WorkflowConfigSummary {
  _id: string;
  name: string;
  displayName: string;
  version: string;
}
