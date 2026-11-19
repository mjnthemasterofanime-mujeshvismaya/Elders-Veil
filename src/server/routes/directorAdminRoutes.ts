import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { and, asc, count, desc, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { db } from '../../db/index.ts';
import {
  announcements,
  applicationReviews,
  applications,
  auditLogs,
  calendarEvents,
  departmentMemberships,
  departmentRecords,
  departments,
  fileAssets,
  integrationConfigs,
  notificationDeliveries,
  projects,
  storyEntries,
  tasks,
  users,
  workSubmissions,
} from '../../db/schema.ts';
import {
  requireAdminOrDirector,
  requireAuth,
  requireDirectorOnly,
  type AuthRequest,
} from '../middleware/auth.ts';
import { recordAudit } from '../services/auditService.ts';
import {
  createInternalNotification,
  OFFICIAL_DIRECTOR_EMAIL,
  OFFICIAL_DIRECTOR_PHONE,
  sendStudioEmail,
  sendStudioSms,
} from '../services/notificationService.ts';

export const directorAdminRouter = Router();

directorAdminRouter.use(requireAuth, requireAdminOrDirector);

directorAdminRouter.get('/dashboard', async (_req: AuthRequest, res) => {
  try {
    const [
      allUsers,
      allDepts,
      allMemberships,
      allApps,
      allProjects,
      allTasks,
      recentAudit,
      recentDeliveries,
      upcomingEvents,
    ] = await Promise.all([
      db.select().from(users),
      db.select().from(departments).orderBy(asc(departments.sortOrder)),
      db.select().from(departmentMemberships),
      db.select().from(applications),
      db.select().from(projects),
      db.select().from(tasks),
      db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(20),
      db.select().from(notificationDeliveries).orderBy(desc(notificationDeliveries.createdAt)).limit(15),
      db.select().from(calendarEvents).orderBy(asc(calendarEvents.startsAt)).limit(10),
    ]);

    const todayStr = new Date().toISOString().slice(0, 10);
    const activeMembers = allUsers.filter((u) => u.status === 'ACTIVE' && u.role !== 'GUEST');
    const inactiveMembers = allUsers.filter((u) => u.status !== 'ACTIVE' && u.role !== 'GUEST');
    const overdueTasks = allTasks.filter((t) => t.status !== 'DONE' && t.deadline && t.deadline < todayStr);

    const departmentSummaries = allDepts.map((dept) => {
      const memberCount = allMemberships.filter((m) => m.departmentId === dept.id).length;
      const deptTasks = allTasks.filter((t) => t.departmentId === dept.id);
      const completedTasks = deptTasks.filter((t) => t.status === 'DONE').length;
      const headUser = allUsers.find((u) => u.id === dept.headUserId);
      return {
        id: dept.id,
        prefix: dept.prefix,
        name: dept.name,
        memberCount,
        taskTotal: deptTasks.length,
        taskCompleted: completedTasks,
        headName: headUser?.fullName || null,
      };
    });

    res.json({
      metrics: {
        totalMembers: allUsers.filter((u) => u.role !== 'GUEST').length,
        activeMembers: activeMembers.length,
        inactiveMembers: inactiveMembers.length,
        totalDepartments: allDepts.length,
        pendingApplications: allApps.filter((a) => !['APPROVED', 'REJECTED'].includes(a.status)).length,
        approvedApplications: allApps.filter((a) => a.status === 'APPROVED').length,
        rejectedApplications: allApps.filter((a) => a.status === 'REJECTED').length,
        activeProjects: allProjects.filter((p) => p.status === 'ACTIVE').length,
        completedProjects: allProjects.filter((p) => p.status === 'COMPLETED').length,
        overdueTasks: overdueTasks.length,
      },
      departmentSummaries,
      overdueTaskList: overdueTasks.slice(0, 8),
      upcomingEvents,
      recentAudit,
      recentDeliveries,
    });
  } catch (err) {
    console.error('Admin dashboard error:', err);
    res.status(500).json({ error: 'Failed to load executive dashboard metrics.' });
  }
});

// Members List
directorAdminRouter.get('/members', async (_req: AuthRequest, res) => {
  try {
    const [userRows, membershipRows] = await Promise.all([
      db.select().from(users).orderBy(asc(users.id)),
      db.select().from(departmentMemberships),
    ]);

    const members = userRows.map((u) => ({
      id: u.id,
      memberId: u.memberId,
      email: u.email,
      fullName: u.fullName,
      role: u.role,
      status: u.status,
      phone: u.phone,
      bio: u.bio,
      skills: u.skills,
      lastLoginAt: u.lastLoginAt,
      createdAt: u.createdAt,
      departments: membershipRows
        .filter((m) => m.userId === u.id)
        .map((m) => ({ departmentId: m.departmentId, deptRole: m.deptRole })),
    }));

    res.json({ members });
  } catch (err) {
    console.error('List members error:', err);
    res.status(500).json({ error: 'Failed to load members.' });
  }
});

const createMemberSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(160),
  role: z.enum(['ADMIN', 'DEPT_HEAD', 'MEMBER']),
  departmentId: z.string().trim().min(2),
  phone: z.string().trim().max(32).optional(),
  skills: z.array(z.string().trim()).optional(),
});

