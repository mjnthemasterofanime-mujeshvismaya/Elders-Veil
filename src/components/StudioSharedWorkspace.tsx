import React, { useCallback, useEffect, useState } from 'react';
import {
  Bell,
  Calendar,
  CheckCircle2,
  Download,
  FileCheck2,
  FolderOpen,
  Layers,
  Lock,
  Megaphone,
  Plus,
  Trash2,
  Wrench,
} from 'lucide-react';
import { apiDownload, apiFetch } from '../lib/api.ts';
import { useStudioAuth } from '../contexts/StudioAuthContext.tsx';
import type { CreativeToolEntry } from '../data/officialDepartments.ts';

export type SharedSection =
  | 'dashboard'
  | 'projects'
  | 'tasks'
  | 'calendar'
  | 'files'
  | 'reviews'
  | 'announcements'
  | 'tools'
  | 'profile';

interface WorkspacePayload {
  projects: Array<{
    id: number;
    code: string;
    title: string;
    description: string;
    departmentIds: string[];
    priority: string;
    productionStage: string;
    status: string;
    progress: number;
    deadline: string | null;
    milestones: Array<{ id: string; title: string; dueDate: string; completed: boolean }>;
  }>;
  tasks: Array<{
    id: number;
    title: string;
    description: string;
    departmentId: string;
    priority: string;
    status: string;
    deadline: string | null;
  }>;
  submissions: Array<{
    id: number;
    title: string;
    description: string;
    departmentId: string;
    status: string;
    feedback: string | null;
    revisionCount: number;
    history: Array<{ status: string; actorName: string; note: string; timestamp: string }>;
  }>;
  announcements: Array<{
    id: number;
    title: string;
    body: string;
    scope: string;
    departmentId: string | null;
    createdAt: string;
  }>;
  calendarEvents: Array<{
    id: number;
    title: string;
    description: string | null;
    eventType: string;
    startsAt: string;
  }>;
  notifications: Array<{
    id: number;
    type: string;
    title: string;
    body: string;
    isRead: boolean;
    createdAt: string;
  }>;
}

