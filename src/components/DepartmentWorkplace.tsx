import React, { useCallback, useEffect, useState } from 'react';
import {
  BookOpen,
  CheckCircle2,
  Download,
  FileText,
  FolderOpen,
  MessageSquare,
  Plus,
  Send,
  Trash2,
  Wrench,
} from 'lucide-react';
import { apiDownload, apiFetch } from '../lib/api.ts';
import { useStudioAuth } from '../contexts/StudioAuthContext.tsx';
import type { CreativeToolEntry, DepartmentModuleDef } from '../data/officialDepartments.ts' extends never
  ? never
  : {
      CreativeToolEntry: import('../data/officialDepartments.ts').CreativeToolEntry;
      DepartmentModuleDef: import('../db/schema.ts').DepartmentModuleDef;
    };

interface DeptWorkspaceData {
  department: {
    id: string;
    prefix: string;
    name: string;
    tagline: string;
    description: string;
    suggestedTools: string[];
    modules: DepartmentModuleDef[];
  };
  headUser: { id: number; fullName: string; memberId: string | null; email: string } | null;
  members: Array<{
    id: number;
    memberId: string | null;
    fullName: string;
    email: string;
    role: string;
    deptRole: string;
  }>;
  projects: Array<{
    id: number;
    code: string;
    title: string;
    productionStage: string;
    progress: number;
    status: string;
  }>;
  tasks: Array<{
    id: number;
    title: string;
    description: string;
    priority: string;
    status: string;
    deadline: string | null;
  }>;
  announcements: Array<{ id: number; title: string; body: string; createdAt: string }>;
  files: Array<{
    id: number;
    originalName: string;
    assetCategory: string;
    sizeBytes: number;
    version: number;
    createdAt: string;
  }>;
  submissions: Array<{
    id: number;
    title: string;
    description: string;
    status: string;
    feedback: string | null;
    revisionCount: number;
  }>;
  records: Array<{
    id: number;
    moduleKey: string;
    title: string;
    classification: string;
    summary: string;
    metadata: Record<string, string>;
    projectId: number | null;
    linkedStoryEntryId: number | null;
    createdAt: string;
  }>;
  storyEntries: Array<{
    id: number;
    chapterTitle: string;
    saga: string;
    chapterNumber: number;
  }>;
  recommendedTools: CreativeToolEntry[];
}

interface StoryEntryFull {
  id: number;
  projectId: number | null;
  universe: string;
  saga: string;
  arc: string;
  volume: string;
  chapterNumber: number;
  chapterTitle: string;
  sceneNumber: number;
  scriptText: string;
  dialogueNotes: string | null;
  continuityNotes: string | null;
  linkedRecordIds: number[];
  revisionNumber: number;
  revisionHistory: Array<{ revision: number; editedBy: string; note: string; timestamp: string }>;
  status: string;
  updatedAt: string;
}

interface ChatMsg {
  id: number;
  body: string;
  createdAt: string;
  author: { id: number; fullName: string; memberId: string | null; role: string } | null;
}