directorAdminRouter.post('/members', async (req: AuthRequest, res) => {
  try {
    const actor = req.studioUser!;
    const parsed = createMemberSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid member details.' });
    }

    const { fullName, email, role, departmentId, phone, skills } = parsed.data;
    if (role === 'ADMIN' && actor.role !== 'DIRECTOR') {
      return res.status(403).json({
        error: 'Only the Founder/Director may create Admin accounts.',
      });
    }

    const [dept] = await db.select().from(departments).where(eq(departments.id, departmentId));
    if (!dept) {
      return res.status(400).json({ error: 'Invalid department ID.' });
    }

    const existing = await db.select().from(users).where(eq(users.email, email.toLowerCase()));
    if (existing[0]) {
      return res.status(409).json({ error: 'A studio account with this email already exists.' });
    }

    const memberCount = await db.select({ value: count() }).from(users);
    const seq = String((memberCount[0]?.value ?? 0) + 1).padStart(3, '0');
    const memberId = `EV-${dept.prefix}-${seq}`;

    const created = await db.transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({
          uid: `pending-${nanoid(12)}`,
          memberId,
          email: email.toLowerCase(),
          fullName,
          role,
          status: 'PENDING_ONBOARDING',
          phone: phone || null,
          skills: skills || [],
        })
        .returning();

      await tx.insert(departmentMemberships).values({
        userId: user.id,
        departmentId: dept.id,
        deptRole: role === 'DEPT_HEAD' ? 'HEAD' : 'MEMBER',
        assignedByUserId: actor.id,
      });

      if (role === 'DEPT_HEAD') {
        await tx.update(departments).set({ headUserId: user.id }).where(eq(departments.id, dept.id));
      }
      return user;
    });

    await recordAudit({
      actorUserId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: 'MEMBER_CREATED',
      entityType: 'USER',
      entityId: created.id,
      details: { memberId, email: created.email, role, departmentId: dept.id },
      ipAddress: req.ip ?? null,
    });

    res.status(201).json({ member: created });
  } catch (err) {
    console.error('Create member error:', err);
    res.status(500).json({ error: 'Failed to create member.' });
  }
});

const updateMemberSchema = z.object({
  fullName: z.string().trim().min(2).max(120).optional(),
  role: z.enum(['ADMIN', 'DEPT_HEAD', 'MEMBER', 'GUEST']).optional(),
  status: z.enum(['ACTIVE', 'DISABLED', 'PENDING_ONBOARDING']).optional(),
  phone: z.string().trim().max(32).optional().nullable(),
  departmentIds: z.array(z.string().trim()).optional(),
});

