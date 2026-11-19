import { Router } from 'express';
import { asc, count, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { db } from '../../db/index.ts';
import { applications, departments, fileAssets, projects, users } from '../../db/schema.ts';
import { ensureStudioSeeded } from '../seed.ts';
import { rateLimit } from '../middleware/auth.ts';
import { notifyDirectorOfNewApplication } from '../services/notificationService.ts';
import { recordAudit } from '../services/auditService.ts';
import { APPLICANT_ALLOWED_EXTENSIONS, createSafeUploader } from '../utils/uploads.ts';
import { CREATIVE_SOFTWARE_LIBRARY, PRODUCTION_PIPELINE_STAGES } from '../../data/officialDepartments.ts';

export const publicRouter = Router();

const applicantUpload = createSafeUploader(APPLICANT_ALLOWED_EXTENSIONS, 10);

const applicationSchema = z.object({
  fullName: z.string().trim().min(2, 'Full name is required').max(120),
  email: z.string().trim().email('Valid email is required').max(160),
  phone: z.string().trim().min(7, 'Phone number is required').max(32),
  introduction: z.string().trim().min(15, 'Please introduce yourself (at least 15 characters)').max(2000),
  departmentId: z.string().trim().min(2),
  skills: z.string().trim().min(3, 'Please list your creative or technical skills').max(1000),
  experience: z.string().trim().min(5, 'Please summarize your experience').max(2000),
  portfolioUrl: z.string().trim().max(400).optional().or(z.literal('')),
  availability: z.string().trim().min(2, 'Availability is required').max(160),
  reasonForJoining: z.string().trim().min(10, 'Reason for joining is required').max(2000),
  consentAccepted: z.union([z.literal('true'), z.literal(true), z.literal('on')]),
});

publicRouter.get('/departments', async (_req, res) => {
  try {
    await ensureStudioSeeded();
    const list = await db.select().from(departments).orderBy(asc(departments.sortOrder));
    res.json({ departments: list });
  } catch (err) {
    console.error('Public departments error:', err);
    res.status(500).json({ error: 'Unable to load studio departments.' });
  }
});

publicRouter.get('/studio-overview', async (_req, res) => {
  try {
    await ensureStudioSeeded();
    const [deptList, memberCountRow, projectCountRow] = await Promise.all([
      db.select().from(departments).orderBy(asc(departments.sortOrder)),
      db.select({ value: count() }).from(users),
      db.select({ value: count() }).from(projects),
    ]);

    res.json({
      studio: {
        name: "Elder'sVeil Anime Studio",
        founderDirector: 'M.J. Mujesh Dharshan',
        tagline: 'Stories Beyond Imagination',
        departmentCount: deptList.length,
        memberCount: memberCountRow[0]?.value ?? 0,
        projectCount: projectCountRow[0]?.value ?? 0,
      },
      departments: deptList.map((d) => ({
        id: d.id,
        prefix: d.prefix,
        name: d.name,
        tagline: d.tagline,
        description: d.description,
        suggestedTools: d.suggestedTools,
        moduleCount: Array.isArray(d.modules) ? d.modules.length : 0,
      })),
      pipelineStages: PRODUCTION_PIPELINE_STAGES,
      featuredToolsCount: CREATIVE_SOFTWARE_LIBRARY.length,
    });
  } catch (err) {
    console.error('Public overview error:', err);
    res.status(500).json({ error: 'Unable to load studio overview.' });
  }
});

publicRouter.post(
  '/applications',
  rateLimit('public-apply', 10, 15 * 60 * 1000),
  applicantUpload.fields([
    { name: 'resume', maxCount: 1 },
    { name: 'workSample', maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      await ensureStudioSeeded();
      const parsed = applicationSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: parsed.error.issues[0]?.message || 'Invalid application fields.',
          issues: parsed.error.issues,
        });
      }

      const data = parsed.data;
      const [dept] = await db.select().from(departments).where(eq(departments.id, data.departmentId));
      if (!dept) {
        return res.status(400).json({ error: 'Selected department does not exist.' });
      }

      if (data.portfolioUrl && !/^https?:\/\//i.test(data.portfolioUrl)) {
        return res.status(400).json({ error: 'Portfolio URL must begin with http:// or https://' });
      }

      const files = req.files as Record<string, Express.Multer.File[]> | undefined;
      let resumeFileId: number | null = null;
      let sampleFileId: number | null = null;

      if (files?.resume?.[0]) {
        const f = files.resume[0];
        const [asset] = await db
          .insert(fileAssets)
          .values({
            storedName: f.filename,
            originalName: f.originalname,
            mimeType: f.mimetype || 'application/octet-stream',
            sizeBytes: f.size,
            folder: 'recruitment-resumes',
            assetCategory: 'RESUME',
            departmentId: dept.id,
            isPublicApplicantFile: true,
          })
          .returning();
        resumeFileId = asset.id;
      }

      if (files?.workSample?.[0]) {
        const f = files.workSample[0];
        const [asset] = await db
          .insert(fileAssets)
          .values({
            storedName: f.filename,
            originalName: f.originalname,
            mimeType: f.mimetype || 'application/octet-stream',
            sizeBytes: f.size,
            folder: 'recruitment-samples',
            assetCategory: 'SAMPLE',
            departmentId: dept.id,
            isPublicApplicantFile: true,
          })
          .returning();
        sampleFileId = asset.id;
      }

      const trackingCode = `EV-${dept.prefix}-${nanoid(6).toUpperCase()}`;

      const [created] = await db
        .insert(applications)
        .values({
          trackingCode,
          fullName: data.fullName,
          email: data.email.toLowerCase(),
          phone: data.phone,
          introduction: data.introduction,
          departmentId: dept.id,
          skills: data.skills,
          experience: data.experience,
          portfolioUrl: data.portfolioUrl || null,
          availability: data.availability,
          reasonForJoining: data.reasonForJoining,
          resumeFileId,
          sampleFileId,
          consentAccepted: true,
          status: 'RECEIVED',
        })
        .returning();

      await recordAudit({
        actorEmail: data.email.toLowerCase(),
        actorRole: 'APPLICANT',
        action: 'APPLICATION_SUBMITTED',
        entityType: 'APPLICATION',
        entityId: trackingCode,
        details: { departmentId: dept.id, fullName: data.fullName },
        ipAddress: req.ip ?? null,
      });

      const appUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
      const deliveryResult = await notifyDirectorOfNewApplication({
        trackingCode,
        fullName: data.fullName,
        email: data.email.toLowerCase(),
        phone: data.phone,
        departmentName: `${dept.name} (${dept.prefix})`,
        skills: data.skills,
        portfolioUrl: data.portfolioUrl || null,
        appUrl,
      });

      res.status(201).json({
        application: {
          trackingCode: created.trackingCode,
          status: created.status,
          departmentName: dept.name,
          createdAt: created.createdAt,
        },
        notifications: {
          internalCreated: Boolean(deliveryResult.internalNotif),
          emailStatus: deliveryResult.emailDelivery.status,
          emailNote: deliveryResult.emailDelivery.errorMessage,
          smsStatus: deliveryResult.smsDelivery.status,
          smsNote: deliveryResult.smsDelivery.errorMessage,
        },
      });
    } catch (err: unknown) {
      console.error('Application submission error:', err);
      const message = err instanceof Error ? err.message : 'Unable to submit application.';
      res.status(400).json({ error: message });
    }
  }
);

