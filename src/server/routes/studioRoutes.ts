import fs from 'fs';
import { Router } from 'express';
import { and, asc, desc, eq, isNull, or } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/index.ts';
import {
  announcements,
  calendarEvents,
  departments,
  discussions,
  fileAssets,
  notifications,
  projectMembers,
  projects,
  taskComments,
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
import { createInternalNotification, getSocketIO } from '../services/notificationService.ts';
import { ALLOWED_EXTENSIONS, createSafeUploader, resolveSafeUploadPath } from '../utils/uploads.ts';
import { CREATIVE_SOFTWARE_LIBRARY, PRODUCTION_PIPELINE_STAGES } from '../../data/officialDepartments.ts';

export const studioRouter = Router();
studioRouter.use(requireAuth, requireStudioMember);

const studioUpload = createSafeUploader(ALLOWED_EXTENSIONS, 20);

// Creative Software Library & Pipeline Metadata
studioRouter.get('/creative-tools', (_req: AuthRequest, res) => {
  res.json({ tools: CREATIVE_SOFTWARE_LIBRARY, pipelineStages: PRODUCTION_PIPELINE_STAGES });
});

// Member Personal Dashboard Summary
studioRouter.get('/my-workspace', async (req: AuthRequest, res) => {
  try {
    const user = req.studioUser!;
    const deptIds = user.departments.map((d) => d.departmentId);

    const [allProjects, allTasks, allSubmissions, allAnnouncements, allEvents, myNotifs] = await Promise.all([
      db.select().from(projects).orderBy(desc(projects.updatedAt)),
      db.select().from(tasks).orderBy(asc(tasks.deadline)),
      db.select().from(workSubmissions).orderBy(desc(workSubmissions.updatedAt)),
      db.select().from(announcements).orderBy(desc(announcements.createdAt)).limit(20),
      db.select().from(calendarEvents).orderBy(asc(calendarEvents.startsAt)).limit(20),
      db
        .select()
        .from(notifications)
        .where(or(eq(notifications.recipientUserId, user.id), eq(notifications.recipientRole, user.role)))
        .orderBy(desc(notifications.createdAt))
        .limit(30),
    ]);

    const myTasks = allTasks.filter(
      (t) =>
        t.assigneeUserId === user.id ||
        user.role === 'DIRECTOR' ||
        user.role === 'ADMIN' ||
        deptIds.includes(t.departmentId)
    );

    const myProjects = allProjects.filter(
      (p) =>
        user.role === 'DIRECTOR' ||
        user.role === 'ADMIN' ||
        p.leaderUserId === user.id ||
        p.departmentIds.some((d) => deptIds.includes(d))
    );

    const visibleAnnouncements = allAnnouncements.filter(
      (a) => a.scope === 'STUDIO' || (a.departmentId && deptIds.includes(a.departmentId)) || user.role === 'DIRECTOR'
    );

    res.json({
      user,
      projects: myProjects,
      tasks: myTasks,
      submissions: allSubmissions.filter(
        (s) => s.submittedByUserId === user.id || user.role === 'DIRECTOR' || user.role === 'ADMIN' || deptIds.includes(s.departmentId)
      ),
      announcements: visibleAnnouncements,
      calendarEvents: allEvents,
      notifications: myNotifs,
    });
  } catch (err) {
    console.error('My workspace error:', err);
    res.status(500).json({ error: 'Failed to load personal workspace.' });
  }
});

// Projects CRUD & 9-Stage Production Pipeline
studioRouter.get('/projects', async (req: AuthRequest, res) => {
  try {
    const user = req.studioUser!;
    const deptIds = user.departments.map((d) => d.departmentId);
    const [allProjects, allUsers] = await Promise.all([
      db.select().from(projects).orderBy(desc(projects.updatedAt)),
      db.select({ id: users.id, fullName: users.fullName, memberId: users.memberId, role: users.role }).from(users),
    ]);

    const visible =
      user.role === 'DIRECTOR' || user.role === 'ADMIN'
        ? allProjects
        : allProjects.filter((p) => p.leaderUserId === user.id || p.departmentIds.some((d) => deptIds.includes(d)));

    res.json({
      projects: visible.map((p) => ({
        ...p,
        leader: allUsers.find((u) => u.id === p.leaderUserId) || null,
      })),
      pipelineStages: PRODUCTION_PIPELINE_STAGES,
    });
  } catch (err) {
    console.error('List projects error:', err);
    res.status(500).json({ error: 'Failed to load projects.' });
  }
});

const createProjectSchema = z.object({
  title: z.string().trim().min(3).max(160),
  description: z.string().trim().min(10).max(3000),
  departmentIds: z.array(z.string().trim()).min(1),
  primaryDepartmentId: z.string().trim().optional(),
  leaderUserId: z.number().int().optional().nullable(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
  productionStage: z.string().trim().default('STAGE_1_RESEARCH'),
  startDate: z.string().optional(),
  deadline: z.string().optional(),
  dependencies: z.array(z.string()).optional(),
  milestones: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        dueDate: z.string(),
        completed: z.boolean(),
      })
    )
    .optional(),
});