directorAdminRouter.patch('/members/:id', async (req: AuthRequest, res) => {
  try {
    const actor = req.studioUser!;
    const targetId = Number(req.params.id);
    if (!Number.isInteger(targetId)) {
      return res.status(400).json({ error: 'Invalid member ID.' });
    }

    const [target] = await db.select().from(users).where(eq(users.id, targetId));
    if (!target) {
      return res.status(404).json({ error: 'Member not found.' });
    }

    // Strict Hierarchy Checks (Part 7)
    if (target.role === 'DIRECTOR' && actor.role !== 'DIRECTOR') {
      return res.status(403).json({ error: 'Admins cannot modify the Founder/Director account.' });
    }
    if (target.role === 'ADMIN' && actor.role !== 'DIRECTOR') {
      return res.status(403).json({ error: 'Only the Founder/Director may modify Admin accounts.' });
    }

    const parsed = updateMemberSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid update payload.' });
    }

    if (parsed.data.role === 'ADMIN' && actor.role !== 'DIRECTOR') {
      return res.status(403).json({ error: 'Only the Founder/Director may promote a user to Admin.' });
    }
    if (target.role === 'DIRECTOR' && parsed.data.role) {
      return res.status(403).json({ error: 'Director authority cannot be downgraded.' });
    }
    if (target.role === 'DIRECTOR' && parsed.data.status === 'DISABLED') {
      return res.status(403).json({ error: 'The Founder/Director account cannot be disabled.' });
    }

    const updated = await db.transaction(async (tx) => {
      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (parsed.data.fullName !== undefined) updates.fullName = parsed.data.fullName;
      if (parsed.data.role !== undefined && target.role !== 'DIRECTOR') updates.role = parsed.data.role;
      if (parsed.data.status !== undefined) updates.status = parsed.data.status;
      if (parsed.data.phone !== undefined) updates.phone = parsed.data.phone;

      const [u] = await tx.update(users).set(updates).where(eq(users.id, targetId)).returning();

      if (parsed.data.departmentIds) {
        await tx.delete(departmentMemberships).where(eq(departmentMemberships.userId, targetId));
        for (const deptId of parsed.data.departmentIds) {
          await tx
            .insert(departmentMemberships)
            .values({
              userId: targetId,
              departmentId: deptId,
              deptRole: (u.role === 'DEPT_HEAD' ? 'HEAD' : 'MEMBER'),
              assignedByUserId: actor.id,
            })
            .onConflictDoNothing();
        }
      }
      return u;
    });

    await recordAudit({
      actorUserId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: 'MEMBER_UPDATED',
      entityType: 'USER',
      entityId: targetId,
      details: parsed.data,
      ipAddress: req.ip ?? null,
    });

    res.json({ member: updated });
  } catch (err) {
    console.error('Update member error:', err);
    res.status(500).json({ error: 'Failed to update member.' });
  }
});

directorAdminRouter.post('/members/:id/reset-password', async (req: AuthRequest, res) => {
  try {
    const actor = req.studioUser!;
    const targetId = Number(req.params.id);
    const [target] = await db.select().from(users).where(eq(users.id, targetId));
    if (!target) return res.status(404).json({ error: 'Member not found.' });
    if (target.role === 'DIRECTOR' && actor.role !== 'DIRECTOR') {
      return res.status(403).json({ error: 'Admins cannot reset Director credentials.' });
    }

    const tempPassword = `EV-${nanoid(10)}!9`;
    const hash = await bcrypt.hash(tempPassword, 12);
    await db
      .update(users)
      .set({ passwordHash: hash, sessionVersion: target.sessionVersion + 1, updatedAt: new Date() })
      .where(eq(users.id, targetId));

    await recordAudit({
      actorUserId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: 'MEMBER_PASSWORD_RESET',
      entityType: 'USER',
      entityId: targetId,
      ipAddress: req.ip ?? null,
    });

    res.json({ ok: true, temporaryCredential: tempPassword });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ error: 'Failed to reset member credential.' });
  }
});

