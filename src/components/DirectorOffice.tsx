import React, { useCallback, useEffect, useState } from 'react';
import {
  Building2,
  Check,
  DatabaseBackup,
  Download,
  KeyRound,
  Mail,
  MessageSquareText,
  RefreshCw,
  Search,
  ShieldAlert,
  UserCheck,
  Users,
} from 'lucide-react';
import { apiDownload, apiFetch } from '../lib/api.ts';
import { useStudioAuth } from '../contexts/StudioAuthContext.tsx';

type OfficeTab = 'executive' | 'applications' | 'members' | 'departments' | 'audit' | 'integrations';

interface ExecutiveDashboardData {
  metrics: {
    totalMembers: number;
    activeMembers: number;
    inactiveMembers: number;
    totalDepartments: number;
    pendingApplications: number;
    approvedApplications: number;
    rejectedApplications: number;
    activeProjects: number;
    completedProjects: number;
    overdueTasks: number;
  };
  departmentSummaries: Array<{
    id: string;
    prefix: string;
    name: string;
    memberCount: number;
    taskTotal: number;
    taskCompleted: number;
    headName: string | null;
  }>;
  upcomingEvents: Array<{ id: number; title: string; eventType: string; startsAt: string }>;
  recentAudit: Array<{
    id: number;
    action: string;
    actorEmail: string | null;
    entityType: string;
    entityId: string | null;
    createdAt: string;
  }>;
}

interface AdminApplication {
  id: number;
  trackingCode: string;
  fullName: string;
  email: string;
  phone: string;
  introduction: string;
  departmentId: string;
  skills: string;
  experience: string;
  portfolioUrl: string | null;
  availability: string;
  reasonForJoining: string;
  status: string;
  internalNotes: string | null;
  interviewScheduledAt: string | null;
  assessmentPrompt: string | null;
  approvedMemberId: string | null;
  inviteCode: string | null;
  resumeFile: { id: number; originalName: string } | null;
  sampleFile: { id: number; originalName: string } | null;
  createdAt: string;
}

interface AdminMember {
  id: number;
  memberId: string | null;
  email: string;
  fullName: string;
  role: string;
  status: string;
  phone: string | null;
  departments: Array<{ departmentId: string; deptRole: string }>;
}

interface AdminDepartment {
  id: string;
  prefix: string;
  name: string;
  tagline: string;
  headUser: { id: number; fullName: string; memberId: string | null } | null;
  members: Array<{ id: number; fullName: string; memberId: string | null; deptRole: string }>;
}

interface DeliveryLog {
  id: number;
  channel: string;
  recipient: string;
  subject: string | null;
  status: string;
  provider: string;
  errorMessage: string | null;
  attempts: number;
  createdAt: string;
}