studioRouter.post('/projects', async (req: AuthRequest, res) => {
  try {
    const actor = req.studioUser!;
    if (!['DIRECTOR', 'ADMIN', 'DEPT_HEAD'].includes(actor.role)) {
      return res.status(403).json({ error: 'Only Directors, Admins, or Department Heads may create projects.' });
    }

    const parsed = createProjectSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid project data.' });
    }

    const code = `EV-PRJ-${Math.floor(100 + Math.random() * 900)}`;
    const [created] = await db
      .insert(projects)
      .values({
        code,
        title: parsed.data.title,
        description: parsed.data.description,
        departmentIds: parsed.data.departmentIds,
        primaryDepartmentId: parsed.data.primaryDepartmentId || parsed.data.departmentIds[0],
        leaderUserId: parsed.data.leaderUserId ?? actor.id,
        priority: parsed.data.priority,
        productionStage: parsed.data.productionStage,
        startDate: parsed.data.startDate || new Date().toISOString().slice(0, 10),
        deadline: parsed.data.deadline || null,
        milestones: parsed.data.milestones || [],
        dependencies: parsed.data.dependencies || [],
        createdByUserId: actor.id,
      })
      .returning();

    await db
      .insert(projectMembers)
      .values({ projectId: created.id, userId: created.leaderUserId || actor.id, projectRole: 'LEADER' })
      .onConflictDoNothing();

    await recordAudit({
      actorUserId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: 'PROJECT_CREATED',
      entityType: 'PROJECT',
      entityId: created.code,
      details: { title: created.title, departments: created.departmentIds },
      ipAddress: req.ip ?? null,
    });

    res.status(201).json({ project: created });
  } catch (err) {
    console.error('Create project error:', err);
    res.status(500).json({ error: 'Failed to create project.' });
  }
});