directorAdminRouter.post('/members/:id/revoke-sessions', async (req: AuthRequest, res) => {
  try {
    const actor = req.studioUser!;
    const targetId = Number(req.params.id);
    const [target] = await db.select().from(users).where(eq(users.id, targetId));
    if (!target) return res.status(404).json({ error: 'Member not found.' });
    if (target.role === 'DIRECTOR' && actor.role !== 'DIRECTOR') {
      return res.status(403).json({ error: 'Admins cannot revoke Director sessions.' });
    }

    await db
      .update(users)
      .set({ sessionVersion: target.sessionVersion + 1, updatedAt: new Date() })
      .where(eq(users.id, targetId));

    await recordAudit({
      actorUserId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: 'MEMBER_SESSIONS_REVOKED',
      entityType: 'USER',
      entityId: targetId,
      ipAddress: req.ip ?? null,
    });

    res.json({ ok: true });
  } catch (err) {
    console.error('Revoke member sessions error:', err);
    res.status(500).json({ error: 'Failed to revoke sessions.' });
  }
});

// Applications Management
directorAdminRouter.get('/applications', async (_req: AuthRequest, res) => {
  try {
    const [appRows, reviewRows, assetRows] = await Promise.all([
      db.select().from(applications).orderBy(desc(applications.createdAt)),
      db.select().from(applicationReviews).orderBy(desc(applicationReviews.createdAt)),
      db.select().from(fileAssets),
    ]);

    const enriched = appRows.map((a) => ({
      ...a,
      resumeFile: assetRows.find((f) => f.id === a.resumeFileId) || null,
      sampleFile: assetRows.find((f) => f.id === a.sampleFileId) || null,
      reviews: reviewRows.filter((r) => r.applicationId === a.id),
    }));

    res.json({ applications: enriched });
  } catch (err) {
    console.error('List applications error:', err);
    res.status(500).json({ error: 'Failed to load applications.' });
  }
});

const appDecisionSchema = z.object({
  status: z.enum([
    'UNDER_REVIEW',
    'SHORTLISTED',
    'INTERVIEW_SCHEDULED',
    'ASSESSMENT_REQUESTED',
    'APPROVED',
    'REJECTED',
  ]),
  note: z.string().trim().max(1500).optional(),
  interviewScheduledAt: z.string().optional(),
  assessmentPrompt: z.string().trim().max(1500).optional(),
  assignedRole: z.enum(['MEMBER', 'DEPT_HEAD']).optional(),
});

