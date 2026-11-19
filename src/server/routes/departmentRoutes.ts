import { Router } from 'express';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/index.ts';
import {
  announcements,
  calendarEvents,
  departmentMemberships,
  departmentRecords,
  departments,
  fileAssets,
  projects,
  storyEntries,
  tasks,
  users,
  workSubmissions,
} from '../../db/schema.ts';
import {
  requireAuth,
  requireStudioMember,
  userCanAccessDepartment,
  type AuthRequest,
} from '../middleware/auth.ts';
import { recordAudit } from '../services/auditService.ts';
import { streamStoryPdf } from '../services/pdfService.ts';
import { CREATIVE_SOFTWARE_LIBRARY } from '../../data/officialDepartments.ts';

export const departmentRouter = Router();
departmentRouter.use(requireAuth, requireStudioMember);

// Story Studio Specific Routes (placed before :deptId param routes)
departmentRouter.get('/story/entries', async (req: AuthRequest, res) => {
  try {
    const user = req.studioUser!;
    if (!userCanAccessDepartment(user, 'story') && !['DIRECTOR', 'ADMIN'].includes(user.role)) {
      return res.status(403).json({ error: 'You do not have access to the Story / Writing Department.' });
    }

    const entries = await db.select().from(storyEntries).orderBy(desc(storyEntries.updatedAt));
    res.json({ entries });
  } catch (err) {
    console.error('Story entries error:', err);
    res.status(500).json({ error: 'Failed to load story entries.' });
  }
});

const storySchema = z.object({
  projectId: z.number().int().optional().nullable(),
  universe: z.string().trim().min(1).default("Elder'sVeil Core Universe"),
  saga: z.string().trim().min(1),
  arc: z.string().trim().min(1),
  volume: z.string().trim().min(1),
  chapterNumber: z.number().int().min(1).default(1),
  chapterTitle: z.string().trim().min(1),
  sceneNumber: z.number().int().min(1).default(1),
  scriptText: z.string().trim().min(5),
  dialogueNotes: z.string().optional().nullable(),
  continuityNotes: z.string().optional().nullable(),
  linkedRecordIds: z.array(z.number().int()).optional(),
  status: z.enum(['DRAFT', 'IN_REVIEW', 'APPROVED']).default('DRAFT'),
});

departmentRouter.post('/story/entries', async (req: AuthRequest, res) => {
  try {
    const actor = req.studioUser!;
    if (!userCanAccessDepartment(actor, 'story')) {
      return res.status(403).json({ error: 'Access denied to Story / Writing workspace.' });
    }

    const parsed = storySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid story fields.' });
    }

    const [created] = await db
      .insert(storyEntries)
      .values({
        ...parsed.data,
        departmentId: 'story',
        authorUserId: actor.id,
        revisionNumber: 1,
        revisionHistory: [
          {
            revision: 1,
            editedBy: actor.fullName,
            note: 'Initial story entry created',
            timestamp: new Date().toISOString(),
          },
        ],
      })
      .returning();

    await recordAudit({
      actorUserId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: 'STORY_ENTRY_CREATED',
      entityType: 'STORY',
      entityId: created.id,
      ipAddress: req.ip ?? null,
    });

    res.status(201).json({ entry: created });
  } catch (err) {
    console.error('Create story entry error:', err);
    res.status(500).json({ error: 'Failed to create story entry.' });
  }
});