studioRouter.patch('/projects/:id', async (req: AuthRequest, res) => {
  try {
    const actor = req.studioUser!;
    const id = Number(req.params.id);
    const [existing] = await db.select().from(projects).where(eq(projects.id, id));
    if (!existing) return res.status(404).json({ error: 'Project not found.' });

    if (!['DIRECTOR', 'ADMIN', 'DEPT_HEAD'].includes(actor.role) && existing.leaderUserId !== actor.id) {
      return res.status(403).json({ error: 'Not authorized to modify this project.' });
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (req.body.productionStage) updates.productionStage = String(req.body.productionStage);
    if (req.body.status) updates.status = String(req.body.status);
    if (req.body.progress !== undefined) updates.progress = Math.max(0, Math.min(100, Number(req.body.progress)));
    if (Array.isArray(req.body.milestones)) updates.milestones = req.body.milestones;
    if (Array.isArray(req.body.departmentIds)) updates.departmentIds = req.body.departmentIds;

    const [updated] = await db.update(projects).set(updates).where(eq(projects.id, id)).returning();

    await recordAudit({
      actorUserId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: 'PROJECT_UPDATED',
      entityType: 'PROJECT',
      entityId: updated.code,
      details: updates,
      ipAddress: req.ip ?? null,
    });

    res.json({ project: updated });
  } catch (err) {
    console.error('Update project error:', err);
    res.status(500).json({ error: 'Failed to update project.' });
  }
});

// Tasks & Comments
studioRouter.get('/tasks', async (req: AuthRequest, res) => {
  try {
    const user = req.studioUser!;
    const [allTasks, allComments, allUsers] = await Promise.all([
      db.select().from(tasks).orderBy(desc(tasks.createdAt)),
      db.select().from(taskComments).orderBy(asc(taskComments.createdAt)),
      db.select({ id: users.id, fullName: users.fullName, memberId: users.memberId }).from(users),
    ]);

    const visible = allTasks.filter(
      (t) =>
        user.role === 'DIRECTOR' ||
        user.role === 'ADMIN' ||
        t.assigneeUserId === user.id ||
        userCanAccessDepartment(user, t.departmentId)
    );

    res.json({
      tasks: visible.map((t) => ({
        ...t,
        assignee: allUsers.find((u) => u.id === t.assigneeUserId) || null,
        comments: allComments
          .filter((c) => c.taskId === t.id)
          .map((c) => ({ ...c, author: allUsers.find((u) => u.id === c.authorUserId) || null })),
      })),
    });
  } catch (err) {
    console.error('List tasks error:', err);
    res.status(500).json({ error: 'Failed to load tasks.' });
  }
});

const createTaskSchema = z.object({
  title: z.string().trim().min(2).max(160),
  description: z.string().trim().min(2).max(2000),
  departmentId: z.string().trim().min(2),
  projectId: z.number().int().optional().nullable(),
  assigneeUserId: z.number().int().optional().nullable(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
  deadline: z.string().optional().nullable(),
});

studioRouter.post('/tasks', async (req: AuthRequest, res) => {
  try {
    const actor = req.studioUser!;
    const parsed = createTaskSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid task.' });
    }
    if (!userCanAccessDepartment(actor, parsed.data.departmentId)) {
      return res.status(403).json({ error: 'You do not have access to create tasks in this department.' });
    }

    const [created] = await db
      .insert(tasks)
      .values({
        ...parsed.data,
        assigneeUserId: parsed.data.assigneeUserId ?? actor.id,
        createdByUserId: actor.id,
      })
      .returning();

    if (created.assigneeUserId && created.assigneeUserId !== actor.id) {
      await createInternalNotification({
        recipientUserId: created.assigneeUserId,
        type: 'TASK_ASSIGNED',
        title: `New Task Assigned: ${created.title}`,
        body: `Department: ${created.departmentId} · Priority: ${created.priority}`,
        linkTab: 'tasks',
      });
    }

    await recordAudit({
      actorUserId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: 'TASK_CREATED',
      entityType: 'TASK',
      entityId: created.id,
      ipAddress: req.ip ?? null,
    });

    res.status(201).json({ task: created });
  } catch (err) {
    console.error('Create task error:', err);
    res.status(500).json({ error: 'Failed to create task.' });
  }
});

studioRouter.patch('/tasks/:id', async (req: AuthRequest, res) => {
  try {
    const actor = req.studioUser!;
    const id = Number(req.params.id);
    const [existing] = await db.select().from(tasks).where(eq(tasks.id, id));
    if (!existing) return res.status(404).json({ error: 'Task not found.' });
    if (!userCanAccessDepartment(actor, existing.departmentId) && existing.assigneeUserId !== actor.id) {
      return res.status(403).json({ error: 'Forbidden.' });
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (req.body.status) updates.status = String(req.body.status);
    if (req.body.priority) updates.priority = String(req.body.priority);
    if (req.body.assigneeUserId !== undefined) updates.assigneeUserId = req.body.assigneeUserId;

    const [updated] = await db.update(tasks).set(updates).where(eq(tasks.id, id)).returning();
    res.json({ task: updated });
  } catch (err) {
    console.error('Update task error:', err);
    res.status(500).json({ error: 'Failed to update task.' });
  }
});

studioRouter.post('/tasks/:id/comments', async (req: AuthRequest, res) => {
  try {
    const actor = req.studioUser!;
    const taskId = Number(req.params.id);
    const body = String(req.body.body || '').trim();
    if (!body) return res.status(400).json({ error: 'Comment text is required.' });

    const [created] = await db
      .insert(taskComments)
      .values({ taskId, authorUserId: actor.id, body })
      .returning();

    res.status(201).json({ comment: { ...created, author: { id: actor.id, fullName: actor.fullName } } });
  } catch (err) {
    console.error('Add task comment error:', err);
    res.status(500).json({ error: 'Failed to post comment.' });
  }
});

// Calendar Events
studioRouter.get('/calendar', async (_req: AuthRequest, res) => {
  try {
    const events = await db.select().from(calendarEvents).orderBy(asc(calendarEvents.startsAt));
    res.json({ events });
  } catch (err) {
    console.error('Calendar error:', err);
    res.status(500).json({ error: 'Failed to load calendar.' });
  }
});

studioRouter.post('/calendar', async (req: AuthRequest, res) => {
  try {
    const actor = req.studioUser!;
    const title = String(req.body.title || '').trim();
    const startsAt = String(req.body.startsAt || '').trim();
    if (!title || !startsAt) return res.status(400).json({ error: 'Title and start time are required.' });

    const [created] = await db
      .insert(calendarEvents)
      .values({
        title,
        description: req.body.description || null,
        eventType: req.body.eventType || 'STUDIO',
        departmentId: req.body.departmentId || null,
        projectId: req.body.projectId ? Number(req.body.projectId) : null,
        startsAt,
        endsAt: req.body.endsAt || null,
        createdByUserId: actor.id,
      })
      .returning();

    res.status(201).json({ event: created });
  } catch (err) {
    console.error('Create calendar event error:', err);
    res.status(500).json({ error: 'Failed to create event.' });
  }
});

// File Management & Creative Asset Library
studioRouter.get('/files', async (req: AuthRequest, res) => {
  try {
    const user = req.studioUser!;
    const rows = await db
      .select()
      .from(fileAssets)
      .where(isNull(fileAssets.deletedAt))
      .orderBy(desc(fileAssets.createdAt));

    const visible = rows.filter(
      (f) =>
        user.role === 'DIRECTOR' ||
        user.role === 'ADMIN' ||
        (!f.isPublicApplicantFile && (!f.departmentId || userCanAccessDepartment(user, f.departmentId)))
    );

    res.json({ files: visible });
  } catch (err) {
    console.error('List files error:', err);
    res.status(500).json({ error: 'Failed to load asset library.' });
  }
});

studioRouter.post('/files/upload', studioUpload.single('file'), async (req: AuthRequest, res) => {
  try {
    const actor = req.studioUser!;
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'File is required.' });

    const departmentId = req.body.departmentId ? String(req.body.departmentId) : null;
    if (departmentId && !userCanAccessDepartment(actor, departmentId)) {
      fs.unlink(file.path, () => {});
      return res.status(403).json({ error: 'Cannot upload files to an unauthorized department.' });
    }

    const parentAssetId = req.body.parentAssetId ? Number(req.body.parentAssetId) : null;
    let nextVersion = 1;
    if (parentAssetId) {
      const [parent] = await db.select().from(fileAssets).where(eq(fileAssets.id, parentAssetId));
      if (parent) nextVersion = parent.version + 1;
    }

    const tags = String(req.body.tags || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const [created] = await db
      .insert(fileAssets)
      .values({
        storedName: file.filename,
        originalName: file.originalname,
        mimeType: file.mimetype || 'application/octet-stream',
        sizeBytes: file.size,
        folder: String(req.body.folder || 'general'),
        assetCategory: String(req.body.assetCategory || 'DOCUMENT'),
        tags,
        departmentId,
        projectId: req.body.projectId ? Number(req.body.projectId) : null,
        uploadedByUserId: actor.id,
        version: nextVersion,
        parentAssetId,
      })
      .returning();

    await recordAudit({
      actorUserId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: 'FILE_UPLOADED',
      entityType: 'FILE',
      entityId: created.id,
      details: { originalName: created.originalName, category: created.assetCategory, departmentId },
      ipAddress: req.ip ?? null,
    });

    res.status(201).json({ file: created });
  } catch (err: unknown) {
    console.error('Upload error:', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'File upload failed.' });
  }
});