directorAdminRouter.post('/applications/:id/decision', async (req: AuthRequest, res) => {
  try {
    const actor = req.studioUser!;
    const appId = Number(req.params.id);
    const parsed = appDecisionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid decision.' });
    }

    const [app] = await db.select().from(applications).where(eq(applications.id, appId));
    if (!app) return res.status(404).json({ error: 'Application not found.' });

    const [dept] = await db.select().from(departments).where(eq(departments.id, app.departmentId));
    if (!dept) return res.status(400).json({ error: 'Associated department missing.' });

    const { status, note, interviewScheduledAt, assessmentPrompt, assignedRole } = parsed.data;
    let createdMemberId = app.approvedMemberId;
    let inviteCode = app.inviteCode;

    const updatedApp = await db.transaction(async (tx) => {
      if (status === 'APPROVED') {
        const memberCount = await tx.select({ value: count() }).from(users);
        const seq = String((memberCount[0]?.value ?? 0) + 1).padStart(3, '0');
        createdMemberId = app.approvedMemberId || `EV-${dept.prefix}-${seq}`;
        inviteCode = app.inviteCode || `INV-${nanoid(8).toUpperCase()}`;

        const existingUser = await tx.select().from(users).where(eq(users.email, app.email.toLowerCase()));
        let userId: number;
        const targetRole = assignedRole || 'MEMBER';

        if (existingUser[0]) {
          const nextRole = existingUser[0].role === 'GUEST' ? targetRole : existingUser[0].role;
          const [u] = await tx
            .update(users)
            .set({
              role: nextRole,
              memberId: existingUser[0].memberId || createdMemberId,
              phone: existingUser[0].phone || app.phone,
              status: 'ACTIVE',
              updatedAt: new Date(),
            })
            .where(eq(users.id, existingUser[0].id))
            .returning();
          userId = u.id;
        } else {
          const [u] = await tx
            .insert(users)
            .values({
              uid: `pending-${nanoid(12)}`,
              memberId: createdMemberId,
              email: app.email.toLowerCase(),
              fullName: app.fullName,
              role: targetRole,
              status: 'PENDING_ONBOARDING',
              phone: app.phone,
              bio: app.introduction,
              skills: app.skills.split(',').map((s) => s.trim()).filter(Boolean),
            })
            .returning();
          userId = u.id;
        }

        await tx
          .insert(departmentMemberships)
          .values({
            userId,
            departmentId: dept.id,
            deptRole: targetRole === 'DEPT_HEAD' ? 'HEAD' : 'MEMBER',
            assignedByUserId: actor.id,
          })
          .onConflictDoNothing();

        if (targetRole === 'DEPT_HEAD') {
          await tx.update(departments).set({ headUserId: userId }).where(eq(departments.id, dept.id));
        }
      }

      const [updated] = await tx
        .update(applications)
        .set({
          status,
          internalNotes: note !== undefined ? note : app.internalNotes,
          interviewScheduledAt: interviewScheduledAt ? new Date(interviewScheduledAt) : app.interviewScheduledAt,
          assessmentPrompt: assessmentPrompt !== undefined ? assessmentPrompt : app.assessmentPrompt,
          reviewedByUserId: actor.id,
          approvedMemberId: createdMemberId,
          inviteCode,
          updatedAt: new Date(),
        })
        .where(eq(applications.id, appId))
        .returning();

      await tx.insert(applicationReviews).values({
        applicationId: appId,
        reviewerUserId: actor.id,
        action: status,
        note: note || `Status updated to ${status}`,
      });

      return updated;
    });

    await recordAudit({
      actorUserId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: `APPLICATION_${status}`,
      entityType: 'APPLICATION',
      entityId: app.trackingCode,
      details: { departmentId: dept.id, approvedMemberId: createdMemberId },
      ipAddress: req.ip ?? null,
    });

    if (status === 'APPROVED') {
      await createInternalNotification({
        recipientRole: 'DIRECTOR',
        type: 'APPLICATION_APPROVED',
        title: `Applicant Approved: ${app.fullName}`,
        body: `Assigned Member ID ${createdMemberId} in ${dept.name}. Invite Code: ${inviteCode}`,
        linkTab: 'members',
      });

      await sendStudioEmail({
        to: app.email,
        subject: "Welcome to Elder'sVeil Anime Studio — Onboarding Approved",
        text: [
          `Hello ${app.fullName},`,
          '',
          `Congratulations! Your application (${app.trackingCode}) for the ${dept.name} Department has been approved.`,
          `Your Member ID: ${createdMemberId}`,
          `Onboarding Invite Code: ${inviteCode}`,
          '',
          'Sign in with Google using this email address to enter your studio workplace.',
        ].join('\n'),
        relatedEntityType: 'APPLICATION',
        relatedEntityId: app.trackingCode,
      });
    }

    res.json({ application: updatedApp });
  } catch (err) {
    console.error('Application decision error:', err);
    res.status(500).json({ error: 'Failed to process application decision.' });
  }
});

