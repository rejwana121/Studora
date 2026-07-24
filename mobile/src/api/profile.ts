import { request } from './client';
import type { ApiResult, Profile, ProfileUpdate } from '@/types/api';

export function getProfile(token: string): Promise<ApiResult<Profile>> {
  return request<Profile>('/profile', { token });
}

export function updateProfile(token: string, changes: ProfileUpdate): Promise<ApiResult<Profile>> {
  return request<Profile>('/profile', { method: 'PATCH', body: changes, token });
}