studioRouter.get('/files/:id/download', async (req: AuthRequest, res) => {
  try {
    const user = req.studioUser!;
    const id = Number(req.params.id);
    const [asset] = await db.select().from(fileAssets).where(and(eq(fileAssets.id, id), isNull(fileAssets.deletedAt)));
    if (!asset) return res.status(404).json({ error: 'File not found.' });

    if (
      asset.isPublicApplicantFile &&
      !['DIRECTOR', 'ADMIN'].includes(user.role)
    ) {
      return res.status(403).json({ error: 'Applicant files are restricted to studio administration.' });
    }
    if (asset.departmentId && !userCanAccessDepartment(user, asset.departmentId)) {
      return res.status(403).json({ error: 'Forbidden.' });
    }

    const safePath = resolveSafeUploadPath(asset.storedName);
    if (!safePath || !fs.existsSync(safePath)) {
      return res.status(404).json({ error: 'File payload missing from storage.' });
    }

    await recordAudit({
      actorUserId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: 'FILE_DOWNLOADED',
      entityType: 'FILE',
      entityId: asset.id,
      ipAddress: req.ip ?? null,
    });

    res.download(safePath, asset.originalName);
  } catch (err) {
    console.error('Download error:', err);
    res.status(500).json({ error: 'Failed to download file.' });
  }
});

