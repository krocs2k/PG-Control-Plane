import { UserRole, Environment, ClusterStatus, ReplicationMode, NodeRole, NodeStatus } from '@prisma/client';

export type { UserRole, Environment, ClusterStatus, ReplicationMode, NodeRole, NodeStatus };

export interface SessionUser {
  id: string;
  email: string;
  name?: string | null;
  role: UserRole;
  orgId?: string | null;
}

export interface Organization {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Project {
  id: string;
  name: string;
  environment: Environment;
  orgId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Cluster {
  id: string;
  name: string;
  topology: string;
  status: ClusterStatus;
  replicationMode: ReplicationMode;
  projectId: string;
  createdAt: Date;
  updatedAt: Date;
  _count?: { nodes: number };
}

export interface Node {
  id: string;
  name: string;
  host: string;
  port: number;
  role: NodeRole;
  status: NodeStatus;
  clusterId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuditLogEntry {
  id: string;
  userId?: string | null;
  entityType: string;
  entityId: string;
  action: string;
  beforeState?: string | null;
  afterState?: string | null;
  timestamp: Date;
  user?: { email: string; name?: string | null } | null;
}

export const ROLE_HIERARCHY: Record<UserRole, number> = {
  OWNER: 4,
  ADMIN: 3,
  OPERATOR: 2,
  VIEWER: 1,
};

export function hasPermission(userRole: UserRole, requiredRole: UserRole): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];
}
