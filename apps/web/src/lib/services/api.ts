import axios from 'axios';
import { AuthResponse, User, UpdateUserRequest, Artifact } from '@multiplayer-base/shared-types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const client = axios.create({ baseURL: API_URL });

client.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers['Authorization'] = `Bearer ${token}`;
  }
  return config;
});

export async function apiLogin(email: string, password: string): Promise<AuthResponse> {
  const { data } = await client.post<AuthResponse>('/api/auth/login', { email, password });
  return data;
}

export async function apiRegister(
  email: string,
  password: string,
  confirmPassword: string
): Promise<AuthResponse> {
  const { data } = await client.post<AuthResponse>('/api/auth/register', {
    email,
    password,
    confirmPassword,
  });
  return data;
}

export async function apiGetUsers(): Promise<User[]> {
  const { data } = await client.get<User[]>('/api/users');
  return data;
}

export async function apiGetMe(): Promise<User> {
  const { data } = await client.get<User>('/api/users/me');
  return data;
}

export async function apiUpdateMe(updates: UpdateUserRequest): Promise<User> {
  const { data } = await client.patch<User>('/api/users/me', updates);
  return data;
}

export async function apiExchangeOAuthCode(code: string): Promise<string> {
  const { data } = await client.post<{ token: string }>('/api/auth/exchange', { code });
  return data.token;
}

export async function apiGetDocuments(): Promise<Artifact[]> {
  const { data } = await client.get<Artifact[]>('/api/documents');
  return data;
}

export async function apiCreateDocument(name: string): Promise<Artifact> {
  const { data } = await client.post<Artifact>('/api/documents', { name });
  return data;
}

export async function apiGetDocument(id: string): Promise<Artifact> {
  const { data } = await client.get<Artifact>(`/api/documents/${id}`);
  return data;
}
