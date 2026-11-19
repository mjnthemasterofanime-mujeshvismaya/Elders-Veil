import {
  boolean,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export interface DepartmentModuleDef {
  key: string;
  title: string;
  description: string;
  fields: string[];
}

export interface ProjectMilestone {
  id: string;
  title: string;
  dueDate: string;
  completed: boolean;
}

export interface SubmissionHistoryEntry {
  status: string;
  actorName: string;
  note: string;
  timestamp: string;
}

export interface StoryRevisionEntry {
  revision: number;
  editedBy: string;
  note: string;
  timestamp: string;
}

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  memberId: text('member_id').unique(),
  email: text('email').notNull().unique(),
  fullName: text('full_name').notNull(),
  role: text('role').notNull().default('GUEST'), // DIRECTOR | ADMIN | DEPT_HEAD | MEMBER | GUEST
  status: text('status').notNull().default('ACTIVE'), // ACTIVE | DISABLED | PENDING_ONBOARDING
  phone: text('phone'),
  bio: text('bio'),
  skills: jsonb('skills').$type<string[]>().default([]).notNull(),
  avatarUrl: text('avatar_url'),
  passwordHash: text('password_hash'),
  sessionVersion: integer('session_version').notNull().default(1),
  lastLoginAt: timestamp('last_login_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const departments = pgTable('departments', {
  id: text('id').primaryKey(), // samurai, ninja, martial-arts, pirate, explorer, witches-wizards, animation, story, audio, video
  prefix: text('prefix').notNull().unique(), // SAM, NIN, MAR, PIR, EXP, WIZ, ANI, STO, AUD, VID
  name: text('name').notNull(),
  tagline: text('tagline').notNull(),
  description: text('description').notNull(),
  headUserId: integer('head_user_id').references(() => users.id, { onDelete: 'set null' }),
  suggestedTools: jsonb('suggested_tools').$type<string[]>().default([]).notNull(),
  modules: jsonb('modules').$type<DepartmentModuleDef[]>().default([]).notNull(),
  settings: jsonb('settings').$type<Record<string, unknown>>().default({}).notNull(),
  isOfficial: boolean('is_official').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const departmentMemberships = pgTable(
  'department_memberships',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    departmentId: text('department_id')
      .notNull()
      .references(() => departments.id, { onDelete: 'cascade' }),
    deptRole: text('dept_role').notNull().default('MEMBER'), // HEAD | LEAD | MEMBER
    assignedByUserId: integer('assigned_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [uniqueIndex('dept_membership_user_dept_idx').on(table.userId, table.departmentId)]
);

export const fileAssets = pgTable('file_assets', {
  id: serial('id').primaryKey(),
  storedName: text('stored_name').notNull().unique(),
  originalName: text('original_name').notNull(),
  mimeType: text('mime_type').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  folder: text('folder').notNull().default('general'),
  assetCategory: text('asset_category').notNull().default('DOCUMENT'),
  tags: jsonb('tags').$type<string[]>().default([]).notNull(),
  departmentId: text('department_id').references(() => departments.id, { onDelete: 'set null' }),
  projectId: integer('project_id'),
  uploadedByUserId: integer('uploaded_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  version: integer('version').notNull().default(1),
  parentAssetId: integer('parent_asset_id'),
  isPublicApplicantFile: boolean('is_public_applicant_file').notNull().default(false),
  deletedAt: timestamp('deleted_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const applications = pgTable('applications', {
  id: serial('id').primaryKey(),
  trackingCode: text('tracking_code').notNull().unique(),
  fullName: text('full_name').notNull(),
  email: text('email').notNull(),
  phone: text('phone').notNull(),
  introduction: text('introduction').notNull(),
  departmentId: text('department_id')
    .notNull()
    .references(() => departments.id),
  skills: text('skills').notNull(),
  experience: text('experience').notNull(),
  portfolioUrl: text('portfolio_url'),
  availability: text('availability').notNull(),
  reasonForJoining: text('reason_for_joining').notNull(),
  resumeFileId: integer('resume_file_id').references(() => fileAssets.id, { onDelete: 'set null' }),
  sampleFileId: integer('sample_file_id').references(() => fileAssets.id, { onDelete: 'set null' }),
  consentAccepted: boolean('consent_accepted').notNull().default(true),
  status: text('status').notNull().default('RECEIVED'), // RECEIVED | UNDER_REVIEW | SHORTLISTED | INTERVIEW_SCHEDULED | ASSESSMENT_REQUESTED | APPROVED | REJECTED
  interviewScheduledAt: timestamp('interview_scheduled_at'),
  interviewNotes: text('interview_notes'),
  assessmentPrompt: text('assessment_prompt'),
  internalNotes: text('internal_notes'),
  reviewedByUserId: integer('reviewed_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  approvedMemberId: text('approved_member_id'),
  inviteCode: text('invite_code'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const applicationReviews = pgTable('application_reviews', {
  id: serial('id').primaryKey(),
  applicationId: integer('application_id')
    .notNull()
    .references(() => applications.id, { onDelete: 'cascade' }),
  reviewerUserId: integer('reviewer_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  action: text('action').notNull(),
  note: text('note').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const projects = pgTable('projects', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  leaderUserId: integer('leader_user_id').references(() => users.id, { onDelete: 'set null' }),
  primaryDepartmentId: text('primary_department_id').references(() => departments.id, { onDelete: 'set null' }),
  departmentIds: jsonb('department_ids').$type<string[]>().default([]).notNull(),
  priority: text('priority').notNull().default('MEDIUM'), // LOW | MEDIUM | HIGH | CRITICAL
  productionStage: text('production_stage').notNull().default('STAGE_1_RESEARCH'),
  status: text('status').notNull().default('ACTIVE'), // ACTIVE | ON_HOLD | COMPLETED | ARCHIVED
  progress: integer('progress').notNull().default(0),
  startDate: text('start_date'),
  deadline: text('deadline'),
  milestones: jsonb('milestones').$type<ProjectMilestone[]>().default([]).notNull(),
  dependencies: jsonb('dependencies').$type<string[]>().default([]).notNull(),
  createdByUserId: integer('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const projectMembers = pgTable(
  'project_members',
  {
    id: serial('id').primaryKey(),
    projectId: integer('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    projectRole: text('project_role').notNull().default('CONTRIBUTOR'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [uniqueIndex('project_member_unique_idx').on(table.projectId, table.userId)]
);

export const tasks = pgTable('tasks', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id').references(() => projects.id, { onDelete: 'set null' }),
  departmentId: text('department_id')
    .notNull()
    .references(() => departments.id, { onDelete: 'cascade' }),
  assigneeUserId: integer('assignee_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdByUserId: integer('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  description: text('description').notNull(),
  priority: text('priority').notNull().default('MEDIUM'),
  status: text('status').notNull().default('TODO'), // TODO | IN_PROGRESS | IN_REVIEW | REVISION_REQUESTED | DONE
  deadline: text('deadline'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const taskComments = pgTable('task_comments', {
  id: serial('id').primaryKey(),
  taskId: integer('task_id')
    .notNull()
    .references(() => tasks.id, { onDelete: 'cascade' }),
  authorUserId: integer('author_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  body: text('body').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const calendarEvents = pgTable('calendar_events', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description'),
  eventType: text('event_type').notNull().default('STUDIO'), // STUDIO | DEPARTMENT | MILESTONE | DEADLINE | INTERVIEW | RELEASE
  departmentId: text('department_id').references(() => departments.id, { onDelete: 'set null' }),
  projectId: integer('project_id').references(() => projects.id, { onDelete: 'set null' }),
  startsAt: text('starts_at').notNull(),
  endsAt: text('ends_at'),
  createdByUserId: integer('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const workSubmissions = pgTable('work_submissions', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  departmentId: text('department_id')
    .notNull()
    .references(() => departments.id, { onDelete: 'cascade' }),
  projectId: integer('project_id').references(() => projects.id, { onDelete: 'set null' }),
  taskId: integer('task_id').references(() => tasks.id, { onDelete: 'set null' }),
  submittedByUserId: integer('submitted_by_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  reviewerUserId: integer('reviewer_user_id').references(() => users.id, { onDelete: 'set null' }),
  fileAssetId: integer('file_asset_id').references(() => fileAssets.id, { onDelete: 'set null' }),
  status: text('status').notNull().default('DRAFT'), // DRAFT | SUBMITTED | UNDER_REVIEW | REVISION_REQUESTED | RESUBMITTED | APPROVED
  feedback: text('feedback'),
  revisionCount: integer('revision_count').notNull().default(0),
  history: jsonb('history').$type<SubmissionHistoryEntry[]>().default([]).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const announcements = pgTable('announcements', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  scope: text('scope').notNull().default('STUDIO'), // STUDIO | DEPARTMENT
  departmentId: text('department_id').references(() => departments.id, { onDelete: 'cascade' }),
  authorUserId: integer('author_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  pinned: boolean('pinned').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const discussions = pgTable('discussions', {
  id: serial('id').primaryKey(),
  channelType: text('channel_type').notNull(), // DEPARTMENT | PROJECT | DIRECT
  channelKey: text('channel_key').notNull(),
  authorUserId: integer('author_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  body: text('body').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const notifications = pgTable('notifications', {
  id: serial('id').primaryKey(),
  recipientUserId: integer('recipient_user_id').references(() => users.id, { onDelete: 'cascade' }),
  recipientRole: text('recipient_role'),
  type: text('type').notNull(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  linkTab: text('link_tab'),
  isRead: boolean('is_read').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const notificationDeliveries = pgTable('notification_deliveries', {
  id: serial('id').primaryKey(),
  channel: text('channel').notNull(), // EMAIL | SMS | WHATSAPP
  recipient: text('recipient').notNull(),
  subject: text('subject'),
  payloadSummary: text('payload_summary').notNull(),
  status: text('status').notNull(), // SENT | FAILED | AWAITING_CONFIG
  provider: text('provider').notNull(),
  errorMessage: text('error_message'),
  attempts: integer('attempts').notNull().default(1),
  relatedEntityType: text('related_entity_type'),
  relatedEntityId: text('related_entity_id'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const storyEntries = pgTable('story_entries', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id').references(() => projects.id, { onDelete: 'set null' }),
  departmentId: text('department_id')
    .notNull()
    .default('story')
    .references(() => departments.id, { onDelete: 'cascade' }),
  universe: text('universe').notNull().default("Elder'sVeil Core Universe"),
  saga: text('saga').notNull(),
  arc: text('arc').notNull(),
  volume: text('volume').notNull(),
  chapterNumber: integer('chapter_number').notNull().default(1),
  chapterTitle: text('chapter_title').notNull(),
  sceneNumber: integer('scene_number').notNull().default(1),
  scriptText: text('script_text').notNull(),
  dialogueNotes: text('dialogue_notes'),
  continuityNotes: text('continuity_notes'),
  linkedRecordIds: jsonb('linked_record_ids').$type<number[]>().default([]).notNull(),
  revisionNumber: integer('revision_number').notNull().default(1),
  revisionHistory: jsonb('revision_history').$type<StoryRevisionEntry[]>().default([]).notNull(),
  authorUserId: integer('author_user_id').references(() => users.id, { onDelete: 'set null' }),
  status: text('status').notNull().default('DRAFT'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const departmentRecords = pgTable('department_records', {
  id: serial('id').primaryKey(),
  departmentId: text('department_id')
    .notNull()
    .references(() => departments.id, { onDelete: 'cascade' }),
  moduleKey: text('module_key').notNull(),
  title: text('title').notNull(),
  classification: text('classification').notNull().default('ORIGINAL'), // HISTORICAL | FICTIONAL | ORIGINAL | REFERENCE | PRODUCTION
  summary: text('summary').notNull(),
  metadata: jsonb('metadata').$type<Record<string, string>>().default({}).notNull(),
  projectId: integer('project_id').references(() => projects.id, { onDelete: 'set null' }),
  linkedStoryEntryId: integer('linked_story_entry_id').references(() => storyEntries.id, { onDelete: 'set null' }),
  fileAssetId: integer('file_asset_id').references(() => fileAssets.id, { onDelete: 'set null' }),
  createdByUserId: integer('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  status: text('status').notNull().default('ACTIVE'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const auditLogs = pgTable('audit_logs', {
  id: serial('id').primaryKey(),
  actorUserId: integer('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
  actorEmail: text('actor_email'),
  actorRole: text('actor_role'),
  action: text('action').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id'),
  details: jsonb('details').$type<Record<string, unknown>>().default({}).notNull(),
  ipAddress: text('ip_address'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const integrationConfigs = pgTable('integration_configs', {
  id: serial('id').primaryKey(),
  key: text('key').notNull().unique(),
  config: jsonb('config').$type<Record<string, unknown>>().default({}).notNull(),
  updatedByUserId: integer('updated_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