// Department Management
directorAdminRouter.get('/departments', async (_req: AuthRequest, res) => {
  try {
    const [deptRows, membershipRows, userRows] = await Promise.all([
      db.select().from(departments).orderBy(asc(departments.sortOrder)),
      db.select().from(departmentMemberships),
      db.select().from(users),
    ]);

    const enriched = deptRows.map((d) => ({
      ...d,
      headUser: userRows.find((u) => u.id === d.headUserId) || null,
      members: membershipRows
        .filter((m) => m.departmentId === d.id)
        .map((m) => {
          const u = userRows.find((usr) => usr.id === m.userId);
          return u
            ? {
                id: u.id,
                memberId: u.memberId,
                fullName: u.fullName,
                email: u.email,
                role: u.role,
                deptRole: m.deptRole,
              }
            : null;
        })
        .filter(Boolean),
    }));

    res.json({ departments: enriched });
  } catch (err) {
    console.error('Admin departments error:', err);
    res.status(500).json({ error: 'Failed to load department administration.' });
  }
});

directorAdminRouter.post('/departments/:id/head', async (req: AuthRequest, res) => {
  try {
    const actor = req.studioUser!;
    const deptId = req.params.id;
    const userId = Number(req.body.userId);

    const [dept] = await db.select().from(departments).where(eq(departments.id, deptId));
    if (!dept) return res.status(404).json({ error: 'Department not found.' });

    const [target] = await db.select().from(users).where(eq(users.id, userId));
    if (!target) return res.status(404).json({ error: 'User not found.' });

    await db.transaction(async (tx) => {
      await tx.update(departments).set({ headUserId: userId }).where(eq(departments.id, deptId));
      await tx
        .insert(departmentMemberships)
        .values({
          userId,
          departmentId: deptId,
          deptRole: 'HEAD',
          assignedByUserId: actor.id,
        })
        .onConflictDoUpdate({
          target: [departmentMemberships.userId, departmentMemberships.departmentId],
          set: { deptRole: 'HEAD' },
        });
      if (target.role === 'MEMBER' || target.role === 'GUEST') {
        await tx.update(users).set({ role: 'DEPT_HEAD', updatedAt: new Date() }).where(eq(users.id, userId));
      }
    });

    await recordAudit({
      actorUserId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: 'DEPARTMENT_HEAD_ASSIGNED',
      entityType: 'DEPARTMENT',
      entityId: deptId,
      details: { userId, memberEmail: target.email },
      ipAddress: req.ip ?? null,
    });

    res.json({ ok: true });
  } catch (err) {
    console.error('Assign dept head error:', err);
    res.status(500).json({ error: 'Failed to assign department head.' });
  }
});

directorAdminRouter.post('/departments/:id/members', async (req: AuthRequest, res) => {
  try {
    const actor = req.studioUser!;
    const deptId = req.params.id;
    const userId = Number(req.body.userId);
    const deptRole = req.body.deptRole === 'LEAD' ? 'LEAD' : 'MEMBER';

    await db
      .insert(departmentMemberships)
      .values({
        userId,
        departmentId: deptId,
        deptRole,
        assignedByUserId: actor.id,
      })
      .onConflictDoUpdate({
        target: [departmentMemberships.userId, departmentMemberships.departmentId],
        set: { deptRole },
      });

    await recordAudit({
      actorUserId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: 'DEPARTMENT_MEMBER_ASSIGNED',
      entityType: 'DEPARTMENT',
      entityId: deptId,
      details: { userId, deptRole },
      ipAddress: req.ip ?? null,
    });

    res.json({ ok: true });
  } catch (err) {
    console.error('Assign dept member error:', err);
    res.status(500).json({ error: 'Failed to assign member to department.' });
  }
});

// Director-Only: Create future additional department (preserving official 10!)
const createDeptSchema = z.object({
  id: z.string().trim().regex(/^[a-z0-9-]+$/).min(2).max(40),
  prefix: z.string().trim().regex(/^[A-Z]{2,5}$/),
  name: z.string().trim().min(2).max(80),
  tagline: z.string().trim().min(4).max(160),
  description: z.string().trim().min(10).max(1000),
});

