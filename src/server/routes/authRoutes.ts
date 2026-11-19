import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { and, count, eq, or } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/index.ts';
import { applications, departmentMemberships, notifications, users } from '../../db/schema.ts';
import { requireAuth, type AuthRequest } from '../middleware/auth.ts';
import { recordAudit } from '../services/auditService.ts';

export const authRouter = Router();

authRouter.get('/me', requireAuth, async (req: AuthRequest, res) => {
  try {
    const user = req.studioUser!;
    const unreadRow = await db
      .select({ value: count() })
      .from(notifications)
      .where(
        and(
          eq(notifications.isRead, false),
          or(eq(notifications.recipientUserId, user.id), eq(notifications.recipientRole, user.role))
        )
      );

    res.json({
      user,
      unreadNotifications: unreadRow[0]?.value ?? 0,
    });
  } catch (err) {
    console.error('Auth me error:', err);
    res.status(500).json({ error: 'Failed to load profile.' });
  }
});

const profileSchema = z.object({
  fullName: z.string().trim().min(2).max(120).optional(),
  phone: z.string().trim().max(32).optional().nullable(),
  bio: z.string().trim().max(1500).optional().nullable(),
  skills: z.array(z.string().trim().min(1).max(60)).max(25).optional(),
});

authRouter.put('/profile', requireAuth, async (req: AuthRequest, res) => {
  try {
    const user = req.studioUser!;
    const parsed = profileSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid profile data.' });
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (parsed.data.fullName !== undefined) updates.fullName = parsed.data.fullName;
    if (parsed.data.phone !== undefined) updates.phone = parsed.data.phone;
    if (parsed.data.bio !== undefined) updates.bio = parsed.data.bio;
    if (parsed.data.skills !== undefined) updates.skills = parsed.data.skills;

    const [updated] = await db.update(users).set(updates).where(eq(users.id, user.id)).returning();

    await recordAudit({
      actorUserId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: 'PROFILE_UPDATED',
      entityType: 'USER',
      entityId: user.id,
      ipAddress: req.ip ?? null,
    });

    res.json({ user: updated });
  } catch (err) {
    console.error('Profile update error:', err);
    res.status(500).json({ error: 'Failed to update profile.' });
  }
});

const passwordSchema = z.object({
  newPassword: z
    .string()
    .min(10, 'Password must be at least 10 characters.')
    .max(128)
    .regex(/[A-Z]/, 'Include at least one uppercase letter.')
    .regex(/[a-z]/, 'Include at least one lowercase letter.')
    .regex(/[0-9]/, 'Include at least one number.'),
});

authRouter.post('/password', requireAuth, async (req: AuthRequest, res) => {
  try {
    const user = req.studioUser!;
    const parsed = passwordSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Weak password.' });
    }

    const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
    await db
      .update(users)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(users.id, user.id));

    await recordAudit({
      actorUserId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: 'STUDIO_PASSWORD_SET',
      entityType: 'USER',
      entityId: user.id,
      ipAddress: req.ip ?? null,
    });

    res.json({ ok: true, message: 'Studio security credential updated.' });
  } catch (err) {
    console.error('Password update error:', err);
    res.status(500).json({ error: 'Failed to update studio password.' });
  }
});

authRouter.post('/revoke-sessions', requireAuth, async (req: AuthRequest, res) => {
  try {
    const user = req.studioUser!;
    await db
      .update(users)
      .set({ sessionVersion: user.sessionVersion + 1, updatedAt: new Date() })
      .where(eq(users.id, user.id));

    await recordAudit({
      actorUserId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: 'SESSIONS_REVOKED_SELF',
      entityType: 'USER',
      entityId: user.id,
      ipAddress: req.ip ?? null,
    });

    res.json({ ok: true, sessionVersion: user.sessionVersion + 1 });
  } catch (err) {
    console.error('Revoke session error:', err);
    res.status(500).json({ error: 'Failed to revoke sessions.' });
  }
});

const redeemSchema = z.object({
  inviteCode: z.string().trim().min(4).max(40),
});

authRouter.post('/redeem-invite', requireAuth, async (req: AuthRequest, res) => {
  try {
    const user = req.studioUser!;
    const parsed = redeemSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Valid invitation code is required.' });
    }

    const code = parsed.data.inviteCode.trim().toUpperCase();
    const [app] = await db
      .select()
      .from(applications)
      .where(and(eq(applications.inviteCode, code), eq(applications.status, 'APPROVED')));

    if (!app) {
      return res.status(404).json({ error: 'Invalid or expired studio invitation code.' });
    }

    if (app.email.toLowerCase() !== user.email.toLowerCase()) {
      return res.status(403).json({
        error: 'This invitation code belongs to a different email address.',
      });
    }

    await db.transaction(async (tx) => {
      const targetRole = user.role === 'GUEST' ? 'MEMBER' : user.role;
      await tx
        .update(users)
        .set({
          role: targetRole,
          memberId: app.approvedMemberId || user.memberId,
          status: 'ACTIVE',
          updatedAt: new Date(),
        })
        .where(eq(users.id, user.id));

      await tx
        .insert(departmentMemberships)
        .values({
          userId: user.id,
          departmentId: app.departmentId,
          deptRole: 'MEMBER',
        })
        .onConflictDoNothing();
    });

    await recordAudit({
      actorUserId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: 'INVITE_REDEEMED',
      entityType: 'APPLICATION',
      entityId: app.trackingCode,
      ipAddress: req.ip ?? null,
    });

    res.json({ ok: true, departmentId: app.departmentId, memberId: app.approvedMemberId });
  } catch (err) {
    console.error('Redeem invite error:', err);
    res.status(500).json({ error: 'Failed to redeem invitation code.' });
  }
});