export function DirectorOffice() {
  const { studioUser } = useStudioAuth();
  const isDirector = studioUser?.role === 'DIRECTOR';

  const [tab, setTab] = useState<OfficeTab>('executive');
  const [dashboard, setDashboard] = useState<ExecutiveDashboardData | null>(null);
  const [applications, setApplications] = useState<AdminApplication[]>([]);
  const [members, setMembers] = useState<AdminMember[]>([]);
  const [departments, setDepartments] = useState<AdminDepartment[]>([]);
  const [auditLogs, setAuditLogs] = useState<ExecutiveDashboardData['recentAudit']>([]);
  const [deliveries, setDeliveries] = useState<DeliveryLog[]>([]);
  const [envStatus, setEnvStatus] = useState<Record<string, unknown> | null>(null);

  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [memberSearch, setMemberSearch] = useState('');
  const [memberDeptFilter, setMemberDeptFilter] = useState('ALL');
  const [memberRoleFilter, setMemberRoleFilter] = useState('ALL');
  const [appFilter, setAppFilter] = useState('ALL');

  // Create Member Form
  const [newMember, setNewMember] = useState({
    fullName: '',
    email: '',
    role: 'MEMBER',
    departmentId: 'samurai',
    phone: '',
  });

  // Application decision modal/drawer state
  const [selectedApp, setSelectedApp] = useState<AdminApplication | null>(null);
  const [decisionStatus, setDecisionStatus] = useState('UNDER_REVIEW');
  const [decisionNote, setDecisionNote] = useState('');
  const [decisionInterview, setDecisionInterview] = useState('');
  const [decisionAssessment, setDecisionAssessment] = useState('');
  const [decisionRole, setDecisionRole] = useState<'MEMBER' | 'DEPT_HEAD'>('MEMBER');

  // Assign Head / Member
  const [assignDeptId, setAssignDeptId] = useState('samurai');
  const [assignUserId, setAssignUserId] = useState('');

  // Create future department (Director only)
  const [newDept, setNewDept] = useState({ id: '', prefix: '', name: '', tagline: '', description: '' });

  // Integration test
  const [testEmailTo, setTestEmailTo] = useState('black0warrior0143@gmail.com');
  const [testSmsTo, setTestSmsTo] = useState('+919443498638');

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [dashRes, appsRes, memRes, deptRes, auditRes, intRes] = await Promise.all([
        apiFetch<ExecutiveDashboardData>('/api/admin/dashboard'),
        apiFetch<{ applications: AdminApplication[] }>('/api/admin/applications'),
        apiFetch<{ members: AdminMember[] }>('/api/admin/members'),
        apiFetch<{ departments: AdminDepartment[] }>('/api/admin/departments'),
        apiFetch<{ logs: ExecutiveDashboardData['recentAudit'] }>('/api/admin/audit-logs'),
        apiFetch<{ deliveries: DeliveryLog[]; environmentStatus: Record<string, unknown> }>(
          '/api/admin/integrations'
        ),
      ]);
      setDashboard(dashRes);
      setApplications(appsRes.applications);
      setMembers(memRes.members);
      setDepartments(deptRes.departments);
      setAuditLogs(auditRes.logs);
      setDeliveries(intRes.deliveries);
      setEnvStatus(intRes.environmentStatus);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load administration console.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleCreateMember = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotice(null);
    setError(null);
    try {
      const res = await apiFetch<{ member: AdminMember }>('/api/admin/members', {
        method: 'POST',
        body: JSON.stringify(newMember),
      });
      setNotice(`Created member ${res.member.fullName} (${res.member.memberId}).`);
      setNewMember({ fullName: '', email: '', role: 'MEMBER', departmentId: 'samurai', phone: '' });
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create member.');
    }
  };

  const handleToggleMemberStatus = async (m: AdminMember) => {
    setNotice(null);
    setError(null);
    try {
      const next = m.status === 'DISABLED' ? 'ACTIVE' : 'DISABLED';
      await apiFetch(`/api/admin/members/${m.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: next }),
      });
      setNotice(`Account ${m.email} set to ${next}.`);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action denied.');
    }
  };

  const handleChangeMemberRole = async (m: AdminMember, role: string) => {
    setNotice(null);
    setError(null);
    try {
      await apiFetch(`/api/admin/members/${m.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ role }),
      });
      setNotice(`Updated role for ${m.fullName} to ${role}.`);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Role update failed.');
    }
  };

  const handleResetPassword = async (m: AdminMember) => {
    setNotice(null);
    setError(null);
    try {
      const res = await apiFetch<{ temporaryCredential: string }>(
        `/api/admin/members/${m.id}/reset-password`,
        { method: 'POST' }
      );
      setNotice(`Generated temporary credential for ${m.email}: ${res.temporaryCredential}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset password.');
    }
  };

  const handleRevokeSessions = async (m: AdminMember) => {
    setNotice(null);
    setError(null);
    try {
      await apiFetch(`/api/admin/members/${m.id}/revoke-sessions`, { method: 'POST' });
      setNotice(`Active sessions revoked for ${m.email}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke sessions.');
    }
  };

  const handleApplicationDecision = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedApp) return;
    setError(null);
    setNotice(null);
    try {
      const res = await apiFetch<{ application: AdminApplication }>(
        `/api/admin/applications/${selectedApp.id}/decision`,
        {
          method: 'POST',
          body: JSON.stringify({
            status: decisionStatus,
            note: decisionNote,
            interviewScheduledAt: decisionInterview || undefined,
            assessmentPrompt: decisionAssessment || undefined,
            assignedRole: decisionRole,
          }),
        }
      );
      setNotice(
        res.application.status === 'APPROVED'
          ? `Approved ${res.application.fullName} — Member ID: ${res.application.approvedMemberId} · Invite Code: ${res.application.inviteCode}`
          : `Application ${res.application.trackingCode} updated to ${res.application.status}.`
      );
      setSelectedApp(null);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Decision failed.');
    }
  };

  const handleAssignHead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignUserId) return;
    try {
      await apiFetch(`/api/admin/departments/${assignDeptId}/head`, {
        method: 'POST',
        body: JSON.stringify({ userId: Number(assignUserId) }),
      });
      setNotice(`Assigned Department Head for ${assignDeptId}.`);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to assign Department Head.');
    }
  };

  const handleCreateFutureDept = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/admin/departments', {
        method: 'POST',
        body: JSON.stringify(newDept),
      });
      setNotice(`Created department ${newDept.name}.`);
      setNewDept({ id: '', prefix: '', name: '', tagline: '', description: '' });
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create department.');
    }
  };

  const handleTestEmail = async () => {
    try {
      const res = await apiFetch<{ delivery: DeliveryLog }>('/api/admin/integrations/test-email', {
        method: 'POST',
        body: JSON.stringify({ to: testEmailTo }),
      });
      setNotice(
        `Email test result: ${res.delivery.status}${res.delivery.errorMessage ? ` (${res.delivery.errorMessage})` : ''}`
      );
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Email test failed.');
    }
  };

  const handleTestSms = async () => {
    try {
      const res = await apiFetch<{ delivery: DeliveryLog }>('/api/admin/integrations/test-sms', {
        method: 'POST',
        body: JSON.stringify({ to: testSmsTo }),
      });
      setNotice(
        `SMS test result: ${res.delivery.status}${res.delivery.errorMessage ? ` (${res.delivery.errorMessage})` : ''}`
      );
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'SMS test failed.');
    }
  };

  const filteredMembers = members.filter((m) => {
    const matchesSearch =
      !memberSearch ||
      m.fullName.toLowerCase().includes(memberSearch.toLowerCase()) ||
      m.email.toLowerCase().includes(memberSearch.toLowerCase()) ||
      (m.memberId || '').toLowerCase().includes(memberSearch.toLowerCase());
    const matchesRole = memberRoleFilter === 'ALL' || m.role === memberRoleFilter;
    const matchesDept =
      memberDeptFilter === 'ALL' || m.departments.some((d) => d.departmentId === memberDeptFilter);
    return matchesSearch && matchesRole && matchesDept;
  });

  const filteredApps = applications.filter(
    (a) => appFilter === 'ALL' || a.status === appFilter
  );

  return (
    <div className="space-y-6">
      <div className="p-6 rounded-xl border border-white/10 bg-[#121620] flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <p className="text-xs font-mono-tabular text-amber-400">
            {isDirector ? "CENTRAL DIRECTOR'S OFFICE · FOUNDER AUTHORITY" : 'ADMIN WORKPLACE · DELEGATED GOVERNANCE'}
          </p>
          <h1 className="font-display text-3xl font-bold text-white mt-1">
            {isDirector ? "Founder & Director's Office" : 'Studio Administration Workplace'}
          </h1>
          <p className="text-xs text-gray-400 mt-1">
            {isDirector
              ? 'Complete studio command across all 10 departments, recruitment approvals, member credentials, integrations, and immutable audit trails.'
              : 'Authorized member onboarding, application review, and department monitoring. Director-only actions and secrets remain restricted.'}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {(['executive', 'applications', 'members', 'departments', 'audit', 'integrations'] as OfficeTab[]).map(
            (t) => {
              if (t === 'integrations' && !isDirector) return null;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={`px-3.5 py-2 text-xs font-medium rounded-lg capitalize cursor-pointer ${
                    tab === t
                      ? 'bg-amber-500 text-[#0B0D12] font-semibold'
                      : 'bg-[#0B0D12] text-gray-300 border border-white/10 hover:text-white'
                  }`}
                >
                  {t === 'executive'
                    ? 'Dashboard'
                    : t === 'integrations'
                      ? 'Email / SMS / Backups'
                      : t}
                </button>
              );
            }
          )}
        </div>
      </div>

      {notice && (
        <div className="p-3.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-xs text-emerald-300 flex items-center justify-between gap-4">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} className="text-emerald-200 underline cursor-pointer">
            Dismiss
          </button>
        </div>
      )}

      {error && (
        <div className="p-3.5 rounded-lg border border-red-500/30 bg-red-500/10 text-xs text-red-300">
          {error}
        </div>
      )}

      {loading && !dashboard ? (
        <div className="p-8 rounded-xl border border-white/10 bg-[#121620] text-sm text-gray-400">
          Loading executive database telemetry...
        </div>
      ) : null}

      {/* Executive Dashboard */}
      {tab === 'executive' && dashboard && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="p-4 rounded-xl border border-white/10 bg-[#121620]">
              <p className="text-xs text-gray-400">Total Members</p>
              <p className="text-2xl font-bold font-mono-tabular text-white mt-1">
                {dashboard.metrics.totalMembers}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                {dashboard.metrics.activeMembers} Active · {dashboard.metrics.inactiveMembers} Inactive
              </p>
            </div>
            <div className="p-4 rounded-xl border border-white/10 bg-[#121620]">
              <p className="text-xs text-gray-400">Departments</p>
              <p className="text-2xl font-bold font-mono-tabular text-amber-400 mt-1">
                {dashboard.metrics.totalDepartments}
              </p>
              <p className="text-xs text-gray-400 mt-1">Official studio units</p>
            </div>
            <div className="p-4 rounded-xl border border-white/10 bg-[#121620]">
              <p className="text-xs text-gray-400">Applications</p>
              <p className="text-2xl font-bold font-mono-tabular text-white mt-1">
                {dashboard.metrics.pendingApplications} Pending
              </p>
              <p className="text-xs text-gray-400 mt-1">
                {dashboard.metrics.approvedApplications} Approved · {dashboard.metrics.rejectedApplications} Rejected
              </p>
            </div>
            <div className="p-4 rounded-xl border border-white/10 bg-[#121620]">
              <p className="text-xs text-gray-400">Projects</p>
              <p className="text-2xl font-bold font-mono-tabular text-white mt-1">
                {dashboard.metrics.activeProjects} Active
              </p>
              <p className="text-xs text-gray-400 mt-1">
                {dashboard.metrics.completedProjects} Completed
              </p>
            </div>
            <div className="p-4 rounded-xl border border-white/10 bg-[#121620]">
              <p className="text-xs text-gray-400">Overdue Tasks</p>
              <p
                className={`text-2xl font-bold font-mono-tabular mt-1 ${
                  dashboard.metrics.overdueTasks > 0 ? 'text-red-400' : 'text-emerald-400'
                }`}
              >
                {dashboard.metrics.overdueTasks}
              </p>
              <p className="text-xs text-gray-400 mt-1">Across all departments</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 rounded-xl border border-white/10 bg-[#121620] overflow-hidden">
              <div className="p-4 border-b border-white/10">
                <h2 className="text-sm font-semibold text-white">
                  Ten-Department Performance Summary
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-[#0B0D12] text-gray-400">
                    <tr>
                      <th className="text-left px-4 py-2.5 font-medium">Prefix</th>
                      <th className="text-left px-4 py-2.5 font-medium">Department</th>
                      <th className="text-left px-4 py-2.5 font-medium">Head</th>
                      <th className="text-right px-4 py-2.5 font-medium">Members</th>
                      <th className="text-right px-4 py-2.5 font-medium">Tasks Done</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {dashboard.departmentSummaries.map((d) => (
                      <tr key={d.id} className="hover:bg-white/[0.02]">
                        <td className="px-4 py-2.5 font-mono-tabular text-amber-400">{d.prefix}</td>
                        <td className="px-4 py-2.5 text-white font-medium">{d.name}</td>
                        <td className="px-4 py-2.5 text-gray-400">{d.headName || 'Director'}</td>
                        <td className="px-4 py-2.5 text-right font-mono-tabular text-gray-200">
                          {d.memberCount}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono-tabular text-gray-200">
                          {d.taskCompleted}/{d.taskTotal}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="lg:col-span-5 rounded-xl border border-white/10 bg-[#121620] p-4 space-y-3">
              <h2 className="text-sm font-semibold text-white">Recent Studio Activity</h2>
              <div className="space-y-2 max-h-[380px] overflow-y-auto">
                {dashboard.recentAudit.map((log) => (
                  <div key={log.id} className="p-2.5 rounded-lg bg-[#0B0D12] border border-white/5 text-xs">
                    <div className="flex items-center justify-between text-gray-400">
                      <span className="font-mono-tabular text-amber-300">{log.action}</span>
                      <span className="font-mono-tabular">
                        {new Date(log.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-gray-300 mt-1">
                      {log.actorEmail || 'System'} · {log.entityType} {log.entityId || ''}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Application Management */}
      {tab === 'applications' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-white">
              Recruitment Queue ({filteredApps.length})
            </h2>
            <select
              value={appFilter}
              onChange={(e) => setAppFilter(e.target.value)}
              className="px-3 py-2 text-xs bg-[#121620] border border-white/15 rounded-lg text-white"
            >
              <option value="ALL">All Statuses</option>
              <option value="RECEIVED">RECEIVED</option>
              <option value="UNDER_REVIEW">UNDER_REVIEW</option>
              <option value="SHORTLISTED">SHORTLISTED</option>
              <option value="INTERVIEW_SCHEDULED">INTERVIEW_SCHEDULED</option>
              <option value="ASSESSMENT_REQUESTED">ASSESSMENT_REQUESTED</option>
              <option value="APPROVED">APPROVED</option>
              <option value="REJECTED">REJECTED</option>
            </select>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 space-y-3">
              {filteredApps.length === 0 ? (
                <div className="p-8 rounded-xl border border-white/10 bg-[#121620] text-center text-xs text-gray-400">
                  No applications match this filter.
                </div>
              ) : (
                filteredApps.map((app) => (
                  <div
                    key={app.id}
                    className={`p-4 rounded-xl border bg-[#121620] space-y-2 ${
                      selectedApp?.id === app.id ? 'border-amber-500/60' : 'border-white/10'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-mono-tabular text-amber-400">
                        {app.trackingCode} · {app.departmentId}
                      </span>
                      <span className="font-semibold text-white">{app.status}</span>
                    </div>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-sm font-bold text-white">{app.fullName}</h3>
                        <p className="text-xs text-gray-400">
                          {app.email} · {app.phone}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedApp(app);
                          setDecisionStatus(app.status === 'RECEIVED' ? 'UNDER_REVIEW' : app.status);
                          setDecisionNote(app.internalNotes || '');
                          setDecisionAssessment(app.assessmentPrompt || '');
                        }}
                        className="px-3 py-1.5 text-xs bg-amber-500 text-[#0B0D12] font-semibold rounded-md hover:bg-amber-400 shrink-0 cursor-pointer"
                      >
                        Review
                      </button>
                    </div>
                    <p className="text-xs text-gray-300">{app.introduction}</p>
                    <p className="text-xs text-gray-400">
                      Skills: {app.skills} · Availability: {app.availability}
                    </p>
                    <div className="flex flex-wrap gap-3 text-xs pt-1">
                      {app.portfolioUrl && (
                        <a
                          href={app.portfolioUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-amber-400 hover:underline"
                        >
                          Open Portfolio ↗
                        </a>
                      )}
                      {app.resumeFile && (
                        <button
                          type="button"
                          onClick={() =>
                            apiDownload(
                              `/api/studio/files/${app.resumeFile!.id}/download`,
                              app.resumeFile!.originalName
                            )
                          }
                          className="text-amber-300 hover:underline cursor-pointer"
                        >
                          Download Resume ({app.resumeFile.originalName})
                        </button>
                      )}
                      {app.sampleFile && (
                        <button
                          type="button"
                          onClick={() =>
                            apiDownload(
                              `/api/studio/files/${app.sampleFile!.id}/download`,
                              app.sampleFile!.originalName
                            )
                          }
                          className="text-amber-300 hover:underline cursor-pointer"
                        >
                          Download Sample ({app.sampleFile.originalName})
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="lg:col-span-5">
              {selectedApp ? (
                <form
                  onSubmit={handleApplicationDecision}
                  className="p-5 rounded-xl border border-white/10 bg-[#121620] space-y-4 sticky top-20"
                >
                  <h3 className="text-sm font-bold text-white">
                    Review Decision — {selectedApp.fullName}
                  </h3>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Next Status</label>
                    <select
                      value={decisionStatus}
                      onChange={(e) => setDecisionStatus(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-[#0B0D12] border border-white/15 rounded-lg text-white"
                    >
                      <option value="UNDER_REVIEW">UNDER_REVIEW</option>
                      <option value="SHORTLISTED">SHORTLISTED</option>
                      <option value="INTERVIEW_SCHEDULED">INTERVIEW_SCHEDULED</option>
                      <option value="ASSESSMENT_REQUESTED">ASSESSMENT_REQUESTED</option>
                      <option value="APPROVED">APPROVED (Provision Member Account)</option>
                      <option value="REJECTED">REJECTED</option>
                    </select>
                  </div>

                  {decisionStatus === 'INTERVIEW_SCHEDULED' && (
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Interview Date &amp; Time</label>
                      <input
                        type="datetime-local"
                        value={decisionInterview}
                        onChange={(e) => setDecisionInterview(e.target.value)}
                        className="w-full px-3 py-2 text-xs bg-[#0B0D12] border border-white/15 rounded-lg text-white"
                      />
                    </div>
                  )}

                  {decisionStatus === 'ASSESSMENT_REQUESTED' && (
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Assessment Instructions</label>
                      <textarea
                        rows={2}
                        value={decisionAssessment}
                        onChange={(e) => setDecisionAssessment(e.target.value)}
                        placeholder="Describe creative test prompt..."
                        className="w-full px-3 py-2 text-xs bg-[#0B0D12] border border-white/15 rounded-lg text-white"
                      />
                    </div>
                  )}

                  {decisionStatus === 'APPROVED' && (
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Assign Studio Role</label>
                      <select
                        value={decisionRole}
                        onChange={(e) => setDecisionRole(e.target.value as 'MEMBER' | 'DEPT_HEAD')}
                        className="w-full px-3 py-2 text-xs bg-[#0B0D12] border border-white/15 rounded-lg text-white"
                      >
                        <option value="MEMBER">Department Member</option>
                        <option value="DEPT_HEAD">Department Head</option>
                      </select>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Internal Review Notes</label>
                    <textarea
                      rows={3}
                      value={decisionNote}
                      onChange={(e) => setDecisionNote(e.target.value)}
                      placeholder="Portfolio evaluation, interview notes..."
                      className="w-full px-3 py-2 text-xs bg-[#0B0D12] border border-white/15 rounded-lg text-white"
                    />
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="submit"
                      className="flex-1 py-2 text-xs font-semibold bg-amber-500 text-[#0B0D12] rounded-lg hover:bg-amber-400 cursor-pointer"
                    >
                      Save Decision
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedApp(null)}
                      className="px-3 py-2 text-xs border border-white/15 text-gray-300 rounded-lg cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <div className="p-6 rounded-xl border border-white/10 bg-[#121620] text-xs text-gray-400">
                  Select an applicant from the queue to review attachments, schedule interviews, or approve onboarding.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Member Management */}
      {tab === 'members' && (
        <div className="space-y-6">
          <form
            onSubmit={handleCreateMember}
            className="p-5 rounded-xl border border-white/10 bg-[#121620] space-y-3"
          >
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-amber-400" />
              Create Studio Member Account
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 text-xs">
              <input
                required
                value={newMember.fullName}
                onChange={(e) => setNewMember({ ...newMember, fullName: e.target.value })}
                placeholder="Full Name"
                className="px-3 py-2 bg-[#0B0D12] border border-white/15 rounded-lg text-white"
              />
              <input
                required
                type="email"
                value={newMember.email}
                onChange={(e) => setNewMember({ ...newMember, email: e.target.value })}
                placeholder="Google Email"
                className="px-3 py-2 bg-[#0B0D12] border border-white/15 rounded-lg text-white"
              />
              <select
                value={newMember.departmentId}
                onChange={(e) => setNewMember({ ...newMember, departmentId: e.target.value })}
                className="px-3 py-2 bg-[#0B0D12] border border-white/15 rounded-lg text-white"
              >
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.prefix})
                  </option>
                ))}
              </select>
              <select
                value={newMember.role}
                onChange={(e) => setNewMember({ ...newMember, role: e.target.value })}
                className="px-3 py-2 bg-[#0B0D12] border border-white/15 rounded-lg text-white"
              >
                <option value="MEMBER">MEMBER</option>
                <option value="DEPT_HEAD">DEPT_HEAD</option>
                {isDirector && <option value="ADMIN">ADMIN (Director-only)</option>}
              </select>
              <button
                type="submit"
                className="px-4 py-2 bg-amber-500 text-[#0B0D12] font-semibold rounded-lg hover:bg-amber-400 cursor-pointer"
              >
                Provision Member
              </button>
            </div>
          </form>

          {/* Search & Filter */}
          <div className="flex flex-wrap gap-3 text-xs">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-2.5" />
              <input
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                placeholder="Search by name, email, or Member ID..."
                className="w-full pl-8 pr-3 py-2 bg-[#121620] border border-white/15 rounded-lg text-white"
              />
            </div>
            <select
              value={memberDeptFilter}
              onChange={(e) => setMemberDeptFilter(e.target.value)}
              className="px-3 py-2 bg-[#121620] border border-white/15 rounded-lg text-white"
            >
              <option value="ALL">All Departments</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            <select
              value={memberRoleFilter}
              onChange={(e) => setMemberRoleFilter(e.target.value)}
              className="px-3 py-2 bg-[#121620] border border-white/15 rounded-lg text-white"
            >
              <option value="ALL">All Roles</option>
              <option value="DIRECTOR">DIRECTOR</option>
              <option value="ADMIN">ADMIN</option>
              <option value="DEPT_HEAD">DEPT_HEAD</option>
              <option value="MEMBER">MEMBER</option>
              <option value="GUEST">GUEST</option>
            </select>
          </div>

          <div className="rounded-xl border border-white/10 bg-[#121620] overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-[#0B0D12] text-gray-400">
                <tr>
                  <th className="text-left px-4 py-3">Member ID</th>
                  <th className="text-left px-4 py-3">Name &amp; Email</th>
                  <th className="text-left px-4 py-3">Role</th>
                  <th className="text-left px-4 py-3">Departments</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-right px-4 py-3">Security Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredMembers.map((m) => {
                  const lockedForAdmin = !isDirector && (m.role === 'DIRECTOR' || m.role === 'ADMIN');
                  return (
                    <tr key={m.id}>
                      <td className="px-4 py-3 font-mono-tabular text-amber-400">
                        {m.memberId || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-white font-medium">{m.fullName}</p>
                        <p className="text-gray-400">{m.email}</p>
                      </td>
                      <td className="px-4 py-3">
                        {m.role === 'DIRECTOR' || lockedForAdmin ? (
                          <span className="font-mono-tabular text-amber-300">{m.role}</span>
                        ) : (
                          <select
                            value={m.role}
                            onChange={(e) => handleChangeMemberRole(m, e.target.value)}
                            className="px-2 py-1 bg-[#0B0D12] border border-white/15 rounded text-white"
                          >
                            <option value="MEMBER">MEMBER</option>
                            <option value="DEPT_HEAD">DEPT_HEAD</option>
                            {isDirector && <option value="ADMIN">ADMIN</option>}
                            <option value="GUEST">GUEST</option>
                          </select>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-300">
                        {m.departments.length > 0
                          ? m.departments.map((d) => d.departmentId).join(', ')
                          : 'None'}
                      </td>
                      <td className="px-4 py-3 font-mono-tabular">
                        <span
                          className={
                            m.status === 'ACTIVE'
                              ? 'text-emerald-400'
                              : m.status === 'DISABLED'
                                ? 'text-red-400'
                                : 'text-amber-300'
                          }
                        >
                          {m.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right space-x-2 whitespace-nowrap">
                        {!lockedForAdmin && m.role !== 'DIRECTOR' && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleToggleMemberStatus(m)}
                              className="px-2.5 py-1 border border-white/15 rounded hover:bg-white/5 text-gray-200 cursor-pointer"
                            >
                              {m.status === 'DISABLED' ? 'Enable' : 'Disable'}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleResetPassword(m)}
                              className="px-2.5 py-1 border border-white/15 rounded hover:bg-white/5 text-gray-200 cursor-pointer"
                            >
                              Reset Cred
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRevokeSessions(m)}
                              className="px-2.5 py-1 border border-white/15 rounded hover:bg-white/5 text-gray-200 cursor-pointer"
                            >
                              Revoke
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Department Governance */}
      {tab === 'departments' && (
        <div className="space-y-6">
          <form
            onSubmit={handleAssignHead}
            className="p-5 rounded-xl border border-white/10 bg-[#121620] flex flex-wrap items-end gap-3 text-xs"
          >
            <div>
              <label className="block text-gray-400 mb-1">Department</label>
              <select
                value={assignDeptId}
                onChange={(e) => setAssignDeptId(e.target.value)}
                className="px-3 py-2 bg-[#0B0D12] border border-white/15 rounded-lg text-white"
              >
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.prefix})
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="block text-gray-400 mb-1">Assign Department Head</label>
              <select
                required
                value={assignUserId}
                onChange={(e) => setAssignUserId(e.target.value)}
                className="w-full px-3 py-2 bg-[#0B0D12] border border-white/15 rounded-lg text-white"
              >
                <option value="">Select Member...</option>
                {members
                  .filter((m) => m.role !== 'GUEST')
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.fullName} ({m.memberId || m.email})
                    </option>
                  ))}
              </select>
            </div>
            <button
              type="submit"
              className="px-4 py-2 bg-amber-500 text-[#0B0D12] font-semibold rounded-lg hover:bg-amber-400 cursor-pointer"
            >
              Assign Head
            </button>
          </form>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {departments.map((d) => (
              <div key={d.id} className="p-5 rounded-xl border border-white/10 bg-[#121620] space-y-2">
                <div className="flex items-center justify-between text-xs text-gray-400">
                  <span className="font-mono-tabular text-amber-400">
                    {d.prefix} · ID: {d.id}
                  </span>
                  <span className="font-mono-tabular">{d.members.length} Members</span>
                </div>
                <h3 className="text-base font-bold text-white">{d.name}</h3>
                <p className="text-xs text-gray-400">
                  Head: <span className="text-gray-200">{d.headUser?.fullName || 'Director Oversight'}</span>
                </p>
              </div>
            ))}
          </div>

          {isDirector && (
            <form
              onSubmit={handleCreateFutureDept}
              className="p-5 rounded-xl border border-white/10 bg-[#121620] space-y-3 text-xs"
            >
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Building2 className="w-4 h-4 text-amber-400" />
                Director-Only: Add Future Studio Department
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <input
                  required
                  value={newDept.id}
                  onChange={(e) => setNewDept({ ...newDept, id: e.target.value })}
                  placeholder="slug-id (e.g. merch)"
                  className="px-3 py-2 bg-[#0B0D12] border border-white/15 rounded-lg text-white"
                />
                <input
                  required
                  value={newDept.prefix}
                  onChange={(e) => setNewDept({ ...newDept, prefix: e.target.value.toUpperCase() })}
                  placeholder="Prefix (e.g. MER)"
                  className="px-3 py-2 bg-[#0B0D12] border border-white/15 rounded-lg text-white"
                />
                <input
                  required
                  value={newDept.name}
                  onChange={(e) => setNewDept({ ...newDept, name: e.target.value })}
                  placeholder="Department Name"
                  className="px-3 py-2 bg-[#0B0D12] border border-white/15 rounded-lg text-white"
                />
                <input
                  required
                  value={newDept.tagline}
                  onChange={(e) => setNewDept({ ...newDept, tagline: e.target.value })}
                  placeholder="Tagline"
                  className="px-3 py-2 bg-[#0B0D12] border border-white/15 rounded-lg text-white"
                />
              </div>
              <input
                required
                value={newDept.description}
                onChange={(e) => setNewDept({ ...newDept, description: e.target.value })}
                placeholder="Department mandate and responsibilities..."
                className="w-full px-3 py-2 bg-[#0B0D12] border border-white/15 rounded-lg text-white"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-white/10 hover:bg-white/15 text-white rounded-lg cursor-pointer"
              >
                Create Additional Department
              </button>
            </form>
          )}
        </div>
      )}

      {/* Immutable Audit Ledger */}
      {tab === 'audit' && (
        <div className="rounded-xl border border-white/10 bg-[#121620] overflow-x-auto">
          <div className="p-4 border-b border-white/10 flex items-center gap-2 text-xs text-gray-300">
            <ShieldAlert className="w-4 h-4 text-amber-400" />
            <span>Append-Only Security &amp; Operations Audit Ledger (Non-Editable)</span>
          </div>
          <table className="w-full text-xs">
            <thead className="bg-[#0B0D12] text-gray-400">
              <tr>
                <th className="text-left px-4 py-2.5">Timestamp</th>
                <th className="text-left px-4 py-2.5">Actor</th>
                <th className="text-left px-4 py-2.5">Action</th>
                <th className="text-left px-4 py-2.5">Target</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {auditLogs.map((l) => (
                <tr key={l.id}>
                  <td className="px-4 py-2.5 font-mono-tabular text-gray-400">
                    {new Date(l.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 text-gray-200">{l.actorEmail || 'System'}</td>
                  <td className="px-4 py-2.5 font-mono-tabular text-amber-300">{l.action}</td>
                  <td className="px-4 py-2.5 text-gray-300">
                    {l.entityType} {l.entityId || ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Integrations, Notifications & Backup (Director-Only) */}
      {tab === 'integrations' && isDirector && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Email Config & Test */}
            <div className="p-5 rounded-xl border border-white/10 bg-[#121620] space-y-3 text-xs">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Mail className="w-4 h-4 text-amber-400" />
                Gmail / SMTP Notification Service
              </h3>
              <p className="text-gray-400">
                Server SMTP Status:{' '}
                <span className={envStatus?.smtpConfigured ? 'text-emerald-400' : 'text-amber-300'}>
                  {envStatus?.smtpConfigured ? 'Configured & Ready' : 'Awaiting SMTP_HOST/USER/PASS env secrets'}
                </span>
              </p>
              <p className="text-gray-400">
                Official Director Email: <span className="text-white">black0warrior0143@gmail.com</span>
              </p>
              <div className="flex gap-2 pt-2">
                <input
                  value={testEmailTo}
                  onChange={(e) => setTestEmailTo(e.target.value)}
                  className="flex-1 px-3 py-2 bg-[#0B0D12] border border-white/15 rounded-lg text-white"
                />
                <button
                  type="button"
                  onClick={handleTestEmail}
                  className="px-4 py-2 bg-amber-500 text-[#0B0D12] font-semibold rounded-lg hover:bg-amber-400 cursor-pointer"
                >
                  Send Test Email
                </button>
              </div>
            </div>

            {/* SMS Config & Test */}
            <div className="p-5 rounded-xl border border-white/10 bg-[#121620] space-y-3 text-xs">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <MessageSquareText className="w-4 h-4 text-amber-400" />
                Mobile SMS Gateway (Twilio / MSG91)
              </h3>
              <p className="text-gray-400">
                SMS Gateway Status:{' '}
                <span
                  className={
                    envStatus?.twilioConfigured || envStatus?.msg91Configured
                      ? 'text-emerald-400'
                      : 'text-amber-300'
                  }
                >
                  {envStatus?.twilioConfigured || envStatus?.msg91Configured
                    ? 'Configured & Ready'
                    : 'Awaiting TWILIO_* or MSG91_* server secrets'}
                </span>
              </p>
              <p className="text-gray-400">
                Official Director Mobile: <span className="text-white font-mono-tabular">+91 9443498638</span>
              </p>
              <div className="flex gap-2 pt-2">
                <input
                  value={testSmsTo}
                  onChange={(e) => setTestSmsTo(e.target.value)}
                  className="flex-1 px-3 py-2 bg-[#0B0D12] border border-white/15 rounded-lg text-white font-mono-tabular"
                />
                <button
                  type="button"
                  onClick={handleTestSms}
                  className="px-4 py-2 bg-amber-500 text-[#0B0D12] font-semibold rounded-lg hover:bg-amber-400 cursor-pointer"
                >
                  Send Test SMS
                </button>
              </div>
            </div>
          </div>

          {/* PostgreSQL Backup Export */}
          <div className="p-5 rounded-xl border border-white/10 bg-[#121620] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <DatabaseBackup className="w-4 h-4 text-amber-400" />
                Database Backup Snapshot Export
              </h3>
              <p className="text-xs text-gray-400 mt-1">
                Download a complete JSON snapshot of all PostgreSQL studio tables (departments, members, projects, tasks, stories, records, applications, and audit logs).
              </p>
            </div>
            <button
              type="button"
              onClick={() => apiDownload('/api/admin/backup-export', 'eldersveil_backup.json')}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold bg-white/10 hover:bg-white/15 text-white rounded-lg shrink-0 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              Export Backup Snapshot
            </button>
          </div>

          {/* Delivery Logs */}
          <div className="rounded-xl border border-white/10 bg-[#121620] overflow-x-auto">
            <div className="p-4 border-b border-white/10 text-sm font-semibold text-white">
              Notification Delivery Ledger (Honest Provider Status)
            </div>
            <table className="w-full text-xs">
              <thead className="bg-[#0B0D12] text-gray-400">
                <tr>
                  <th className="text-left px-4 py-2.5">Channel</th>
                  <th className="text-left px-4 py-2.5">Recipient</th>
                  <th className="text-left px-4 py-2.5">Provider</th>
                  <th className="text-left px-4 py-2.5">Status</th>
                  <th className="text-left px-4 py-2.5">Details</th>
                  <th className="text-right px-4 py-2.5">Retry</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {deliveries.map((del) => (
                  <tr key={del.id}>
                    <td className="px-4 py-2.5 font-mono-tabular text-white">{del.channel}</td>
                    <td className="px-4 py-2.5 text-gray-300">{del.recipient}</td>
                    <td className="px-4 py-2.5 font-mono-tabular text-gray-400">{del.provider}</td>
                    <td className="px-4 py-2.5 font-mono-tabular">
                      <span
                        className={
                          del.status === 'SENT'
                            ? 'text-emerald-400'
                            : del.status === 'AWAITING_CONFIG'
                              ? 'text-amber-300'
                              : 'text-red-400'
                        }
                      >
                        {del.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-gray-400 max-w-xs truncate">
                      {del.errorMessage || del.subject || 'Delivered'}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {del.status !== 'SENT' && (
                        <button
                          type="button"
                          onClick={async () => {
                            await apiFetch(`/api/admin/deliveries/${del.id}/retry`, { method: 'POST' });
                            await loadAll();
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 border border-white/15 rounded hover:bg-white/5 text-gray-200 cursor-pointer"
                        >
                          <RefreshCw className="w-3 h-3" />
                          Retry
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