directorAdminRouter.post('/departments', requireDirectorOnly, async (req: AuthRequest, res) => {
  try {
    const actor = req.studioUser!;
    const parsed = createDeptSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid department schema.' });
    }

    const total = await db.select({ value: count() }).from(departments);
    const [created] = await db
      .insert(departments)
      .values({
        ...parsed.data,
        isOfficial: false,
        sortOrder: (total[0]?.value ?? 10) + 1,
        modules: [
          {
            key: `${parsed.data.id}_workspace`,
            title: `${parsed.data.name} Workspace`,
            description: 'Core creative records and production deliverables.',
            fields: ['Title', 'Lead', 'Milestone', 'Status'],
          },
        ],
      })
      .returning();

    await recordAudit({
      actorUserId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: 'DEPARTMENT_CREATED',
      entityType: 'DEPARTMENT',
      entityId: created.id,
      ipAddress: req.ip ?? null,
    });

    res.status(201).json({ department: created });
  } catch (err) {
    console.error('Create department error:', err);
    res.status(500).json({ error: 'Department ID or prefix already exists.' });
  }
});

// Read-Only Audit Logs
directorAdminRouter.get('/audit-logs', async (_req: AuthRequest, res) => {
  try {
    const logs = await db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(200);
    res.json({ logs });
  } catch (err) {
    console.error('Audit logs error:', err);
    res.status(500).json({ error: 'Failed to load audit records.' });
  }
});

// Integration & Studio Settings (Director-Only mutations)
directorAdminRouter.get('/integrations', async (_req: AuthRequest, res) => {
  try {
    const [configs, deliveries] = await Promise.all([
      db.select().from(integrationConfigs),
      db.select().from(notificationDeliveries).orderBy(desc(notificationDeliveries.createdAt)).limit(50),
    ]);

    res.json({
      configs,
      deliveries,
      environmentStatus: {
        smtpConfigured: Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS),
        twilioConfigured: Boolean(
          process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER
        ),
        msg91Configured: Boolean(process.env.MSG91_AUTH_KEY && process.env.MSG91_TEMPLATE_ID),
        whatsappConfigured: Boolean(process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_ACCESS_TOKEN),
        officialDirectorEmail: OFFICIAL_DIRECTOR_EMAIL,
        officialDirectorPhone: OFFICIAL_DIRECTOR_PHONE,
      },
    });
  } catch (err) {
    console.error('Integrations load error:', err);
    res.status(500).json({ error: 'Failed to load integration configurations.' });
  }
});

directorAdminRouter.put('/integrations/:key', requireDirectorOnly, async (req: AuthRequest, res) => {
  try {
    const actor = req.studioUser!;
    const key = req.params.key;
    const config = req.body.config;
    if (!config || typeof config !== 'object') {
      return res.status(400).json({ error: 'Invalid configuration object.' });
    }

    const [updated] = await db
      .insert(integrationConfigs)
      .values({ key, config, updatedByUserId: actor.id })
      .onConflictDoUpdate({
        target: integrationConfigs.key,
        set: { config, updatedByUserId: actor.id, updatedAt: new Date() },
      })
      .returning();

    await recordAudit({
      actorUserId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: 'INTEGRATION_CONFIG_UPDATED',
      entityType: 'CONFIG',
      entityId: key,
      ipAddress: req.ip ?? null,
    });

    res.json({ config: updated });
  } catch (err) {
    console.error('Update integration config error:', err);
    res.status(500).json({ error: 'Failed to update integration configuration.' });
  }
});

directorAdminRouter.post('/integrations/test-email', requireDirectorOnly, async (req: AuthRequest, res) => {
  try {
    const recipient = (req.body.to as string) || OFFICIAL_DIRECTOR_EMAIL;
    const delivery = await sendStudioEmail({
      to: recipient,
      subject: "Test Notification — Elder'sVeil Anime Studio",
      text: `This is a live configuration verification email from Elder'sVeil Anime Studio sent at ${new Date().toISOString()}.`,
      relatedEntityType: 'SYSTEM_TEST',
      relatedEntityId: 'EMAIL_TEST',
    });

    res.json({ delivery });
  } catch (err) {
    console.error('Test email error:', err);
    res.status(500).json({ error: 'Test email failed.' });
  }
});

