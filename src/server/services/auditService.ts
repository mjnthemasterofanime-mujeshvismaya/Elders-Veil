import { db } from '../../db/index.ts';
import { auditLogs } from '../../db/schema.ts';

export interface AuditInput {
  actorUserId?: number | null;
  actorEmail?: string | null;
  actorRole?: string | null;
  action: string;
  entityType: string;
  entityId?: string | number | null;
  details?: Record<string, unknown>;
  ipAddress?: string | null;
}

export async function recordAudit(input: AuditInput): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      actorUserId: input.actorUserId ?? null,
      actorEmail: input.actorEmail ?? null,
      actorRole: input.actorRole ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId !== undefined && input.entityId !== null ? String(input.entityId) : null,
      details: input.details ?? {},
      ipAddress: input.ipAddress ?? null,
    });
  } catch (err) {
    console.error('Audit log insert failed:', err);
  }
}