const trackSchema = z.object({
  trackingCode: z.string().trim().min(4).max(32),
  email: z.string().trim().email(),
});

// Privacy-hardened status lookup: requires BOTH trackingCode and applicant email
publicRouter.post('/applications/track', rateLimit('public-track', 20, 15 * 60 * 1000), async (req, res) => {
  try {
    await ensureStudioSeeded();
    const parsed = trackSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Both tracking code and applicant email are required.' });
    }

    const code = parsed.data.trackingCode.toUpperCase();
    const email = parsed.data.email.toLowerCase();

    const rows = await db
      .select({
        trackingCode: applications.trackingCode,
        status: applications.status,
        departmentId: applications.departmentId,
        email: applications.email,
        interviewScheduledAt: applications.interviewScheduledAt,
        assessmentPrompt: applications.assessmentPrompt,
        approvedMemberId: applications.approvedMemberId,
        createdAt: applications.createdAt,
        updatedAt: applications.updatedAt,
      })
      .from(applications)
      .where(eq(applications.trackingCode, code));

    const match = rows[0];
    if (!match || match.email.toLowerCase() !== email) {
      return res.status(404).json({
        error: 'No matching application found for that tracking code and email combination.',
      });
    }

    const [dept] = await db.select({ name: departments.name, prefix: departments.prefix }).from(departments).where(eq(departments.id, match.departmentId));

    res.json({
      tracking: {
        trackingCode: match.trackingCode,
        status: match.status,
        departmentName: dept ? `${dept.name} (${dept.prefix})` : match.departmentId,
        interviewScheduledAt: match.interviewScheduledAt,
        assessmentPrompt: match.assessmentPrompt,
        approvedMemberId: match.approvedMemberId,
        submittedAt: match.createdAt,
        updatedAt: match.updatedAt,
      },
    });
  } catch (err) {
    console.error('Track error:', err);
    res.status(500).json({ error: 'Unable to verify application status.' });
  }
});