export function DepartmentWorkplace({ deptId }: { deptId: string }) {
  const { socket } = useStudioAuth();
  const [data, setData] = useState<DeptWorkspaceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [subTab, setSubTab] = useState<'modules' | 'story' | 'tasks' | 'files' | 'discussion'>('modules');
  const [activeModuleKey, setActiveModuleKey] = useState<string>('');
  const [classFilter, setClassFilter] = useState<string>('ALL');

  // New module record form
  const [recTitle, setRecTitle] = useState('');
  const [recClass, setRecClass] = useState<'HISTORICAL' | 'FICTIONAL' | 'ORIGINAL' | 'REFERENCE' | 'PRODUCTION'>('ORIGINAL');
  const [recSummary, setRecSummary] = useState('');
  const [recMeta, setRecMeta] = useState<Record<string, string>>({});
  const [recProjectId, setRecProjectId] = useState<string>('');
  const [recStoryId, setRecStoryId] = useState<string>('');
  const [savingRec, setSavingRec] = useState(false);

  // Story Studio State (for Story / Writing dept)
  const [stories, setStories] = useState<StoryEntryFull[]>([]);
  const [selectedStory, setSelectedStory] = useState<StoryEntryFull | null>(null);
  const [storyForm, setStoryForm] = useState({
    universe: "Elder'sVeil Core Universe",
    saga: 'Saga I: The Veiled Shogunate',
    arc: 'Arc 1: Crimson Mist Over Kurogane',
    volume: 'Volume 1: Blades of Twilight',
    chapterNumber: 1,
    chapterTitle: '',
    sceneNumber: 1,
    scriptText: '',
    dialogueNotes: '',
    continuityNotes: '',
    status: 'DRAFT',
  });
  const [savingStory, setSavingStory] = useState(false);

  // Discussion Channel
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [chatText, setChatText] = useState('');

  // Department Task Form
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDesc, setTaskDesc] = useState('');
  const [taskPriority, setTaskPriority] = useState('MEDIUM');
  const [taskDeadline, setTaskDeadline] = useState('');

  // File upload
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadCategory, setUploadCategory] = useState('CONCEPT_ART');

  const loadWorkspace = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<DeptWorkspaceData>(`/api/departments/${deptId}/workspace`);
      setData(res);
      if (res.department.modules.length > 0) {
        setActiveModuleKey((prev) =>
          res.department.modules.some((m) => m.key === prev) ? prev : res.department.modules[0].key
        );
      }
      if (deptId === 'story') {
        const storyRes = await apiFetch<{ entries: StoryEntryFull[] }>('/api/departments/story/entries');
        setStories(storyRes.entries);
      }
      const chatRes = await apiFetch<{ messages: ChatMsg[] }>(
        `/api/studio/discussions?channelKey=${encodeURIComponent(`dept:${deptId}`)}`
      );
      setMessages(chatRes.messages);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load department workplace.');
    } finally {
      setLoading(false);
    }
  }, [deptId]);

  useEffect(() => {
    setSubTab(deptId === 'story' ? 'story' : 'modules');
    loadWorkspace();
  }, [deptId, loadWorkspace]);

  // Realtime Socket.IO discussion listener
  useEffect(() => {
    if (!socket) return;
    const channelKey = `dept:${deptId}`;
    socket.emit('channel:join', channelKey);
    const handler = (msg: ChatMsg) => {
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
    };
    socket.on('discussion:message', handler);
    return () => {
      socket.off('discussion:message', handler);
    };
  }, [socket, deptId]);

  const handleCreateRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeModuleKey) return;
    setSavingRec(true);
    try {
      await apiFetch(`/api/departments/${deptId}/records`, {
        method: 'POST',
        body: JSON.stringify({
          moduleKey: activeModuleKey,
          title: recTitle,
          classification: recClass,
          summary: recSummary,
          metadata: recMeta,
          projectId: recProjectId ? Number(recProjectId) : null,
          linkedStoryEntryId: recStoryId ? Number(recStoryId) : null,
        }),
      });
      setRecTitle('');
      setRecSummary('');
      setRecMeta({});
      await loadWorkspace();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create record.');
    } finally {
      setSavingRec(false);
    }
  };

  const handleDeleteRecord = async (recordId: number) => {
    try {
      await apiFetch(`/api/departments/${deptId}/records/${recordId}`, { method: 'DELETE' });
      await loadWorkspace();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete record.');
    }
  };

  const handleSaveStory = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingStory(true);
    try {
      if (selectedStory) {
        await apiFetch(`/api/departments/story/entries/${selectedStory.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ ...storyForm, revisionNote: 'Updated in Story Studio' }),
        });
      } else {
        await apiFetch('/api/departments/story/entries', {
          method: 'POST',
          body: JSON.stringify(storyForm),
        });
      }
      setSelectedStory(null);
      setStoryForm({
        universe: "Elder'sVeil Core Universe",
        saga: 'Saga I: The Veiled Shogunate',
        arc: 'Arc 1: Crimson Mist Over Kurogane',
        volume: 'Volume 1: Blades of Twilight',
        chapterNumber: stories.length + 1,
        chapterTitle: '',
        sceneNumber: 1,
        scriptText: '',
        dialogueNotes: '',
        continuityNotes: '',
        status: 'DRAFT',
      });
      await loadWorkspace();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save story.');
    } finally {
      setSavingStory(false);
    }
  };

  const handleCreateDeptTask = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/studio/tasks', {
        method: 'POST',
        body: JSON.stringify({
          title: taskTitle,
          description: taskDesc,
          departmentId: deptId,
          priority: taskPriority,
          deadline: taskDeadline || null,
        }),
      });
      setTaskTitle('');
      setTaskDesc('');
      await loadWorkspace();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create task.');
    }
  };

  const handleUploadDeptFile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) return;
    try {
      const fd = new FormData();
      fd.append('file', uploadFile);
      fd.append('departmentId', deptId);
      fd.append('assetCategory', uploadCategory);
      fd.append('folder', `${deptId}-assets`);
      await apiFetch('/api/studio/files/upload', { method: 'POST', body: fd });
      setUploadFile(null);
      await loadWorkspace();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'File upload failed.');
    }
  };

  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatText.trim()) return;
    try {
      const res = await apiFetch<{ message: ChatMsg }>('/api/studio/discussions', {
        method: 'POST',
        body: JSON.stringify({
          channelType: 'DEPARTMENT',
          channelKey: `dept:${deptId}`,
          body: chatText,
        }),
      });
      setMessages((prev) =>
        prev.some((m) => m.id === res.message.id) ? prev : [...prev, res.message]
      );
      setChatText('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to post message.');
    }
  };

  if (loading) {
    return (
      <div className="p-8 rounded-xl border border-white/10 bg-[#121620] text-sm text-gray-400">
        Loading department workplace...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6 rounded-xl border border-red-500/30 bg-red-500/10 text-sm text-red-300">
        {error || 'Department unavailable.'}
      </div>
    );
  }

  const activeModule = data.department.modules.find((m) => m.key === activeModuleKey);
  const filteredRecords = data.records.filter(
    (r) =>
      r.moduleKey === activeModuleKey &&
      (classFilter === 'ALL' || r.classification === classFilter)
  );

  return (
    <div className="space-y-6">
      {/* Department Header */}
      <div className="p-6 rounded-xl border border-white/10 bg-[#121620]">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <p className="text-xs font-mono-tabular text-amber-400">
              DEPARTMENT {data.department.prefix} · ID: {data.department.id} ·{' '}
              {data.department.modules.length} SPECIALIZED MODULES
            </p>
            <h1 className="font-display text-3xl font-bold text-white mt-1">
              {data.department.name} Workplace
            </h1>
            <p className="text-sm text-gray-300 mt-1">{data.department.description}</p>
          </div>
          <div className="grid grid-cols-3 gap-3 shrink-0 text-xs">
            <div className="p-3 rounded-lg bg-[#0B0D12] border border-white/10">
              <p className="text-gray-400">Dept Head</p>
              <p className="text-white font-semibold mt-0.5 truncate max-w-[140px]">
                {data.headUser?.fullName || 'Director Oversight'}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-[#0B0D12] border border-white/10">
              <p className="text-gray-400">Members</p>
              <p className="text-white font-mono-tabular font-semibold mt-0.5">
                {data.members.length}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-[#0B0D12] border border-white/10">
              <p className="text-gray-400">Active Tasks</p>
              <p className="text-white font-mono-tabular font-semibold mt-0.5">
                {data.tasks.filter((t) => t.status !== 'DONE').length}
              </p>
            </div>
          </div>
        </div>

        {/* Sub-navigation */}
        <div className="flex flex-wrap items-center gap-2 mt-5 pt-4 border-t border-white/10">
          {deptId === 'story' && (
            <button
              type="button"
              onClick={() => setSubTab('story')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg cursor-pointer ${
                subTab === 'story'
                  ? 'bg-amber-500 text-[#0B0D12] font-semibold'
                  : 'bg-[#0B0D12] text-gray-300 hover:text-white border border-white/10'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              Story Studio &amp; PDF Export
            </button>
          )}
          <button
            type="button"
            onClick={() => setSubTab('modules')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg cursor-pointer ${
              subTab === 'modules'
                ? 'bg-amber-500 text-[#0B0D12] font-semibold'
                : 'bg-[#0B0D12] text-gray-300 hover:text-white border border-white/10'
            }`}
          >
            <Wrench className="w-3.5 h-3.5" />
            Department Modules ({data.department.modules.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('tasks')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg cursor-pointer ${
              subTab === 'tasks'
                ? 'bg-amber-500 text-[#0B0D12] font-semibold'
                : 'bg-[#0B0D12] text-gray-300 hover:text-white border border-white/10'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            Tasks &amp; Projects ({data.tasks.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('files')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg cursor-pointer ${
              subTab === 'files'
                ? 'bg-amber-500 text-[#0B0D12] font-semibold'
                : 'bg-[#0B0D12] text-gray-300 hover:text-white border border-white/10'
            }`}
          >
            <FolderOpen className="w-3.5 h-3.5" />
            Assets &amp; Files ({data.files.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('discussion')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg cursor-pointer ${
              subTab === 'discussion'
                ? 'bg-amber-500 text-[#0B0D12] font-semibold'
                : 'bg-[#0B0D12] text-gray-300 hover:text-white border border-white/10'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            Internal Discussion ({messages.length})
          </button>
        </div>
      </div>

      {/* Story / Writing Hierarchical Studio & PDF Export */}
      {subTab === 'story' && deptId === 'story' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-white">
                Canon Hierarchy (Universe → Scene)
              </h2>
              <button
                type="button"
                onClick={() => setSelectedStory(null)}
                className="text-xs text-amber-400 hover:text-amber-300 cursor-pointer"
              >
                + New Scene
              </button>
            </div>
            <div className="space-y-3">
              {stories.map((st) => (
                <div
                  key={st.id}
                  className={`p-4 rounded-xl border bg-[#121620] space-y-2 ${
                    selectedStory?.id === st.id ? 'border-amber-500/60' : 'border-white/10'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs text-gray-400">
                    <span className="font-mono-tabular text-amber-400">
                      Ch.{st.chapterNumber} · Sc.{st.sceneNumber} · v{st.revisionNumber}
                    </span>
                    <span>{st.status}</span>
                  </div>
                  <h3 className="text-sm font-semibold text-white">{st.chapterTitle}</h3>
                  <p className="text-xs text-gray-400">
                    {st.universe} › {st.saga} › {st.arc} › {st.volume}
                  </p>
                  <div className="flex items-center gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedStory(st);
                        setStoryForm({
                          universe: st.universe,
                          saga: st.saga,
                          arc: st.arc,
                          volume: st.volume,
                          chapterNumber: st.chapterNumber,
                          chapterTitle: st.chapterTitle,
                          sceneNumber: st.sceneNumber,
                          scriptText: st.scriptText,
                          dialogueNotes: st.dialogueNotes || '',
                          continuityNotes: st.continuityNotes || '',
                          status: st.status,
                        });
                      }}
                      className="px-3 py-1.5 text-xs bg-white/10 hover:bg-white/15 text-white rounded-md cursor-pointer"
                    >
                      Edit Script
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        apiDownload(
                          `/api/departments/story/entries/${st.id}/pdf`,
                          `EldersVeil_Ch${st.chapterNumber}.pdf`
                        )
                      }
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-amber-500/15 text-amber-300 hover:bg-amber-500/25 rounded-md cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Export PDF
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <form
            onSubmit={handleSaveStory}
            className="lg:col-span-7 p-6 rounded-xl border border-white/10 bg-[#121620] space-y-4"
          >
            <h2 className="text-base font-semibold text-white">
              {selectedStory ? `Editing: ${selectedStory.chapterTitle}` : 'Create New Chapter / Scene'}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="text-gray-400 block mb-1">Universe</label>
                <input
                  required
                  value={storyForm.universe}
                  onChange={(e) => setStoryForm({ ...storyForm, universe: e.target.value })}
                  className="w-full px-3 py-2 bg-[#0B0D12] border border-white/15 rounded-lg text-white"
                />
              </div>
              <div>
                <label className="text-gray-400 block mb-1">Saga</label>
                <input
                  required
                  value={storyForm.saga}
                  onChange={(e) => setStoryForm({ ...storyForm, saga: e.target.value })}
                  className="w-full px-3 py-2 bg-[#0B0D12] border border-white/15 rounded-lg text-white"
                />
              </div>
              <div>
                <label className="text-gray-400 block mb-1">Arc</label>
                <input
                  required
                  value={storyForm.arc}
                  onChange={(e) => setStoryForm({ ...storyForm, arc: e.target.value })}
                  className="w-full px-3 py-2 bg-[#0B0D12] border border-white/15 rounded-lg text-white"
                />
              </div>
              <div>
                <label className="text-gray-400 block mb-1">Volume / Tome</label>
                <input
                  required
                  value={storyForm.volume}
                  onChange={(e) => setStoryForm({ ...storyForm, volume: e.target.value })}
                  className="w-full px-3 py-2 bg-[#0B0D12] border border-white/15 rounded-lg text-white"
                />
              </div>
              <div>
                <label className="text-gray-400 block mb-1">Chapter Title</label>
                <input
                  required
                  value={storyForm.chapterTitle}
                  onChange={(e) => setStoryForm({ ...storyForm, chapterTitle: e.target.value })}
                  placeholder="Chapter Title"
                  className="w-full px-3 py-2 bg-[#0B0D12] border border-white/15 rounded-lg text-white"
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-gray-400 block mb-1">Chapter #</label>
                  <input
                    type="number"
                    min={1}
                    value={storyForm.chapterNumber}
                    onChange={(e) => setStoryForm({ ...storyForm, chapterNumber: Number(e.target.value) })}
                    className="w-full px-2 py-2 bg-[#0B0D12] border border-white/15 rounded-lg text-white"
                  />
                </div>
                <div>
                  <label className="text-gray-400 block mb-1">Scene #</label>
                  <input
                    type="number"
                    min={1}
                    value={storyForm.sceneNumber}
                    onChange={(e) => setStoryForm({ ...storyForm, sceneNumber: Number(e.target.value) })}
                    className="w-full px-2 py-2 bg-[#0B0D12] border border-white/15 rounded-lg text-white"
                  />
                </div>
                <div>
                  <label className="text-gray-400 block mb-1">Status</label>
                  <select
                    value={storyForm.status}
                    onChange={(e) => setStoryForm({ ...storyForm, status: e.target.value })}
                    className="w-full px-2 py-2 bg-[#0B0D12] border border-white/15 rounded-lg text-white"
                  >
                    <option value="DRAFT">DRAFT</option>
                    <option value="IN_REVIEW">IN_REVIEW</option>
                    <option value="APPROVED">APPROVED</option>
                  </select>
                </div>
              </div>
            </div>

            <div>
              <label className="text-xs text-gray-400 block mb-1">Script / Manuscript</label>
              <textarea
                required
                rows={7}
                value={storyForm.scriptText}
                onChange={(e) => setStoryForm({ ...storyForm, scriptText: e.target.value })}
                placeholder="INT./EXT. LOCATION — TIME..."
                className="w-full px-3 py-2.5 text-sm font-mono bg-[#0B0D12] border border-white/15 rounded-lg text-white"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="text-gray-400 block mb-1">Dialogue &amp; Voice Notes</label>
                <textarea
                  rows={2}
                  value={storyForm.dialogueNotes}
                  onChange={(e) => setStoryForm({ ...storyForm, dialogueNotes: e.target.value })}
                  className="w-full px-3 py-2 bg-[#0B0D12] border border-white/15 rounded-lg text-white"
                />
              </div>
              <div>
                <label className="text-gray-400 block mb-1">Continuity &amp; Lore Notes</label>
                <textarea
                  rows={2}
                  value={storyForm.continuityNotes}
                  onChange={(e) => setStoryForm({ ...storyForm, continuityNotes: e.target.value })}
                  className="w-full px-3 py-2 bg-[#0B0D12] border border-white/15 rounded-lg text-white"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={savingStory}
              className="px-5 py-2.5 text-xs font-semibold bg-amber-500 text-[#0B0D12] rounded-lg hover:bg-amber-400 cursor-pointer"
            >
              {savingStory ? 'Saving...' : selectedStory ? 'Save Revision' : 'Publish Story Entry'}
            </button>
          </form>
        </div>
      )}

      {/* Department-Specific Modules Workplace */}
      {subTab === 'modules' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Module Directory Sidebar */}
          <div className="lg:col-span-4 space-y-2">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-1">
              {data.department.name} Modules
            </h2>
            <div className="max-h-[620px] overflow-y-auto space-y-1 pr-1">
              {data.department.modules.map((mod, idx) => {
                const count = data.records.filter((r) => r.moduleKey === mod.key).length;
                const active = mod.key === activeModuleKey;
                return (
                  <button
                    key={mod.key}
                    type="button"
                    onClick={() => {
                      setActiveModuleKey(mod.key);
                      setRecMeta({});
                    }}
                    className={`w-full text-left px-3.5 py-2.5 rounded-lg border text-xs transition-colors cursor-pointer ${
                      active
                        ? 'bg-amber-500/15 border-amber-500/50 text-white'
                        : 'bg-[#121620] border-white/10 text-gray-300 hover:border-white/25'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium truncate">
                        {String(idx + 1).padStart(2, '0')}. {mod.title}
                      </span>
                      <span className="font-mono-tabular text-gray-400 shrink-0">{count}</span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Recommended Free Creative Tools for this Dept */}
            <div className="p-4 rounded-xl border border-white/10 bg-[#121620] mt-4">
              <p className="text-xs font-semibold text-white">Suggested External Creative Tools</p>
              <div className="mt-2 space-y-2">
                {data.recommendedTools.map((tool) => (
                  <div key={tool.id} className="text-xs border-t border-white/5 pt-2">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-amber-300">{tool.name}</span>
                      <span className="text-gray-500">{tool.category}</span>
                    </div>
                    <p className="text-gray-400 mt-0.5">{tool.purpose}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Active Module Workspace */}
          <div className="lg:col-span-8 space-y-5">
            {activeModule && (
              <>
                <div className="p-5 rounded-xl border border-white/10 bg-[#121620]">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-bold text-white">{activeModule.title}</h2>
                      <p className="text-xs text-gray-400 mt-0.5">{activeModule.description}</p>
                    </div>
                    <select
                      value={classFilter}
                      onChange={(e) => setClassFilter(e.target.value)}
                      className="px-3 py-1.5 text-xs bg-[#0B0D12] border border-white/15 rounded-lg text-gray-200"
                    >
                      <option value="ALL">All Classifications</option>
                      <option value="HISTORICAL">Historical Fact</option>
                      <option value="FICTIONAL">Fictional Creation</option>
                      <option value="ORIGINAL">Original Lore</option>
                      <option value="REFERENCE">Reference</option>
                      <option value="PRODUCTION">Production Asset</option>
                    </select>
                  </div>

                  {/* Add Record Form */}
                  <form onSubmit={handleCreateRecord} className="mt-5 pt-4 border-t border-white/10 space-y-3">
                    <p className="text-xs font-semibold text-amber-400 flex items-center gap-1.5">
                      <Plus className="w-3.5 h-3.5" />
                      Add Entry to {activeModule.title}
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                      <input
                        required
                        value={recTitle}
                        onChange={(e) => setRecTitle(e.target.value)}
                        placeholder="Entry Title"
                        className="sm:col-span-2 px-3 py-2 bg-[#0B0D12] border border-white/15 rounded-lg text-white"
                      />
                      <select
                        value={recClass}
                        onChange={(e) => setRecClass(e.target.value as typeof recClass)}
                        className="px-3 py-2 bg-[#0B0D12] border border-white/15 rounded-lg text-white"
                      >
                        <option value="ORIGINAL">Original Studio Creation</option>
                        <option value="FICTIONAL">Fictional Lore / Technique</option>
                        <option value="HISTORICAL">Historical Fact / Reference</option>
                        <option value="REFERENCE">Visual / Audio Reference</option>
                        <option value="PRODUCTION">Active Production Shot/Cut</option>
                      </select>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      {activeModule.fields.map((fieldName) => (
                        <input
                          key={fieldName}
                          value={recMeta[fieldName] || ''}
                          onChange={(e) => setRecMeta({ ...recMeta, [fieldName]: e.target.value })}
                          placeholder={fieldName}
                          className="px-3 py-2 bg-[#0B0D12] border border-white/15 rounded-lg text-white"
                        />
                      ))}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <select
                        value={recProjectId}
                        onChange={(e) => setRecProjectId(e.target.value)}
                        className="px-3 py-2 bg-[#0B0D12] border border-white/15 rounded-lg text-gray-300"
                      >
                        <option value="">Link to Studio Project (optional)</option>
                        {data.projects.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.code} — {p.title}
                          </option>
                        ))}
                      </select>
                      <select
                        value={recStoryId}
                        onChange={(e) => setRecStoryId(e.target.value)}
                        className="px-3 py-2 bg-[#0B0D12] border border-white/15 rounded-lg text-gray-300"
                      >
                        <option value="">Link to Story Chapter (optional)</option>
                        {data.storyEntries.map((s) => (
                          <option key={s.id} value={s.id}>
                            Ch.{s.chapterNumber}: {s.chapterTitle}
                          </option>
                        ))}
                      </select>
                    </div>

                    <textarea
                      required
                      rows={2}
                      value={recSummary}
                      onChange={(e) => setRecSummary(e.target.value)}
                      placeholder="Detailed lore, technical specifications, or production notes..."
                      className="w-full px-3 py-2 text-xs bg-[#0B0D12] border border-white/15 rounded-lg text-white"
                    />
                    <button
                      type="submit"
                      disabled={savingRec}
                      className="px-4 py-2 text-xs font-semibold bg-amber-500 text-[#0B0D12] rounded-lg hover:bg-amber-400 cursor-pointer"
                    >
                      {savingRec ? 'Saving Entry...' : 'Save Module Entry'}
                    </button>
                  </form>
                </div>

                {/* Records List */}
                <div className="space-y-3">
                  {filteredRecords.length === 0 ? (
                    <div className="p-8 rounded-xl border border-white/10 bg-[#121620] text-center text-xs text-gray-400">
                      No entries recorded in {activeModule.title} yet. Use the form above to add the first specification.
                    </div>
                  ) : (
                    filteredRecords.map((rec) => (
                      <div key={rec.id} className="p-5 rounded-xl border border-white/10 bg-[#121620] space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xs font-mono-tabular text-amber-400">
                              {rec.classification} · {new Date(rec.createdAt).toLocaleDateString()}
                            </p>
                            <h3 className="text-base font-semibold text-white mt-0.5">{rec.title}</h3>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleDeleteRecord(rec.id)}
                            title="Delete entry"
                            className="p-1.5 text-gray-500 hover:text-red-400 cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                        <p className="text-sm text-gray-300 leading-relaxed">{rec.summary}</p>
                        {Object.keys(rec.metadata || {}).length > 0 && (
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-white/10 text-xs">
                            {Object.entries(rec.metadata).map(([k, v]) => (
                              <div key={k}>
                                <p className="text-gray-500">{k}</p>
                                <p className="text-gray-200 mt-0.5">{v || '—'}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Department Tasks & Projects */}
      {subTab === 'tasks' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <form
            onSubmit={handleCreateDeptTask}
            className="lg:col-span-4 p-5 rounded-xl border border-white/10 bg-[#121620] space-y-3 h-fit"
          >
            <h3 className="text-sm font-semibold text-white">Assign Department Task</h3>
            <input
              required
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              placeholder="Task title"
              className="w-full px-3 py-2 text-xs bg-[#0B0D12] border border-white/15 rounded-lg text-white"
            />
            <textarea
              required
              rows={3}
              value={taskDesc}
              onChange={(e) => setTaskDesc(e.target.value)}
              placeholder="Deliverable details..."
              className="w-full px-3 py-2 text-xs bg-[#0B0D12] border border-white/15 rounded-lg text-white"
            />
            <div className="grid grid-cols-2 gap-2 text-xs">
              <select
                value={taskPriority}
                onChange={(e) => setTaskPriority(e.target.value)}
                className="px-3 py-2 bg-[#0B0D12] border border-white/15 rounded-lg text-white"
              >
                <option value="LOW">LOW</option>
                <option value="MEDIUM">MEDIUM</option>
                <option value="HIGH">HIGH</option>
                <option value="CRITICAL">CRITICAL</option>
              </select>
              <input
                type="date"
                value={taskDeadline}
                onChange={(e) => setTaskDeadline(e.target.value)}
                className="px-3 py-2 bg-[#0B0D12] border border-white/15 rounded-lg text-white"
              />
            </div>
            <button
              type="submit"
              className="w-full py-2 text-xs font-semibold bg-amber-500 text-[#0B0D12] rounded-lg hover:bg-amber-400 cursor-pointer"
            >
              Create Task
            </button>
          </form>

          <div className="lg:col-span-8 space-y-3">
            {data.tasks.length === 0 ? (
              <div className="p-8 rounded-xl border border-white/10 bg-[#121620] text-center text-xs text-gray-400">
                No department tasks created yet.
              </div>
            ) : (
              data.tasks.map((t) => (
                <div key={t.id} className="p-4 rounded-xl border border-white/10 bg-[#121620] flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-mono-tabular text-amber-400">
                      {t.priority} · {t.status} {t.deadline ? `· Due ${t.deadline}` : ''}
                    </p>
                    <p className="text-sm font-semibold text-white mt-0.5">{t.title}</p>
                    <p className="text-xs text-gray-400 mt-1">{t.description}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Department Files */}
      {subTab === 'files' && (
        <div className="space-y-4">
          <form
            onSubmit={handleUploadDeptFile}
            className="p-5 rounded-xl border border-white/10 bg-[#121620] flex flex-col sm:flex-row items-center gap-3"
          >
            <input
              type="file"
              onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
              className="flex-1 text-xs text-gray-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-white/10 file:text-white"
            />
            <select
              value={uploadCategory}
              onChange={(e) => setUploadCategory(e.target.value)}
              className="px-3 py-2 text-xs bg-[#0B0D12] border border-white/15 rounded-lg text-white"
            >
              <option value="CONCEPT_ART">Concept Art</option>
              <option value="CHARACTER">Character Sheet</option>
              <option value="BACKGROUND">Background</option>
              <option value="STORYBOARD">Storyboard</option>
              <option value="SCRIPT">Script</option>
              <option value="MUSIC">Music</option>
              <option value="SFX">Sound Effect</option>
              <option value="VIDEO">Video Cut</option>
              <option value="DOCUMENT">Document</option>
            </select>
            <button
              type="submit"
              disabled={!uploadFile}
              className="px-4 py-2 text-xs font-semibold bg-amber-500 text-[#0B0D12] rounded-lg hover:bg-amber-400 disabled:opacity-50 cursor-pointer"
            >
              Upload Asset
            </button>
          </form>

          <div className="rounded-xl border border-white/10 bg-[#121620] divide-y divide-white/10">
            {data.files.length === 0 ? (
              <p className="p-6 text-center text-xs text-gray-400">No files uploaded to this department yet.</p>
            ) : (
              data.files.map((f) => (
                <div key={f.id} className="p-4 flex items-center justify-between gap-4 text-xs">
                  <div className="flex items-center gap-3 min-w-0">
                    <FileText className="w-4 h-4 text-amber-400 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-white font-medium truncate">{f.originalName}</p>
                      <p className="text-gray-400 font-mono-tabular">
                        {f.assetCategory} · v{f.version} · {(f.sizeBytes / 1024).toFixed(1)} KB
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => apiDownload(`/api/studio/files/${f.id}/download`, f.originalName)}
                    className="px-3 py-1.5 bg-white/10 hover:bg-white/15 text-white rounded-md shrink-0 cursor-pointer"
                  >
                    Download
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Department Real-Time Discussion */}
      {subTab === 'discussion' && (
        <div className="rounded-xl border border-white/10 bg-[#121620] flex flex-col h-[480px]">
          <div className="p-4 border-b border-white/10 text-xs text-gray-400">
            Real-time Department Channel · <span className="text-white">{data.department.name}</span>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 ? (
              <p className="text-xs text-gray-500 text-center pt-12">
                No messages yet. Start a department discussion below.
              </p>
            ) : (
              messages.map((m) => (
                <div key={m.id} className="p-3 rounded-lg bg-[#0B0D12] border border-white/5 text-xs">
                  <div className="flex items-center justify-between text-gray-400">
                    <span className="font-semibold text-amber-300">
                      {m.author?.fullName || 'Member'} ({m.author?.role || 'MEMBER'})
                    </span>
                    <span className="font-mono-tabular">
                      {new Date(m.createdAt).toLocaleTimeString()}
                    </span>
                  </div>
                  <p className="text-gray-200 mt-1.5">{m.body}</p>
                </div>
              ))
            )}
          </div>
          <form onSubmit={handleSendChat} className="p-3 border-t border-white/10 flex gap-2">
            <input
              value={chatText}
              onChange={(e) => setChatText(e.target.value)}
              placeholder={`Message ${data.department.name} team...`}
              className="flex-1 px-3 py-2 text-xs bg-[#0B0D12] border border-white/15 rounded-lg text-white"
            />
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-amber-500 text-[#0B0D12] rounded-lg hover:bg-amber-400 cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              Send
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
