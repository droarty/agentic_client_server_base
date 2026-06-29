export type AccessLevel = 'none' | 'read' | 'write' | 'admin';

export const ACCESS_RANK: Record<AccessLevel, number> = { none: 0, read: 1, write: 2, admin: 3 };