studioRouter.delete('/files/:id', async (req: AuthRequest, res) => {
  try {
    const actor = req.studioUser!;
    const id = Number(req.params.id);
    const [asset] = await db.select().from(fileAssets).where(eq(fileAssets.id, id));
    if (!asset) return res.status(404).json({ error: 'File not found.' });

    if (asset.uploadedByUserId !== actor.id && !['DIRECTOR', 'ADMIN'].includes(actor.role)) {
      return res.status(403).json({ error: 'Not authorized to delete this file.' });
    }

    await db.update(fileAssets).set({ deletedAt: new Date() }).where(eq(fileAssets.id, id));

    await recordAudit({
      actorUserId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: 'FILE_DELETED',
      entityType: 'FILE',
      entityId: id,
      details: { originalName: asset.originalName },
      ipAddress: req.ip ?? null,
    });

    res.json({ ok: true });
  } catch (err) {
    console.error('Delete file error:', err);
    res.status(500).json({ error: 'Failed to delete file.' });
  }
});

// Work Submission & Review Workflow
studioRouter.get('/submissions', async (req: AuthRequest, res) => {
  try {
    const user = req.studioUser!;
    const [rows, allUsers] = await Promise.all([
      db.select().from(workSubmissions).orderBy(desc(workSubmissions.updatedAt)),
      db.select({ id: users.id, fullName: users.fullName, memberId: users.memberId }).from(users),
    ]);

    const visible = rows.filter(
      (s) => user.role === 'DIRECTOR' || user.role === 'ADMIN' || userCanAccessDepartment(user, s.departmentId)
    );

    res.json({
      submissions: visible.map((s) => ({
        ...s,
        submitter: allUsers.find((u) => u.id === s.submittedByUserId) || null,
        reviewer: allUsers.find((u) => u.id === s.reviewerUserId) || null,
      })),
    });
  } catch (err) {
    console.error('List submissions error:', err);
    res.status(500).json({ error: 'Failed to load work submissions.' });
  }
});