departmentRouter.patch('/story/entries/:id', async (req: AuthRequest, res) => {
  try {
    const actor = req.studioUser!;
    if (!userCanAccessDepartment(actor, 'story')) {
      return res.status(403).json({ error: 'Access denied to Story / Writing workspace.' });
    }

    const id = Number(req.params.id);
    const [existing] = await db.select().from(storyEntries).where(eq(storyEntries.id, id));
    if (!existing) return res.status(404).json({ error: 'Story entry not found.' });

    const nextRev = existing.revisionNumber + 1;
    const nextHistory = [
      ...(existing.revisionHistory || []),
      {
        revision: nextRev,
        editedBy: actor.fullName,
        note: String(req.body.revisionNote || 'Updated script & continuity'),
        timestamp: new Date().toISOString(),
      },
    ];

    const [updated] = await db
      .update(storyEntries)
      .set({
        universe: req.body.universe ?? existing.universe,
        saga: req.body.saga ?? existing.saga,
        arc: req.body.arc ?? existing.arc,
        volume: req.body.volume ?? existing.volume,
        chapterNumber: req.body.chapterNumber ?? existing.chapterNumber,
        chapterTitle: req.body.chapterTitle ?? existing.chapterTitle,
        sceneNumber: req.body.sceneNumber ?? existing.sceneNumber,
        scriptText: req.body.scriptText ?? existing.scriptText,
        dialogueNotes: req.body.dialogueNotes !== undefined ? req.body.dialogueNotes : existing.dialogueNotes,
        continuityNotes:
          req.body.continuityNotes !== undefined ? req.body.continuityNotes : existing.continuityNotes,
        linkedRecordIds: Array.isArray(req.body.linkedRecordIds)
          ? req.body.linkedRecordIds
          : existing.linkedRecordIds,
        status: req.body.status ?? existing.status,
        revisionNumber: nextRev,
        revisionHistory: nextHistory,
        updatedAt: new Date(),
      })
      .where(eq(storyEntries.id, id))
      .returning();

    res.json({ entry: updated });
  } catch (err) {
    console.error('Update story entry error:', err);
    res.status(500).json({ error: 'Failed to update story entry.' });
  }
});

departmentRouter.get('/story/entries/:id/pdf', async (req: AuthRequest, res) => {
  try {
    const actor = req.studioUser!;
    if (!userCanAccessDepartment(actor, 'story')) {
      return res.status(403).json({ error: 'Access denied to Story-to-PDF export.' });
    }

    const id = Number(req.params.id);
    const [entry] = await db.select().from(storyEntries).where(eq(storyEntries.id, id));
    if (!entry) return res.status(404).json({ error: 'Story entry not found.' });

    let linkedItems: Array<{ title: string; departmentId: string; moduleKey: string }> = [];
    if (entry.linkedRecordIds && entry.linkedRecordIds.length > 0) {
      linkedItems = await db
        .select({
          title: departmentRecords.title,
          departmentId: departmentRecords.departmentId,
          moduleKey: departmentRecords.moduleKey,
        })
        .from(departmentRecords)
        .where(inArray(departmentRecords.id, entry.linkedRecordIds));
    }

    await recordAudit({
      actorUserId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: 'STORY_PDF_EXPORTED',
      entityType: 'STORY',
      entityId: id,
      ipAddress: req.ip ?? null,
    });

    streamStoryPdf(res, {
      ...entry,
      linkedItems,
    });
  } catch (err) {
    console.error('PDF export error:', err);
    res.status(500).json({ error: 'Failed to generate PDF.' });
  }
});

// Generic Independent Department Workplace Routes (All 10 Departments)
departmentRouter.get('/:deptId/workspace', async (req: AuthRequest, res) => {
  try {
    const user = req.studioUser!;
    const deptId = req.params.deptId;

    const [dept] = await db.select().from(departments).where(eq(departments.id, deptId));
    if (!dept) return res.status(404).json({ error: 'Department not found.' });

    if (!userCanAccessDepartment(user, deptId)) {
      return res.status(403).json({
        error: `Access denied: you are not assigned to the ${dept.name} Department.`,
      });
    }

    const [
      membershipRows,
      allUsers,
      allProjects,
      deptTasks,
      deptEvents,
      deptAnnouncements,
      deptFiles,
      deptSubmissions,
      deptRecords,
      allStoryEntries,
    ] = await Promise.all([
      db.select().from(departmentMemberships).where(eq(departmentMemberships.departmentId, deptId)),
      db.select({ id: users.id, memberId: users.memberId, fullName: users.fullName, email: users.email, role: users.role }).from(users),
      db.select().from(projects).orderBy(desc(projects.updatedAt)),
      db.select().from(tasks).where(eq(tasks.departmentId, deptId)).orderBy(desc(tasks.createdAt)),
      db.select().from(calendarEvents).where(eq(calendarEvents.departmentId, deptId)),
      db
        .select()
        .from(announcements)
        .where(eq(announcements.departmentId, deptId))
        .orderBy(desc(announcements.createdAt)),
      db.select().from(fileAssets).where(eq(fileAssets.departmentId, deptId)).orderBy(desc(fileAssets.createdAt)),
      db.select().from(workSubmissions).where(eq(workSubmissions.departmentId, deptId)).orderBy(desc(workSubmissions.updatedAt)),
      db.select().from(departmentRecords).where(eq(departmentRecords.departmentId, deptId)).orderBy(desc(departmentRecords.updatedAt)),
      db.select({ id: storyEntries.id, chapterTitle: storyEntries.chapterTitle, saga: storyEntries.saga, chapterNumber: storyEntries.chapterNumber }).from(storyEntries),
    ]);

    const headUser = allUsers.find((u) => u.id === dept.headUserId) || null;
    const deptMembers = membershipRows
      .map((m) => {
        const u = allUsers.find((usr) => usr.id === m.userId);
        return u ? { ...u, deptRole: m.deptRole } : null;
      })
      .filter(Boolean);

    const deptProjects = allProjects.filter((p) => p.departmentIds.includes(deptId));
    const tools = CREATIVE_SOFTWARE_LIBRARY.filter((t) => t.departments.includes(deptId));

    res.json({
      department: dept,
      headUser,
      members: deptMembers,
      projects: deptProjects,
      tasks: deptTasks,
      calendarEvents: deptEvents,
      announcements: deptAnnouncements,
      files: deptFiles.filter((f) => !f.deletedAt && !f.isPublicApplicantFile),
      submissions: deptSubmissions,
      records: deptRecords,
      storyEntries: allStoryEntries,
      recommendedTools: tools,
    });
  } catch (err) {
    console.error('Department workspace error:', err);
    res.status(500).json({ error: 'Failed to load department workplace.' });
  }
});

