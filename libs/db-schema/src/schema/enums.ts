import { pgEnum } from 'drizzle-orm/pg-core';

export const accessLevelEnum = pgEnum('access_level', ['read', 'write', 'admin']);
export const permissionManagerModeEnum = pgEnum('permission_manager_mode', ['owner', 'group_admin']);
export const membershipRoleEnum = pgEnum('membership_role', ['owner', 'admin', 'member']);
export const workflowLogTypeEnum = pgEnum('workflow_log_type', ['handler', 'route', 'error', 'tool']);