studioRouter.post('/submissions', async (req: AuthRequest, res) => {
  try {
    const actor = req.studioUser!;
    const title = String(req.body.title || '').trim();
    const description = String(req.body.description || '').trim();
    const departmentId = String(req.body.departmentId || '').trim();
    if (!title || !description || !departmentId) {
      return res.status(400).json({ error: 'Title, description, and department are required.' });
    }
    if (!userCanAccessDepartment(actor, departmentId)) {
      return res.status(403).json({ error: 'Unauthorized department.' });
    }

    const initialStatus = req.body.status === 'DRAFT' ? 'DRAFT' : 'SUBMITTED';
    const [created] = await db
      .insert(workSubmissions)
      .values({
        title,
        description,
        departmentId,
        projectId: req.body.projectId ? Number(req.body.projectId) : null,
        taskId: req.body.taskId ? Number(req.body.taskId) : null,
        fileAssetId: req.body.fileAssetId ? Number(req.body.fileAssetId) : null,
        submittedByUserId: actor.id,
        status: initialStatus,
        history: [
          {
            status: initialStatus,
            actorName: actor.fullName,
            note: 'Created work submission',
            timestamp: new Date().toISOString(),
          },
        ],
      })
      .returning();

    if (initialStatus === 'SUBMITTED') {
      await createInternalNotification({
        recipientRole: 'DIRECTOR',
        type: 'WORK_SUBMITTED',
        title: `Work Submitted: ${title}`,
        body: `By ${actor.fullName} in ${departmentId}`,
        linkTab: 'reviews',
      });
    }

    await recordAudit({
      actorUserId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: 'WORK_SUBMISSION_CREATED',
      entityType: 'SUBMISSION',
      entityId: created.id,
      ipAddress: req.ip ?? null,
    });

    res.status(201).json({ submission: created });
  } catch (err) {
    console.error('Create submission error:', err);
    res.status(500).json({ error: 'Failed to create work submission.' });
  }
});

studioRouter.post('/submissions/:id/transition', async (req: AuthRequest, res) => {
  try {
    const actor = req.studioUser!;
    const id = Number(req.params.id);
    const nextStatus = String(req.body.status || '');
    const note = String(req.body.note || '').trim();

    const valid = ['SUBMITTED', 'UNDER_REVIEW', 'REVISION_REQUESTED', 'RESUBMITTED', 'APPROVED'];
    if (!valid.includes(nextStatus)) {
      return res.status(400).json({ error: 'Invalid workflow status.' });
    }

    const [existing] = await db.select().from(workSubmissions).where(eq(workSubmissions.id, id));
    if (!existing) return res.status(404).json({ error: 'Submission not found.' });

    const isReviewerAction = ['UNDER_REVIEW', 'REVISION_REQUESTED', 'APPROVED'].includes(nextStatus);
    if (isReviewerAction && !['DIRECTOR', 'ADMIN', 'DEPT_HEAD'].includes(actor.role)) {
      return res.status(403).json({ error: 'Only Directors, Admins, or Department Heads can review or approve.' });
    }

    const nextHistory = [
      ...(existing.history || []),
      {
        status: nextStatus,
        actorName: actor.fullName,
        note: note || `Transitioned to ${nextStatus}`,
        timestamp: new Date().toISOString(),
      },
    ];

    const [updated] = await db
      .update(workSubmissions)
      .set({
        status: nextStatus,
        reviewerUserId: isReviewerAction ? actor.id : existing.reviewerUserId,
        feedback: note || existing.feedback,
        revisionCount:
          nextStatus === 'REVISION_REQUESTED' ? existing.revisionCount + 1 : existing.revisionCount,
        history: nextHistory,
        updatedAt: new Date(),
      })
      .where(eq(workSubmissions.id, id))
      .returning();

    await createInternalNotification({
      recipientUserId: existing.submittedByUserId,
      type: 'REVIEW_UPDATE',
      title: `Review Update (${nextStatus}): ${existing.title}`,
      body: note || `Status updated by ${actor.fullName}`,
      linkTab: 'reviews',
    });

    await recordAudit({
      actorUserId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: `SUBMISSION_${nextStatus}`,
      entityType: 'SUBMISSION',
      entityId: id,
      details: { note },
      ipAddress: req.ip ?? null,
    });

    res.json({ submission: updated });
  } catch (err) {
    console.error('Transition submission error:', err);
    res.status(500).json({ error: 'Failed to update submission state.' });
  }
});