const recordSchema = z.object({
  moduleKey: z.string().trim().min(2).max(80),
  title: z.string().trim().min(2).max(160),
  classification: z.enum(['HISTORICAL', 'FICTIONAL', 'ORIGINAL', 'REFERENCE', 'PRODUCTION']).default('ORIGINAL'),
  summary: z.string().trim().min(4).max(4000),
  metadata: z.record(z.string(), z.string()).default({}),
  projectId: z.number().int().optional().nullable(),
  linkedStoryEntryId: z.number().int().optional().nullable(),
});

departmentRouter.post('/:deptId/records', async (req: AuthRequest, res) => {
  try {
    const actor = req.studioUser!;
    const deptId = req.params.deptId;
    if (!userCanAccessDepartment(actor, deptId)) {
      return res.status(403).json({ error: 'Unauthorized department access.' });
    }

    const parsed = recordSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid module record.' });
    }

    const [created] = await db
      .insert(departmentRecords)
      .values({
        departmentId: deptId,
        ...parsed.data,
        createdByUserId: actor.id,
      })
      .returning();

    await recordAudit({
      actorUserId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: 'DEPARTMENT_RECORD_CREATED',
      entityType: 'DEPARTMENT_RECORD',
      entityId: created.id,
      details: { departmentId: deptId, moduleKey: created.moduleKey, title: created.title },
      ipAddress: req.ip ?? null,
    });

    res.status(201).json({ record: created });
  } catch (err) {
    console.error('Create department record error:', err);
    res.status(500).json({ error: 'Failed to save department record.' });
  }
});

departmentRouter.delete('/:deptId/records/:recordId', async (req: AuthRequest, res) => {
  try {
    const actor = req.studioUser!;
    const deptId = req.params.deptId;
    const recordId = Number(req.params.recordId);

    if (!userCanAccessDepartment(actor, deptId)) {
      return res.status(403).json({ error: 'Unauthorized department access.' });
    }

    const [existing] = await db
      .select()
      .from(departmentRecords)
      .where(and(eq(departmentRecords.id, recordId), eq(departmentRecords.departmentId, deptId)));
    if (!existing) return res.status(404).json({ error: 'Record not found.' });

    if (
      existing.createdByUserId !== actor.id &&
      !['DIRECTOR', 'ADMIN', 'DEPT_HEAD'].includes(actor.role)
    ) {
      return res.status(403).json({ error: 'Only the creator or department leadership may delete this entry.' });
    }

    await db.delete(departmentRecords).where(eq(departmentRecords.id, recordId));
    res.json({ ok: true });
  } catch (err) {
    console.error('Delete department record error:', err);
    res.status(500).json({ error: 'Failed to delete department record.' });
  }
});