export function StudioSharedWorkspace({ section }: { section: SharedSection }) {
  const { studioUser, refreshProfile, setUnreadNotifications } = useStudioAuth();
  const [workspace, setWorkspace] = useState<WorkspacePayload | null>(null);
  const [files, setFiles] = useState<
    Array<{
      id: number;
      originalName: string;
      assetCategory: string;
      folder: string;
      departmentId: string | null;
      sizeBytes: number;
      version: number;
      createdAt: string;
    }>
  >([]);
  const [tools, setTools] = useState<CreativeToolEntry[]>([]);
  const [pipelineStages, setPipelineStages] = useState<
    Array<{ key: string; step: number; title: string; departments: string[]; description: string }>
  >([]);
  const [departments, setDepartments] = useState<Array<{ id: string; prefix: string; name: string }>>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Filters
  const [toolSearch, setToolSearch] = useState('');
  const [toolDeptFilter, setToolDeptFilter] = useState('ALL');
  const [fileSearch, setFileSearch] = useState('');
  const [fileCatFilter, setFileCatFilter] = useState('ALL');

  // Forms
  const [projForm, setProjForm] = useState({
    title: '',
    description: '',
    departmentIds: ['samurai', 'story', 'animation'],
    priority: 'HIGH',
    deadline: '',
  });
  const [taskForm, setTaskForm] = useState({
    title: '',
    description: '',
    departmentId: studioUser?.departments[0]?.departmentId || 'samurai',
    priority: 'MEDIUM',
    deadline: '',
  });
  const [eventForm, setEventForm] = useState({
    title: '',
    description: '',
    eventType: 'STUDIO',
    startsAt: '',
  });
  const [subForm, setSubForm] = useState({
    title: '',
    description: '',
    departmentId: studioUser?.departments[0]?.departmentId || 'samurai',
  });
  const [annForm, setAnnForm] = useState({
    title: '',
    body: '',
    scope: 'STUDIO',
    departmentId: '',
  });
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadCat, setUploadCat] = useState('CONCEPT_ART');
  const [uploadDept, setUploadDept] = useState(studioUser?.departments[0]?.departmentId || '');

  // Profile & Security Form
  const [profileBio, setProfileBio] = useState(studioUser?.bio || '');
  const [profilePhone, setProfilePhone] = useState(studioUser?.phone || '');
  const [newPassword, setNewPassword] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ws, fileRes, toolRes, dirRes] = await Promise.all([
        apiFetch<WorkspacePayload>('/api/studio/my-workspace'),
        apiFetch<{ files: typeof files }>('/api/studio/files'),
        apiFetch<{ tools: CreativeToolEntry[]; pipelineStages: typeof pipelineStages }>(
          '/api/studio/creative-tools'
        ),
        apiFetch<{ departments: Array<{ id: string; prefix: string; name: string }> }>(
          '/api/studio/directory'
        ),
      ]);
      setWorkspace(ws);
      setFiles(fileRes.files);
      setTools(toolRes.tools);
      setPipelineStages(toolRes.pipelineStages);
      setDepartments(dirRes.departments);
      setUnreadNotifications(ws.notifications.filter((n) => !n.isRead).length);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load workspace data.');
    } finally {
      setLoading(false);
    }
  }, [setUnreadNotifications]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/studio/projects', {
        method: 'POST',
        body: JSON.stringify(projForm),
      });
      setProjForm({
        title: '',
        description: '',
        departmentIds: ['samurai', 'story', 'animation'],
        priority: 'HIGH',
        deadline: '',
      });
      setNotice('Cross-department project created.');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project.');
    }
  };

  const handleAdvanceStage = async (projectId: number, productionStage: string, progress: number) => {
    try {
      await apiFetch(`/api/studio/projects/${projectId}`, {
        method: 'PATCH',
        body: JSON.stringify({ productionStage, progress }),
      });
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update project stage.');
    }
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/studio/tasks', {
        method: 'POST',
        body: JSON.stringify(taskForm),
      });
      setTaskForm({ ...taskForm, title: '', description: '' });
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create task.');
    }
  };

  const handleTaskStatus = async (taskId: number, status: string) => {
    try {
      await apiFetch(`/api/studio/tasks/${taskId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update task.');
    }
  };

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/studio/calendar', {
        method: 'POST',
        body: JSON.stringify(eventForm),
      });
      setEventForm({ title: '', description: '', eventType: 'STUDIO', startsAt: '' });
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to schedule event.');
    }
  };

  const handleUploadFile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) return;
    try {
      const fd = new FormData();
      fd.append('file', uploadFile);
      fd.append('assetCategory', uploadCat);
      if (uploadDept) fd.append('departmentId', uploadDept);
      await apiFetch('/api/studio/files/upload', { method: 'POST', body: fd });
      setUploadFile(null);
      setNotice('File uploaded securely to studio repository.');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'File upload failed.');
    }
  };

  const handleCreateSubmission = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/studio/submissions', {
        method: 'POST',
        body: JSON.stringify(subForm),
      });
      setSubForm({ ...subForm, title: '', description: '' });
      setNotice('Work submitted for review.');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit work.');
    }
  };

  const handleTransitionSubmission = async (id: number, status: string) => {
    const note = status === 'REVISION_REQUESTED' ? 'Please refine details per director notes.' : `Marked ${status}`;
    try {
      await apiFetch(`/api/studio/submissions/${id}/transition`, {
        method: 'POST',
        body: JSON.stringify({ status, note }),
      });
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Transition failed.');
    }
  };

  const handlePostAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/studio/announcements', {
        method: 'POST',
        body: JSON.stringify(annForm),
      });
      setAnnForm({ title: '', body: '', scope: 'STUDIO', departmentId: '' });
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to publish announcement.');
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/auth/profile', {
        method: 'PUT',
        body: JSON.stringify({ bio: profileBio, phone: profilePhone }),
      });
      await refreshProfile();
      setNotice('Profile saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Profile update failed.');
    }
  };

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/auth/password', {
        method: 'POST',
        body: JSON.stringify({ newPassword }),
      });
      setNewPassword('');
      setNotice('Studio security credential updated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Password update failed.');
    }
  };

  if (loading && !workspace) {
    return (
      <div className="p-8 rounded-xl border border-white/10 bg-[#121620] text-sm text-gray-400">
        Loading studio workplace...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {notice && (
        <div className="p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-xs text-emerald-300 flex justify-between">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} className="underline cursor-pointer">
            Dismiss
          </button>
        </div>
      )}
      {error && (
        <div className="p-3 rounded-lg border border-red-500/30 bg-red-500/10 text-xs text-red-300">
          {error}
        </div>
      )}

      {/* Personal Member Dashboard */}
      {section === 'dashboard' && workspace && (
        <div className="space-y-6">
          <div className="p-6 rounded-xl border border-white/10 bg-[#121620] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <p className="text-xs font-mono-tabular text-amber-400">
                MEMBER ID: {studioUser?.memberId || 'PENDING'} · ROLE: {studioUser?.role}
              </p>
              <h1 className="font-display text-3xl font-bold text-white mt-1">
                Welcome, {studioUser?.fullName}
              </h1>
              <p className="text-xs text-gray-400 mt-1">
                Assigned Departments:{' '}
                {studioUser?.departments.map((d) => d.departmentId).join(' · ') || 'None'}
              </p>
            </div>
            <div className="grid grid-cols-3 gap-3 text-xs shrink-0">
              <div className="p-3 rounded-lg bg-[#0B0D12] border border-white/10">
                <p className="text-gray-400">Projects</p>
                <p className="text-xl font-bold font-mono-tabular text-white mt-0.5">
                  {workspace.projects.length}
                </p>
              </div>
              <div className="p-3 rounded-lg bg-[#0B0D12] border border-white/10">
                <p className="text-gray-400">Open Tasks</p>
                <p className="text-xl font-bold font-mono-tabular text-white mt-0.5">
                  {workspace.tasks.filter((t) => t.status !== 'DONE').length}
                </p>
              </div>
              <div className="p-3 rounded-lg bg-[#0B0D12] border border-white/10">
                <p className="text-gray-400">Unread Alerts</p>
                <p className="text-xl font-bold font-mono-tabular text-amber-400 mt-0.5">
                  {workspace.notifications.filter((n) => !n.isRead).length}
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 p-5 rounded-xl border border-white/10 bg-[#121620] space-y-3">
              <h2 className="text-sm font-semibold text-white">Your Priority Tasks &amp; Deadlines</h2>
              {workspace.tasks.length === 0 ? (
                <p className="text-xs text-gray-400">No tasks assigned yet.</p>
              ) : (
                <div className="space-y-2">
                  {workspace.tasks.slice(0, 6).map((t) => (
                    <div
                      key={t.id}
                      className="p-3 rounded-lg bg-[#0B0D12] border border-white/10 flex items-center justify-between gap-3 text-xs"
                    >
                      <div>
                        <p className="text-white font-medium">{t.title}</p>
                        <p className="text-gray-400 font-mono-tabular">
                          {t.departmentId} · {t.priority} {t.deadline ? `· Due ${t.deadline}` : ''}
                        </p>
                      </div>
                      <span className="font-mono-tabular text-amber-300 shrink-0">{t.status}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="lg:col-span-5 p-5 rounded-xl border border-white/10 bg-[#121620] space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Bell className="w-4 h-4 text-amber-400" />
                  Notifications
                </h2>
                <button
                  type="button"
                  onClick={async () => {
                    await apiFetch('/api/studio/notifications/read-all', { method: 'POST' });
                    await loadData();
                  }}
                  className="text-xs text-amber-400 hover:underline cursor-pointer"
                >
                  Mark All Read
                </button>
              </div>
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {workspace.notifications.length === 0 ? (
                  <p className="text-xs text-gray-400">All caught up.</p>
                ) : (
                  workspace.notifications.map((n) => (
                    <div
                      key={n.id}
                      className={`p-3 rounded-lg border text-xs ${
                        n.isRead
                          ? 'bg-[#0B0D12] border-white/5 text-gray-400'
                          : 'bg-amber-500/10 border-amber-500/30 text-white'
                      }`}
                    >
                      <p className="font-semibold">{n.title}</p>
                      <p className="text-gray-300 mt-0.5">{n.body}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Projects & 9-Stage Production Pipeline */}
      {section === 'projects' && workspace && (
        <div className="space-y-6">
          {['DIRECTOR', 'ADMIN', 'DEPT_HEAD'].includes(studioUser?.role || '') && (
            <form
              onSubmit={handleCreateProject}
              className="p-5 rounded-xl border border-white/10 bg-[#121620] space-y-3 text-xs"
            >
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <Layers className="w-4 h-4 text-amber-400" />
                Launch Cross-Department Anime Project
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input
                  required
                  value={projForm.title}
                  onChange={(e) => setProjForm({ ...projForm, title: e.target.value })}
                  placeholder="Project / Episode Title"
                  className="sm:col-span-2 px-3 py-2 bg-[#0B0D12] border border-white/15 rounded-lg text-white"
                />
                <input
                  type="date"
                  value={projForm.deadline}
                  onChange={(e) => setProjForm({ ...projForm, deadline: e.target.value })}
                  className="px-3 py-2 bg-[#0B0D12] border border-white/15 rounded-lg text-white"
                />
              </div>
              <textarea
                required
                rows={2}
                value={projForm.description}
                onChange={(e) => setProjForm({ ...projForm, description: e.target.value })}
                placeholder="Production scope and cross-department deliverables..."
                className="w-full px-3 py-2 bg-[#0B0D12] border border-white/15 rounded-lg text-white"
              />
              <div className="flex flex-wrap gap-2">
                {departments.map((d) => {
                  const selected = projForm.departmentIds.includes(d.id);
                  return (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() =>
                        setProjForm({
                          ...projForm,
                          departmentIds: selected
                            ? projForm.departmentIds.filter((x) => x !== d.id)
                            : [...projForm.departmentIds, d.id],
                        })
                      }
                      className={`px-2.5 py-1 rounded border cursor-pointer ${
                        selected
                          ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                          : 'bg-[#0B0D12] border-white/10 text-gray-400'
                      }`}
                    >
                      {d.prefix} · {d.name}
                    </button>
                  );
                })}
              </div>
              <button
                type="submit"
                className="px-4 py-2 bg-amber-500 text-[#0B0D12] font-semibold rounded-lg hover:bg-amber-400 cursor-pointer"
              >
                Create Studio Project
              </button>
            </form>
          )}

          <div className="space-y-4">
            {workspace.projects.map((p) => (
              <div key={p.id} className="p-5 rounded-xl border border-white/10 bg-[#121620] space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <p className="text-xs font-mono-tabular text-amber-400">
                      {p.code} · {p.priority} · {p.status} {p.deadline ? `· Target ${p.deadline}` : ''}
                    </p>
                    <h3 className="text-lg font-bold text-white mt-0.5">{p.title}</h3>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <select
                      value={p.productionStage}
                      onChange={(e) => {
                        const idx = pipelineStages.findIndex((s) => s.key === e.target.value);
                        const nextProg = idx >= 0 ? Math.round(((idx + 1) / pipelineStages.length) * 100) : p.progress;
                        handleAdvanceStage(p.id, e.target.value, nextProg);
                      }}
                      className="px-3 py-1.5 bg-[#0B0D12] border border-white/15 rounded-lg text-white"
                    >
                      {pipelineStages.map((s) => (
                        <option key={s.key} value={s.key}>
                          Stage {s.step}: {s.title}
                        </option>
                      ))}
                    </select>
                    <span className="font-mono-tabular text-amber-400 font-semibold">
                      {p.progress}%
                    </span>
                  </div>
                </div>
                <p className="text-xs text-gray-300">{p.description}</p>
                <p className="text-xs text-gray-400">
                  Collaborating Departments: {p.departmentIds.join(' · ')}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Task Manager */}
      {section === 'tasks' && workspace && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <form
            onSubmit={handleCreateTask}
            className="lg:col-span-4 p-5 rounded-xl border border-white/10 bg-[#121620] space-y-3 h-fit text-xs"
          >
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <Plus className="w-4 h-4 text-amber-400" />
              New Studio Task
            </h2>
            <input
              required
              value={taskForm.title}
              onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
              placeholder="Task title"
              className="w-full px-3 py-2 bg-[#0B0D12] border border-white/15 rounded-lg text-white"
            />
            <textarea
              required
              rows={3}
              value={taskForm.description}
              onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })}
              placeholder="Deliverable details..."
              className="w-full px-3 py-2 bg-[#0B0D12] border border-white/15 rounded-lg text-white"
            />
            <select
              value={taskForm.departmentId}
              onChange={(e) => setTaskForm({ ...taskForm, departmentId: e.target.value })}
              className="w-full px-3 py-2 bg-[#0B0D12] border border-white/15 rounded-lg text-white"
            >
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.prefix})
                </option>
              ))}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <select
                value={taskForm.priority}
                onChange={(e) => setTaskForm({ ...taskForm, priority: e.target.value })}
                className="px-3 py-2 bg-[#0B0D12] border border-white/15 rounded-lg text-white"
              >
                <option value="LOW">LOW</option>
                <option value="MEDIUM">MEDIUM</option>
                <option value="HIGH">HIGH</option>
                <option value="CRITICAL">CRITICAL</option>
              </select>
              <input
                type="date"
                value={taskForm.deadline}
                onChange={(e) => setTaskForm({ ...taskForm, deadline: e.target.value })}
                className="px-3 py-2 bg-[#0B0D12] border border-white/15 rounded-lg text-white"
              />
            </div>
            <button
              type="submit"
              className="w-full py-2 bg-amber-500 text-[#0B0D12] font-semibold rounded-lg hover:bg-amber-400 cursor-pointer"
            >
              Assign Task
            </button>
          </form>

          <div className="lg:col-span-8 space-y-3">
            {workspace.tasks.map((t) => (
              <div
                key={t.id}
                className="p-4 rounded-xl border border-white/10 bg-[#121620] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs"
              >
                <div>
                  <p className="font-mono-tabular text-amber-400">
                    {t.departmentId} · {t.priority} {t.deadline ? `· Due ${t.deadline}` : ''}
                  </p>
                  <p className="text-sm font-semibold text-white mt-0.5">{t.title}</p>
                  <p className="text-gray-400 mt-1">{t.description}</p>
                </div>
                <select
                  value={t.status}
                  onChange={(e) => handleTaskStatus(t.id, e.target.value)}
                  className="px-3 py-1.5 bg-[#0B0D12] border border-white/15 rounded-lg text-white shrink-0"
                >
                  <option value="TODO">TODO</option>
                  <option value="IN_PROGRESS">IN_PROGRESS</option>
                  <option value="IN_REVIEW">IN_REVIEW</option>
                  <option value="REVISION_REQUESTED">REVISION_REQUESTED</option>
                  <option value="DONE">DONE</option>
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Calendar */}
      {section === 'calendar' && workspace && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <form
            onSubmit={handleCreateEvent}
            className="lg:col-span-4 p-5 rounded-xl border border-white/10 bg-[#121620] space-y-3 h-fit text-xs"
          >
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <Calendar className="w-4 h-4 text-amber-400" />
              Schedule Studio Event
            </h2>
            <input
              required
              value={eventForm.title}
              onChange={(e) => setEventForm({ ...eventForm, title: e.target.value })}
              placeholder="Event title"
              className="w-full px-3 py-2 bg-[#0B0D12] border border-white/15 rounded-lg text-white"
            />
            <select
              value={eventForm.eventType}
              onChange={(e) => setEventForm({ ...eventForm, eventType: e.target.value })}
              className="w-full px-3 py-2 bg-[#0B0D12] border border-white/15 rounded-lg text-white"
            >
              <option value="STUDIO">Studio Meeting</option>
              <option value="DEPARTMENT">Department Sync</option>
              <option value="MILESTONE">Production Milestone</option>
              <option value="DEADLINE">Deadline</option>
              <option value="INTERVIEW">Applicant Interview</option>
              <option value="RELEASE">Release Date</option>
            </select>
            <input
              required
              type="datetime-local"
              value={eventForm.startsAt}
              onChange={(e) => setEventForm({ ...eventForm, startsAt: e.target.value })}
              className="w-full px-3 py-2 bg-[#0B0D12] border border-white/15 rounded-lg text-white"
            />
            <textarea
              rows={2}
              value={eventForm.description}
              onChange={(e) => setEventForm({ ...eventForm, description: e.target.value })}
              placeholder="Agenda or notes..."
              className="w-full px-3 py-2 bg-[#0B0D12] border border-white/15 rounded-lg text-white"
            />
            <button
              type="submit"
              className="w-full py-2 bg-amber-500 text-[#0B0D12] font-semibold rounded-lg hover:bg-amber-400 cursor-pointer"
            >
              Add to Calendar
            </button>
          </form>

          <div className="lg:col-span-8 space-y-3">
            {workspace.calendarEvents.map((ev) => (
              <div key={ev.id} className="p-4 rounded-xl border border-white/10 bg-[#121620] flex justify-between gap-4 text-xs">
                <div>
                  <p className="font-mono-tabular text-amber-400">{ev.eventType}</p>
                  <p className="text-sm font-semibold text-white mt-0.5">{ev.title}</p>
                  {ev.description && <p className="text-gray-400 mt-1">{ev.description}</p>}
                </div>
                <span className="font-mono-tabular text-gray-300 shrink-0">
                  {ev.startsAt.replace('T', ' ')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* File Manager & Creative Asset Library */}
      {section === 'files' && (
        <div className="space-y-5">
          <form
            onSubmit={handleUploadFile}
            className="p-5 rounded-xl border border-white/10 bg-[#121620] grid grid-cols-1 sm:grid-cols-4 gap-3 items-center text-xs"
          >
            <input
              type="file"
              onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
              className="sm:col-span-2 text-gray-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-white/10 file:text-white"
            />
            <select
              value={uploadCat}
              onChange={(e) => setUploadCat(e.target.value)}
              className="px-3 py-2 bg-[#0B0D12] border border-white/15 rounded-lg text-white"
            >
              <option value="CHARACTER">Character</option>
              <option value="BACKGROUND">Background</option>
              <option value="STORYBOARD">Storyboard</option>
              <option value="CONCEPT_ART">Concept Art</option>
              <option value="REFERENCE">Reference</option>
              <option value="MUSIC">Music</option>
              <option value="SFX">Sound Effect</option>
              <option value="VIDEO">Video</option>
              <option value="SCRIPT">Script</option>
              <option value="DOCUMENT">Document</option>
            </select>
            <div className="flex gap-2">
              <select
                value={uploadDept}
                onChange={(e) => setUploadDept(e.target.value)}
                className="flex-1 px-2 py-2 bg-[#0B0D12] border border-white/15 rounded-lg text-white"
              >
                <option value="">Studio-Wide</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.prefix}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                disabled={!uploadFile}
                className="px-4 py-2 bg-amber-500 text-[#0B0D12] font-semibold rounded-lg hover:bg-amber-400 disabled:opacity-50 cursor-pointer"
              >
                Upload
              </button>
            </div>
          </form>

          <div className="flex flex-wrap gap-3 text-xs">
            <input
              value={fileSearch}
              onChange={(e) => setFileSearch(e.target.value)}
              placeholder="Search assets..."
              className="flex-1 min-w-[200px] px-3 py-2 bg-[#121620] border border-white/15 rounded-lg text-white"
            />
            <select
              value={fileCatFilter}
              onChange={(e) => setFileCatFilter(e.target.value)}
              className="px-3 py-2 bg-[#121620] border border-white/15 rounded-lg text-white"
            >
              <option value="ALL">All Asset Categories</option>
              <option value="CHARACTER">Characters</option>
              <option value="BACKGROUND">Backgrounds</option>
              <option value="STORYBOARD">Storyboards</option>
              <option value="CONCEPT_ART">Concept Art</option>
              <option value="MUSIC">Music</option>
              <option value="SFX">SFX</option>
              <option value="VIDEO">Video</option>
              <option value="SCRIPT">Scripts</option>
              <option value="DOCUMENT">Documents</option>
            </select>
          </div>

          <div className="rounded-xl border border-white/10 bg-[#121620] divide-y divide-white/10">
            {files
              .filter(
                (f) =>
                  (!fileSearch || f.originalName.toLowerCase().includes(fileSearch.toLowerCase())) &&
                  (fileCatFilter === 'ALL' || f.assetCategory === fileCatFilter)
              )
              .map((f) => (
                <div key={f.id} className="p-4 flex items-center justify-between gap-4 text-xs">
                  <div className="flex items-center gap-3 min-w-0">
                    <FolderOpen className="w-4 h-4 text-amber-400 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-white font-medium truncate">{f.originalName}</p>
                      <p className="text-gray-400 font-mono-tabular">
                        {f.assetCategory} · {f.departmentId || 'studio'} · v{f.version} ·{' '}
                        {(f.sizeBytes / 1024).toFixed(1)} KB
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => apiDownload(`/api/studio/files/${f.id}/download`, f.originalName)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-white/10 hover:bg-white/15 text-white rounded-md cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Download
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        await apiFetch(`/api/studio/files/${f.id}`, { method: 'DELETE' });
                        await loadData();
                      }}
                      className="p-1.5 text-gray-500 hover:text-red-400 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Work Review System */}
      {section === 'reviews' && workspace && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <form
            onSubmit={handleCreateSubmission}
            className="lg:col-span-4 p-5 rounded-xl border border-white/10 bg-[#121620] space-y-3 h-fit text-xs"
          >
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <FileCheck2 className="w-4 h-4 text-amber-400" />
              Submit Work for Review
            </h2>
            <input
              required
              value={subForm.title}
              onChange={(e) => setSubForm({ ...subForm, title: e.target.value })}
              placeholder="Deliverable title"
              className="w-full px-3 py-2 bg-[#0B0D12] border border-white/15 rounded-lg text-white"
            />
            <select
              value={subForm.departmentId}
              onChange={(e) => setSubForm({ ...subForm, departmentId: e.target.value })}
              className="w-full px-3 py-2 bg-[#0B0D12] border border-white/15 rounded-lg text-white"
            >
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.prefix})
                </option>
              ))}
            </select>
            <textarea
              required
              rows={3}
              value={subForm.description}
              onChange={(e) => setSubForm({ ...subForm, description: e.target.value })}
              placeholder="Notes for reviewer..."
              className="w-full px-3 py-2 bg-[#0B0D12] border border-white/15 rounded-lg text-white"
            />
            <button
              type="submit"
              className="w-full py-2 bg-amber-500 text-[#0B0D12] font-semibold rounded-lg hover:bg-amber-400 cursor-pointer"
            >
              Submit Deliverable
            </button>
          </form>

          <div className="lg:col-span-8 space-y-3">
            {workspace.submissions.map((s) => (
              <div key={s.id} className="p-4 rounded-xl border border-white/10 bg-[#121620] space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-mono-tabular text-amber-400">
                    {s.departmentId} · Revisions: {s.revisionCount}
                  </span>
                  <span className="font-semibold text-white">{s.status}</span>
                </div>
                <h3 className="text-sm font-bold text-white">{s.title}</h3>
                <p className="text-gray-300">{s.description}</p>
                {s.feedback && (
                  <p className="text-amber-300 bg-[#0B0D12] p-2 rounded border border-white/5">
                    Feedback: {s.feedback}
                  </p>
                )}
                {['DIRECTOR', 'ADMIN', 'DEPT_HEAD'].includes(studioUser?.role || '') && (
                  <div className="flex flex-wrap gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => handleTransitionSubmission(s.id, 'UNDER_REVIEW')}
                      className="px-2.5 py-1 bg-white/10 rounded text-white cursor-pointer"
                    >
                      Mark Under Review
                    </button>
                    <button
                      type="button"
                      onClick={() => handleTransitionSubmission(s.id, 'REVISION_REQUESTED')}
                      className="px-2.5 py-1 bg-amber-500/20 text-amber-300 rounded cursor-pointer"
                    >
                      Request Revision
                    </button>
                    <button
                      type="button"
                      onClick={() => handleTransitionSubmission(s.id, 'APPROVED')}
                      className="px-2.5 py-1 bg-emerald-500/20 text-emerald-300 rounded cursor-pointer"
                    >
                      Approve Deliverable
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Announcements */}
      {section === 'announcements' && workspace && (
        <div className="space-y-6">
          {['DIRECTOR', 'ADMIN', 'DEPT_HEAD'].includes(studioUser?.role || '') && (
            <form
              onSubmit={handlePostAnnouncement}
              className="p-5 rounded-xl border border-white/10 bg-[#121620] space-y-3 text-xs"
            >
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <Megaphone className="w-4 h-4 text-amber-400" />
                Publish Announcement
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input
                  required
                  value={annForm.title}
                  onChange={(e) => setAnnForm({ ...annForm, title: e.target.value })}
                  placeholder="Headline"
                  className="sm:col-span-2 px-3 py-2 bg-[#0B0D12] border border-white/15 rounded-lg text-white"
                />
                <select
                  value={annForm.scope}
                  onChange={(e) => setAnnForm({ ...annForm, scope: e.target.value })}
                  className="px-3 py-2 bg-[#0B0D12] border border-white/15 rounded-lg text-white"
                >
                  {['DIRECTOR', 'ADMIN'].includes(studioUser?.role || '') && (
                    <option value="STUDIO">Studio-Wide</option>
                  )}
                  <option value="DEPARTMENT">Department</option>
                </select>
              </div>
              {annForm.scope === 'DEPARTMENT' && (
                <select
                  required
                  value={annForm.departmentId}
                  onChange={(e) => setAnnForm({ ...annForm, departmentId: e.target.value })}
                  className="w-full px-3 py-2 bg-[#0B0D12] border border-white/15 rounded-lg text-white"
                >
                  <option value="">Select Department...</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              )}
              <textarea
                required
                rows={3}
                value={annForm.body}
                onChange={(e) => setAnnForm({ ...annForm, body: e.target.value })}
                placeholder="Announcement message..."
                className="w-full px-3 py-2 bg-[#0B0D12] border border-white/15 rounded-lg text-white"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-amber-500 text-[#0B0D12] font-semibold rounded-lg hover:bg-amber-400 cursor-pointer"
              >
                Publish
              </button>
            </form>
          )}

          <div className="space-y-3">
            {workspace.announcements.map((a) => (
              <div key={a.id} className="p-5 rounded-xl border border-white/10 bg-[#121620] space-y-2">
                <div className="flex items-center justify-between text-xs text-gray-400">
                  <span className="font-mono-tabular text-amber-400">
                    {a.scope} {a.departmentId ? `· ${a.departmentId}` : ''}
                  </span>
                  <span className="font-mono-tabular">
                    {new Date(a.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <h3 className="text-base font-bold text-white">{a.title}</h3>
                <p className="text-sm text-gray-300 leading-relaxed">{a.body}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Free Creative Software Library */}
      {section === 'tools' && (
        <div className="space-y-5">
          <div className="p-6 rounded-xl border border-white/10 bg-[#121620]">
            <h1 className="font-display text-2xl font-bold text-white flex items-center gap-2">
              <Wrench className="w-5 h-5 text-amber-400" />
              Creative Software Library
            </h1>
            <p className="text-xs text-gray-400 mt-1">
              Verified desktop creative applications paired with Elder&apos;sVeil Anime Studio workflows. Licensing and free/commercial restrictions are documented transparently.
            </p>
            <div className="flex flex-wrap gap-3 mt-4 text-xs">
              <input
                value={toolSearch}
                onChange={(e) => setToolSearch(e.target.value)}
                placeholder="Search tool (Krita, Blender, OpenToonz, Ardour...)"
                className="flex-1 min-w-[220px] px-3 py-2 bg-[#0B0D12] border border-white/15 rounded-lg text-white"
              />
              <select
                value={toolDeptFilter}
                onChange={(e) => setToolDeptFilter(e.target.value)}
                className="px-3 py-2 bg-[#0B0D12] border border-white/15 rounded-lg text-white"
              >
                <option value="ALL">All Departments</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {tools
              .filter(
                (t) =>
                  (!toolSearch ||
                    t.name.toLowerCase().includes(toolSearch.toLowerCase()) ||
                    t.purpose.toLowerCase().includes(toolSearch.toLowerCase())) &&
                  (toolDeptFilter === 'ALL' || t.departments.includes(toolDeptFilter))
              )
              .map((tool) => (
                <div key={tool.id} className="p-5 rounded-xl border border-white/10 bg-[#121620] space-y-2.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-mono-tabular text-amber-400">{tool.category}</span>
                    <a
                      href={tool.website}
                      target="_blank"
                      rel="noreferrer"
                      className="text-amber-300 hover:underline"
                    >
                      Official Website ↗
                    </a>
                  </div>
                  <h3 className="text-base font-bold text-white">{tool.name}</h3>
                  <p className="text-gray-300 leading-relaxed">{tool.purpose}</p>
                  <p className="text-gray-400">
                    <strong className="text-gray-200">OS:</strong> {tool.operatingSystems.join(', ')} ·{' '}
                    <strong className="text-gray-200">Departments:</strong> {tool.departments.join(', ')}
                  </p>
                  <p className="text-gray-400">
                    <strong className="text-gray-200">License &amp; Cost:</strong> {tool.pricingStatus}
                  </p>
                  <div className="p-3 rounded-lg bg-[#0B0D12] border border-white/5 space-y-1.5">
                    <p className="text-gray-300">
                      <strong className="text-amber-300">Install:</strong> {tool.installGuide}
                    </p>
                    <p className="text-gray-300">
                      <strong className="text-amber-300">Studio Workflow:</strong> {tool.usageGuide}
                    </p>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Profile & Account Security */}
      {section === 'profile' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <form
            onSubmit={handleSaveProfile}
            className="p-6 rounded-xl border border-white/10 bg-[#121620] space-y-4 text-xs"
          >
            <h2 className="text-base font-semibold text-white">Member Profile</h2>
            <div>
              <label className="text-gray-400 block mb-1">Member ID</label>
              <input
                disabled
                value={studioUser?.memberId || 'Unassigned'}
                className="w-full px-3 py-2 bg-[#0B0D12] border border-white/10 rounded-lg text-amber-400 font-mono-tabular"
              />
            </div>
            <div>
              <label className="text-gray-400 block mb-1">Phone</label>
              <input
                value={profilePhone}
                onChange={(e) => setProfilePhone(e.target.value)}
                className="w-full px-3 py-2 bg-[#0B0D12] border border-white/15 rounded-lg text-white"
              />
            </div>
            <div>
              <label className="text-gray-400 block mb-1">Bio &amp; Creative Focus</label>
              <textarea
                rows={4}
                value={profileBio}
                onChange={(e) => setProfileBio(e.target.value)}
                className="w-full px-3 py-2 bg-[#0B0D12] border border-white/15 rounded-lg text-white"
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2 bg-amber-500 text-[#0B0D12] font-semibold rounded-lg hover:bg-amber-400 cursor-pointer"
            >
              Save Profile
            </button>
          </form>

          <div className="p-6 rounded-xl border border-white/10 bg-[#121620] space-y-5 text-xs">
            <h2 className="text-base font-semibold text-white flex items-center gap-2">
              <Lock className="w-4 h-4 text-amber-400" />
              Account Security Settings
            </h2>
            <form onSubmit={handleSetPassword} className="space-y-3">
              <label className="text-gray-400 block">
                Set Studio Security Credential (min 10 chars, upper + lower + digit)
              </label>
              <input
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Strong studio password"
                className="w-full px-3 py-2 bg-[#0B0D12] border border-white/15 rounded-lg text-white"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-white/10 hover:bg-white/15 text-white rounded-lg cursor-pointer"
              >
                Update Security Credential
              </button>
            </form>

            <div className="pt-4 border-t border-white/10 flex items-center justify-between">
              <div>
                <p className="font-semibold text-white">Active Session Version</p>
                <p className="text-gray-400 font-mono-tabular">v{studioUser?.sessionVersion}</p>
              </div>
              <button
                type="button"
                onClick={async () => {
                  await apiFetch('/api/auth/revoke-sessions', { method: 'POST' });
                  await refreshProfile();
                  setNotice('Session version incremented and previous tokens marked revoked.');
                }}
                className="px-3.5 py-2 border border-red-500/30 text-red-300 rounded-lg hover:bg-red-500/10 cursor-pointer"
              >
                Revoke Other Sessions
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