// Announcements
studioRouter.post('/announcements', async (req: AuthRequest, res) => {
  try {
    const actor = req.studioUser!;
    const scope = req.body.scope === 'DEPARTMENT' ? 'DEPARTMENT' : 'STUDIO';
    const departmentId = req.body.departmentId ? String(req.body.departmentId) : null;

    if (scope === 'STUDIO' && !['DIRECTOR', 'ADMIN'].includes(actor.role)) {
      return res.status(403).json({ error: 'Only Directors or Admins may publish studio-wide announcements.' });
    }
    if (scope === 'DEPARTMENT' && !['DIRECTOR', 'ADMIN', 'DEPT_HEAD'].includes(actor.role)) {
      return res.status(403).json({ error: 'Only Department Heads or Administration may post department announcements.' });
    }

    const title = String(req.body.title || '').trim();
    const body = String(req.body.body || '').trim();
    if (!title || !body) return res.status(400).json({ error: 'Title and message are required.' });

    const [created] = await db
      .insert(announcements)
      .values({
        title,
        body,
        scope,
        departmentId,
        authorUserId: actor.id,
        pinned: Boolean(req.body.pinned),
      })
      .returning();

    res.status(201).json({ announcement: created });
  } catch (err) {
    console.error('Create announcement error:', err);
    res.status(500).json({ error: 'Failed to publish announcement.' });
  }
});

// Discussions (Department & Project channels + Socket.IO real-time emit)
studioRouter.get('/discussions', async (req: AuthRequest, res) => {
  try {
    const channelKey = String(req.query.channelKey || '');
    if (!channelKey) return res.status(400).json({ error: 'channelKey is required.' });

    const [rows, allUsers] = await Promise.all([
      db
        .select()
        .from(discussions)
        .where(eq(discussions.channelKey, channelKey))
        .orderBy(asc(discussions.createdAt))
        .limit(100),
      db.select({ id: users.id, fullName: users.fullName, role: users.role, memberId: users.memberId }).from(users),
    ]);

    res.json({
      messages: rows.map((m) => ({
        ...m,
        author: allUsers.find((u) => u.id === m.authorUserId) || null,
      })),
    });
  } catch (err) {
    console.error('Load discussions error:', err);
    res.status(500).json({ error: 'Failed to load messages.' });
  }
});

studioRouter.post('/discussions', async (req: AuthRequest, res) => {
  try {
    const actor = req.studioUser!;
    const channelType = String(req.body.channelType || 'DEPARTMENT');
    const channelKey = String(req.body.channelKey || '').trim();
    const body = String(req.body.body || '').trim();

    if (!channelKey || !body) return res.status(400).json({ error: 'Channel and message are required.' });

    const [created] = await db
      .insert(discussions)
      .values({
        channelType,
        channelKey,
        authorUserId: actor.id,
        body,
      })
      .returning();

    const payload = {
      ...created,
      author: {
        id: actor.id,
        fullName: actor.fullName,
        role: actor.role,
        memberId: actor.memberId,
      },
    };

    const io = getSocketIO();
    if (io) {
      io.to(`channel:${channelKey}`).emit('discussion:message', payload);
    }

    res.status(201).json({ message: payload });
  } catch (err) {
    console.error('Post discussion error:', err);
    res.status(500).json({ error: 'Failed to send message.' });
  }
});

// Notifications Mark Read
studioRouter.post('/notifications/:id/read', async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    await db.update(notifications).set({ isRead: true }).where(eq(notifications.id, id));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update notification.' });
  }
});

studioRouter.post('/notifications/read-all', async (req: AuthRequest, res) => {
  try {
    const user = req.studioUser!;
    await db
      .update(notifications)
      .set({ isRead: true })
      .where(or(eq(notifications.recipientUserId, user.id), eq(notifications.recipientRole, user.role)));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to mark notifications read.' });
  }
});

// Studio Members Directory (for task/project assignment pickers)
studioRouter.get('/directory', async (_req: AuthRequest, res) => {
  try {
    const [userRows, deptRows] = await Promise.all([
      db
        .select({
          id: users.id,
          memberId: users.memberId,
          fullName: users.fullName,
          email: users.email,
          role: users.role,
          status: users.status,
        })
        .from(users)
        .orderBy(asc(users.fullName)),
      db.select().from(departments).orderBy(asc(departments.sortOrder)),
    ]);

    res.json({
      members: userRows.filter((u) => u.role !== 'GUEST' && u.status === 'ACTIVE'),
      departments: deptRows,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load directory.' });
  }
});