directorAdminRouter.post('/integrations/test-sms', requireDirectorOnly, async (req: AuthRequest, res) => {
  try {
    const recipient = (req.body.to as string) || OFFICIAL_DIRECTOR_PHONE;
    const delivery = await sendStudioSms({
      to: recipient,
      message: `Elder'sVeil Anime Studio SMS test verified at ${new Date().toISOString().slice(0, 19)}Z.`,
      relatedEntityType: 'SYSTEM_TEST',
      relatedEntityId: 'SMS_TEST',
    });

    res.json({ delivery });
  } catch (err) {
    console.error('Test SMS error:', err);
    res.status(500).json({ error: 'Test SMS failed.' });
  }
});

directorAdminRouter.post('/deliveries/:id/retry', requireDirectorOnly, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const [row] = await db.select().from(notificationDeliveries).where(eq(notificationDeliveries.id, id));
    if (!row) return res.status(404).json({ error: 'Delivery record not found.' });

    const delivery =
      row.channel === 'EMAIL'
        ? await sendStudioEmail({
            to: row.recipient,
            subject: row.subject || "Elder'sVeil Anime Studio Notification",
            text: row.payloadSummary,
            relatedEntityType: row.relatedEntityType || undefined,
            relatedEntityId: row.relatedEntityId || undefined,
          })
        : await sendStudioSms({
            to: row.recipient,
            message: row.payloadSummary,
            relatedEntityType: row.relatedEntityType || undefined,
            relatedEntityId: row.relatedEntityId || undefined,
          });

    res.json({ delivery });
  } catch (err) {
    console.error('Retry delivery error:', err);
    res.status(500).json({ error: 'Failed to retry delivery.' });
  }
});

// Director-Only: Database Backup Snapshot Export
directorAdminRouter.get('/backup-export', requireDirectorOnly, async (req: AuthRequest, res) => {
  try {
    const actor = req.studioUser!;
    const [
      deptRows,
      userRows,
      membershipRows,
      appRows,
      projectRows,
      taskRows,
      storyRows,
      recordRows,
      submissionRows,
      announcementRows,
      calendarRows,
      auditRows,
    ] = await Promise.all([
      db.select().from(departments),
      db.select({
        id: users.id,
        memberId: users.memberId,
        email: users.email,
        fullName: users.fullName,
        role: users.role,
        status: users.status,
        createdAt: users.createdAt,
      }).from(users),
      db.select().from(departmentMemberships),
      db.select().from(applications),
      db.select().from(projects),
      db.select().from(tasks),
      db.select().from(storyEntries),
      db.select().from(departmentRecords),
      db.select().from(workSubmissions),
      db.select().from(announcements),
      db.select().from(calendarEvents),
      db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(500),
    ]);

    await recordAudit({
      actorUserId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: 'BACKUP_EXPORT_DOWNLOADED',
      entityType: 'SYSTEM',
      entityId: 'POSTGRES_SNAPSHOT',
      ipAddress: req.ip ?? null,
    });

    res.setHeader('Content-Disposition', `attachment; filename="eldersveil_backup_${new Date().toISOString().slice(0, 10)}.json"`);
    res.json({
      exportedAt: new Date().toISOString(),
      studio: "Elder'sVeil Anime Studio",
      tables: {
        departments: deptRows,
        users: userRows,
        departmentMemberships: membershipRows,
        applications: appRows,
        projects: projectRows,
        tasks: taskRows,
        storyEntries: storyRows,
        departmentRecords: recordRows,
        workSubmissions: submissionRows,
        announcements: announcementRows,
        calendarEvents: calendarRows,
        auditLogs: auditRows,
      },
    });
  } catch (err) {
    console.error('Backup export error:', err);
    res.status(500).json({ error: 'Failed to export database backup snapshot.' });
  }
});
