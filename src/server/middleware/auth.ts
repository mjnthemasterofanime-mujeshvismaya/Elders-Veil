import type { NextFunction, Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { adminAuth } from '../../lib/firebase-admin.ts';
import { db } from '../../db/index.ts';
import { departmentMemberships, departments, users } from '../../db/schema.ts';
import { ensureStudioSeeded } from '../seed.ts';
import { OFFICIAL_DIRECTOR_EMAIL } from '../services/notificationService.ts';
import { recordAudit } from '../services/auditService.ts';

export type StudioRole = 'DIRECTOR' | 'ADMIN' | 'DEPT_HEAD' | 'MEMBER' | 'GUEST';

export interface StudioUserContext {
  id: number;
  uid: string;
  memberId: string | null;
  email: string;
  fullName: string;
  role: StudioRole;
  status: string;
  phone: string | null;
  bio: string | null;
  skills: string[];
  avatarUrl: string | null;
  sessionVersion: number;
  departments: Array<{ departmentId: string; deptRole: string }>;
}

export interface AuthRequest extends Request {
  studioUser?: StudioUserContext;
}

// Simple bounded in-memory rate limiter for auth & public endpoints
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(keyPrefix: string, maxRequests: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const key = `${keyPrefix}:${ip}`;
    const now = Date.now();
    const existing = rateBuckets.get(key);

    if (!existing || existing.resetAt <= now) {
      rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    if (existing.count >= maxRequests) {
      return res.status(429).json({
        error: 'Too many requests. Please wait a moment and try again.',
      });
    }

    existing.count += 1;
    return next();
  };
}

export async function resolveUserByFirebaseToken(token: string, ipAddress?: string): Promise<StudioUserContext> {
  await ensureStudioSeeded();

  const decoded = await adminAuth.verifyIdToken(token);
  const email = (decoded.email || '').trim().toLowerCase();
  const displayName = decoded.name || email.split('@')[0] || 'Studio Member';
  const avatarUrl = decoded.picture || null;

  if (!email) {
    throw new Error('Authenticated token does not include an email address.');
  }

  let rows = await db.select().from(users).where(eq(users.uid, decoded.uid));
  let user = rows[0];

  if (!user) {
    // Check if pre-provisioned by email (e.g. Founder/Director or approved applicant)
    const byEmail = await db.select().from(users).where(eq(users.email, email));
    if (byEmail[0]) {
      const [updated] = await db
        .update(users)
        .set({
          uid: decoded.uid,
          avatarUrl: avatarUrl ?? byEmail[0].avatarUrl,
          lastLoginAt: new Date(),
          status: byEmail[0].status === 'PENDING_ONBOARDING' ? 'ACTIVE' : byEmail[0].status,
          updatedAt: new Date(),
        })
        .where(eq(users.id, byEmail[0].id))
        .returning();
      user = updated;

      await recordAudit({
        actorUserId: user.id,
        actorEmail: user.email,
        actorRole: user.role,
        action: 'USER_LOGIN_BOUND',
        entityType: 'USER',
        entityId: user.id,
        ipAddress: ipAddress ?? null,
      });
    } else {
      const isOfficialDirector = email === OFFICIAL_DIRECTOR_EMAIL.toLowerCase();
      const [inserted] = await db
        .insert(users)
        .values({
          uid: decoded.uid,
          memberId: isOfficialDirector ? 'EV-DIR-001' : null,
          email,
          fullName: isOfficialDirector ? 'M.J. Mujesh Dharshan' : displayName,
          role: isOfficialDirector ? 'DIRECTOR' : 'GUEST',
          status: 'ACTIVE',
          avatarUrl,
          lastLoginAt: new Date(),
        })
        .onConflictDoUpdate({
          target: users.uid,
          set: { lastLoginAt: new Date(), updatedAt: new Date() },
        })
        .returning();
      user = inserted;

      await recordAudit({
        actorUserId: user.id,
        actorEmail: user.email,
        actorRole: user.role,
        action: 'USER_FIRST_LOGIN',
        entityType: 'USER',
        entityId: user.id,
        ipAddress: ipAddress ?? null,
      });
    }
  } else {
    // Update last login timestamp
    await db
      .update(users)
      .set({ lastLoginAt: new Date() })
      .where(eq(users.id, user.id));
  }

  if (user.status === 'DISABLED') {
    throw new Error('ACCOUNT_DISABLED');
  }

  const memberships = await db
    .select({
      departmentId: departmentMemberships.departmentId,
      deptRole: departmentMemberships.deptRole,
    })
    .from(departmentMemberships)
    .where(eq(departmentMemberships.userId, user.id));

  // Director automatically has oversight access to all departments
  let effectiveDepts = memberships;
  if (user.role === 'DIRECTOR') {
    const allDepts = await db.select({ id: departments.id }).from(departments);
    const existingSet = new Set(memberships.map((m) => m.departmentId));
    effectiveDepts = [
      ...memberships,
      ...allDepts
        .filter((d) => !existingSet.has(d.id))
        .map((d) => ({ departmentId: d.id, deptRole: 'HEAD' })),
    ];
  }

  return {
    id: user.id,
    uid: user.uid,
    memberId: user.memberId,
    email: user.email,
    fullName: user.fullName,
    role: user.role as StudioRole,
    status: user.status,
    phone: user.phone,
    bio: user.bio,
    skills: user.skills ?? [],
    avatarUrl: user.avatarUrl,
    sessionVersion: user.sessionVersion,
    departments: effectiveDepts,
  };
}

export const requireAuth = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) {
    return res.status(401).json({ error: 'Authentication token is missing.' });
  }

  try {
    req.studioUser = await resolveUserByFirebaseToken(token, req.ip);
    return next();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unauthorized';
    if (msg === 'ACCOUNT_DISABLED') {
      return res.status(403).json({ error: 'Your studio account has been disabled by administration.' });
    }
    return res.status(401).json({ error: 'Invalid or expired authentication session.' });
  }
};

export function requireRoles(...allowed: StudioRole[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.studioUser) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    if (!allowed.includes(req.studioUser.role)) {
      return res.status(403).json({
        error: 'Insufficient studio permissions for this action.',
      });
    }
    return next();
  };
}

export const requireStudioMember = requireRoles('DIRECTOR', 'ADMIN', 'DEPT_HEAD', 'MEMBER');
export const requireAdminOrDirector = requireRoles('DIRECTOR', 'ADMIN');
export const requireDirectorOnly = requireRoles('DIRECTOR');

export function userCanAccessDepartment(user: StudioUserContext, departmentId: string): boolean {
  if (user.role === 'DIRECTOR' || user.role === 'ADMIN') return true;
  if (user.role === 'GUEST') return false;
  return user.departments.some((d) => d.departmentId === departmentId);
}
