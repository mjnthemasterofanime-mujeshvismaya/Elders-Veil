import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  FileUp,
  KeyRound,
  Search,
  ShieldCheck,
  UserPlus,
} from 'lucide-react';
import { StudioArchitecturalCanvas, StudioCrest } from './StudioLogo.tsx';
import { useStudioAuth } from '../contexts/StudioAuthContext.tsx';
import { apiFetch } from '../lib/api.ts';

interface PublicDept {
  id: string;
  prefix: string;
  name: string;
  tagline: string;
  description: string;
  suggestedTools: string[];
  moduleCount: number;
}

interface StudioOverview {
  studio: {
    name: string;
    founderDirector: string;
    tagline: string;
    departmentCount: number;
    memberCount: number;
    projectCount: number;
  };
  departments: PublicDept[];
  pipelineStages: Array<{
    key: string;
    step: number;
    title: string;
    departments: string[];
    description: string;
  }>;
  featuredToolsCount: number;
}

type PublicTab = 'overview' | 'departments' | 'apply' | 'track';

export function PublicPortal({ onEnterStudio }: { onEnterStudio: () => void }) {
  const { studioUser, loginWithGoogle, logout, authError, refreshProfile } = useStudioAuth();
  const [tab, setTab] = useState<PublicTab>('overview');
  const [overview, setOverview] = useState<StudioOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Recruitment Form State
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [introduction, setIntroduction] = useState('');
  const [departmentId, setDepartmentId] = useState('samurai');
  const [skills, setSkills] = useState('');
  const [experience, setExperience] = useState('');
  const [portfolioUrl, setPortfolioUrl] = useState('');
  const [availability, setAvailability] = useState('Part-time (15-20 hrs/week)');
  const [reasonForJoining, setReasonForJoining] = useState('');
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [sampleFile, setSampleFile] = useState<File | null>(null);
  const [submittingApp, setSubmittingApp] = useState(false);
  const [appSubmitError, setAppSubmitError] = useState<string | null>(null);
  const [submittedReceipt, setSubmittedReceipt] = useState<{
    application: { trackingCode: string; status: string; departmentName: string };
    notifications: {
      internalCreated: boolean;
      emailStatus: string;
      emailNote: string | null;
      smsStatus: string;
      smsNote: string | null;
    };
  } | null>(null);

  // Tracking Form State
  const [trackCode, setTrackCode] = useState('');
  const [trackEmail, setTrackEmail] = useState('');
  const [trackLoading, setTrackLoading] = useState(false);
  const [trackError, setTrackError] = useState<string | null>(null);
  const [trackResult, setTrackResult] = useState<{
    trackingCode: string;
    status: string;
    departmentName: string;
    interviewScheduledAt: string | null;
    assessmentPrompt: string | null;
    approvedMemberId: string | null;
    submittedAt: string;
    updatedAt: string;
  } | null>(null);

  // Guest Invite Redemption
  const [inviteCode, setInviteCode] = useState('');
  const [inviteMsg, setInviteMsg] = useState<string | null>(null);
  const [inviteErr, setInviteErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await apiFetch<StudioOverview>('/api/public/studio-overview');
        setOverview(data);
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : 'Unable to load studio overview.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleApplicationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAppSubmitError(null);
    if (!consentAccepted) {
      setAppSubmitError('You must confirm consent to process your studio application.');
      return;
    }

    setSubmittingApp(true);
    try {
      const fd = new FormData();
      fd.append('fullName', fullName);
      fd.append('email', email);
      fd.append('phone', phone);
      fd.append('introduction', introduction);
      fd.append('departmentId', departmentId);
      fd.append('skills', skills);
      fd.append('experience', experience);
      fd.append('portfolioUrl', portfolioUrl);
      fd.append('availability', availability);
      fd.append('reasonForJoining', reasonForJoining);
      fd.append('consentAccepted', 'true');
      if (resumeFile) fd.append('resume', resumeFile);
      if (sampleFile) fd.append('workSample', sampleFile);

      const resp = await apiFetch<NonNullable<typeof submittedReceipt>>('/api/public/applications', {
        method: 'POST',
        body: fd,
      });

      setSubmittedReceipt(resp);
      setTrackCode(resp.application.trackingCode);
      setTrackEmail(email);
    } catch (err) {
      setAppSubmitError(err instanceof Error ? err.message : 'Failed to submit application.');
    } finally {
      setSubmittingApp(false);
    }
  };

  const handleTrackLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    setTrackError(null);
    setTrackResult(null);
    setTrackLoading(true);
    try {
      const data = await apiFetch<{ tracking: NonNullable<typeof trackResult> }>(
        '/api/public/applications/track',
        {
          method: 'POST',
          body: JSON.stringify({ trackingCode: trackCode, email: trackEmail }),
        }
      );
      setTrackResult(data.tracking);
    } catch (err) {
      setTrackError(err instanceof Error ? err.message : 'Unable to verify tracking code.');
    } finally {
      setTrackLoading(false);
    }
  };

  const handleRedeemInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteErr(null);
    setInviteMsg(null);
    try {
      const res = await apiFetch<{ memberId: string; departmentId: string }>('/api/auth/redeem-invite', {
        method: 'POST',
        body: JSON.stringify({ inviteCode }),
      });
      setInviteMsg(`Onboarding completed (${res.memberId}). Opening studio workplace...`);
      await refreshProfile();
      onEnterStudio();
    } catch (err) {
      setInviteErr(err instanceof Error ? err.message : 'Invalid invitation code.');
    }
  };

  const isStudioMember = studioUser && studioUser.role !== 'GUEST';

  return (
    <div className="min-h-screen bg-[#0B0D12] text-[#F1F3F7] flex flex-col">
      {/* Strict 3-Zone Top Bar */}
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#0B0D12]/90 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-8">
          <button
            type="button"
            onClick={() => setTab('overview')}
            className="flex items-center gap-3 text-left whitespace-nowrap shrink-0 cursor-pointer"
          >
            <StudioCrest className="w-8 h-8" />
            <span className="font-display text-xl font-bold tracking-tight text-white">
              Elder&apos;sVeil
            </span>
          </button>

          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-gray-300">
            <button
              type="button"
              onClick={() => setTab('overview')}
              className={`whitespace-nowrap shrink-0 pb-0.5 transition-colors cursor-pointer ${
                tab === 'overview' ? 'text-amber-400 border-b border-amber-400' : 'hover:text-white'
              }`}
            >
              Overview
            </button>
            <button
              type="button"
              onClick={() => setTab('departments')}
              className={`whitespace-nowrap shrink-0 pb-0.5 transition-colors cursor-pointer ${
                tab === 'departments' ? 'text-amber-400 border-b border-amber-400' : 'hover:text-white'
              }`}
            >
              Departments
            </button>
            <button
              type="button"
              onClick={() => setTab('apply')}
              className={`whitespace-nowrap shrink-0 pb-0.5 transition-colors cursor-pointer ${
                tab === 'apply' ? 'text-amber-400 border-b border-amber-400' : 'hover:text-white'
              }`}
            >
              Apply to Join
            </button>
            <button
              type="button"
              onClick={() => setTab('track')}
              className={`whitespace-nowrap shrink-0 pb-0.5 transition-colors cursor-pointer ${
                tab === 'track' ? 'text-amber-400 border-b border-amber-400' : 'hover:text-white'
              }`}
            >
              Track Status
            </button>
          </nav>

          <div className="flex items-center gap-3 shrink-0">
            {isStudioMember ? (
              <button
                type="button"
                onClick={onEnterStudio}
                className="px-4 py-2 text-xs font-semibold bg-amber-500 text-[#0B0D12] rounded-lg hover:bg-amber-400 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Open Workplace
              </button>
            ) : studioUser ? (
              <button
                type="button"
                onClick={logout}
                className="px-4 py-2 text-xs font-semibold border border-white/15 text-gray-200 rounded-lg hover:bg-white/5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Sign Out ({studioUser.email.split('@')[0]})
              </button>
            ) : (
              <button
                type="button"
                onClick={loginWithGoogle}
                className="px-4 py-2 text-xs font-semibold bg-amber-500 text-[#0B0D12] rounded-lg hover:bg-amber-400 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Studio Sign In
              </button>
            )}
          </div>
        </div>

        {/* Mobile sub-nav */}
        <div className="md:hidden border-t border-white/5 px-4 py-2 flex items-center justify-between gap-2 overflow-x-auto text-xs">
          {(['overview', 'departments', 'apply', 'track'] as PublicTab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 rounded-md whitespace-nowrap shrink-0 ${
                tab === t ? 'bg-amber-500/20 text-amber-300 font-semibold' : 'text-gray-400'
              }`}
            >
              {t === 'overview'
                ? 'Overview'
                : t === 'departments'
                  ? '10 Departments'
                  : t === 'apply'
                    ? 'Apply'
                    : 'Track Status'}
            </button>
          ))}
        </div>
      </header>

      {/* Guest / Pending Onboarding Notice */}
      {studioUser && studioUser.role === 'GUEST' && (
        <div className="bg-[#141925] border-b border-amber-500/30">
          <div className="max-w-7xl mx-auto px-6 py-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="text-sm">
              <p className="font-semibold text-amber-300">
                Signed in as {studioUser.email} (Applicant / Guest Access)
              </p>
              <p className="text-gray-400 mt-0.5">
                Studio workplaces are restricted to approved members. If your application was approved, enter your invitation code below or submit a new application.
              </p>
            </div>
            <form onSubmit={handleRedeemInvite} className="flex items-center gap-2 shrink-0">
              <input
                type="text"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                placeholder="Invite Code (e.g. INV-...)"
                className="px-3 py-2 text-xs bg-[#0B0D12] border border-white/15 rounded-lg text-white focus:outline-none focus:border-amber-400"
              />
              <button
                type="submit"
                className="px-3.5 py-2 text-xs font-semibold bg-amber-500 text-[#0B0D12] rounded-lg hover:bg-amber-400 whitespace-nowrap shrink-0 cursor-pointer"
              >
                Activate Membership
              </button>
            </form>
          </div>
          {(inviteErr || inviteMsg) && (
            <div className="max-w-7xl mx-auto px-6 pb-3 text-xs">
              {inviteErr && <p className="text-red-400">{inviteErr}</p>}
              {inviteMsg && <p className="text-emerald-400">{inviteMsg}</p>}
            </div>
          )}
        </div>
      )}

      {authError && (
        <div className="max-w-7xl mx-auto w-full px-6 pt-4">
          <div className="p-3 rounded-lg border border-red-500/30 bg-red-500/10 text-xs text-red-300">
            {authError}
          </div>
        </div>
      )}

      <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-10">
        {loadError && (
          <div className="p-4 rounded-xl border border-red-500/30 bg-red-500/10 text-sm text-red-300 mb-6">
            {loadError}
          </div>
        )}

        {tab === 'overview' && (
          <div className="space-y-12">
            {/* Hero 2-Column Split */}
            <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
              <div className="lg:col-span-7 flex flex-col justify-between p-8 rounded-xl border border-white/10 bg-[#121620]">
                <div>
                  <p className="text-xs font-mono-tabular tracking-wider text-amber-400">
                    ELDER&apos;SVEIL ANIME STUDIO · FOUNDER &amp; DIRECTOR M.J. MUJESH DHARSHAN
                  </p>
                  <h1 className="font-display text-4xl sm:text-5xl font-bold text-white mt-3 leading-tight">
                    Stories Beyond Imagination
                  </h1>
                  <p className="text-gray-300 text-base leading-relaxed mt-4 max-w-2xl">
                    A unified digital production ecosystem connecting ten specialized creative departments—from Samurai clan lore, Shinobi espionage, and Arcane worldbuilding to Story scripting, 2D/3D Animation, Audio mastering, and Final Video release.
                  </p>
                </div>

                <div className="mt-8 flex flex-wrap items-center gap-3">
                  {isStudioMember ? (
                    <button
                      type="button"
                      onClick={onEnterStudio}
                      className="inline-flex items-center gap-2 px-5 py-3 text-sm font-semibold bg-amber-500 text-[#0B0D12] rounded-lg hover:bg-amber-400 transition-colors cursor-pointer"
                    >
                      Enter Studio Workplace
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={loginWithGoogle}
                      className="inline-flex items-center gap-2 px-5 py-3 text-sm font-semibold bg-amber-500 text-[#0B0D12] rounded-lg hover:bg-amber-400 transition-colors cursor-pointer"
                    >
                      Member &amp; Director Sign In
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setTab('apply')}
                    className="inline-flex items-center gap-2 px-5 py-3 text-sm font-medium border border-white/15 text-gray-200 rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
                  >
                    <UserPlus className="w-4 h-4" />
                    Apply to Join Studio
                  </button>
                  <button
                    type="button"
                    onClick={() => setTab('track')}
                    className="inline-flex items-center gap-2 px-4 py-3 text-sm font-medium text-gray-300 hover:text-white transition-colors cursor-pointer"
                  >
                    <Search className="w-4 h-4" />
                    Track Application
                  </button>
                </div>
              </div>

              <div className="lg:col-span-5">
                <StudioArchitecturalCanvas />
              </div>
            </section>

            {/* Full-Width 4-Column Studio Metric Strip */}
            <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-5 rounded-xl border border-white/10 bg-[#121620]">
                <p className="text-xs text-gray-400">Official Departments</p>
                <p className="text-2xl font-bold font-mono-tabular text-white mt-1">
                  {overview?.studio.departmentCount ?? 10}
                </p>
                <p className="text-xs text-gray-400 mt-1">Samurai / Ronin to Video</p>
              </div>
              <div className="p-5 rounded-xl border border-white/10 bg-[#121620]">
                <p className="text-xs text-gray-400">Production Pipeline</p>
                <p className="text-2xl font-bold font-mono-tabular text-white mt-1">
                  {overview?.pipelineStages.length ?? 9} Stages
                </p>
                <p className="text-xs text-gray-400 mt-1">Research through Release</p>
              </div>
              <div className="p-5 rounded-xl border border-white/10 bg-[#121620]">
                <p className="text-xs text-gray-400">Active Productions</p>
                <p className="text-2xl font-bold font-mono-tabular text-white mt-1">
                  {overview?.studio.projectCount ?? 1}
                </p>
                <p className="text-xs text-gray-400 mt-1">Cross-department linked</p>
              </div>
              <div className="p-5 rounded-xl border border-white/10 bg-[#121620]">
                <p className="text-xs text-gray-400">Verified Creative Tools</p>
                <p className="text-2xl font-bold font-mono-tabular text-white mt-1">
                  {overview?.featuredToolsCount ?? 18}
                </p>
                <p className="text-xs text-gray-400 mt-1">Open-source &amp; free tier</p>
              </div>
            </section>

            {/* 9-Stage Production Pipeline */}
            <section className="space-y-4">
              <div className="flex items-baseline justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-bold text-white">Unified Anime Production Pipeline</h2>
                  <p className="text-sm text-gray-400 mt-1">
                    Every story chapter links directly to worldbuilding lore, character sheets, animation cuts, audio mixes, and final video masters.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setTab('departments')}
                  className="text-xs font-medium text-amber-400 hover:text-amber-300 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Explore All 10 Departments →
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {(overview?.pipelineStages || []).map((stage) => (
                  <div key={stage.key} className="p-5 rounded-xl border border-white/10 bg-[#121620]">
                    <p className="text-xs font-mono-tabular text-amber-400">
                      STAGE {String(stage.step).padStart(2, '0')}
                    </p>
                    <h3 className="text-base font-semibold text-white mt-1">{stage.title}</h3>
                    <p className="text-xs text-gray-400 mt-2 leading-relaxed">{stage.description}</p>
                    <p className="text-xs text-gray-500 mt-3">
                      Departments: {stage.departments.join(' · ')}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {tab === 'departments' && (
          <div className="space-y-6">
            <div>
              <h1 className="font-display text-3xl font-bold text-white">
                Official Ten-Department Structure
              </h1>
              <p className="text-sm text-gray-400 mt-1">
                Each department operates an independent workplace with specialized tools and collaborates on shared anime productions.
              </p>
            </div>

            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[1, 2, 3, 4].map((n) => (
                  <div key={n} className="h-40 rounded-xl border border-white/10 bg-[#121620] opacity-60" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {(overview?.departments || []).map((dept, index) => (
                  <div
                    key={dept.id}
                    className="p-6 rounded-xl border border-white/10 bg-[#121620] flex flex-col justify-between gap-4"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-3 text-xs text-gray-400">
                        <span className="font-mono-tabular text-amber-400">
                          {String(index + 1).padStart(2, '0')} · {dept.prefix} · ID: {dept.id}
                        </span>
                        <span className="font-mono-tabular">{dept.moduleCount} Modules</span>
                      </div>
                      <h2 className="text-xl font-bold text-white mt-2">{dept.name}</h2>
                      <p className="text-xs text-amber-300/90 mt-0.5">{dept.tagline}</p>
                      <p className="text-sm text-gray-300 mt-3 leading-relaxed">{dept.description}</p>
                    </div>
                    <div className="pt-3 border-t border-white/10 flex items-center justify-between gap-4 text-xs">
                      <span className="text-gray-400">
                        Tools: {dept.suggestedTools.join(' · ')}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setDepartmentId(dept.id);
                          setTab('apply');
                        }}
                        className="text-amber-400 hover:text-amber-300 font-medium whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        Apply for {dept.prefix} →
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'apply' && (
          <div className="max-w-3xl mx-auto space-y-6">
            <div>
              <h1 className="font-display text-3xl font-bold text-white">
                Studio Recruitment Application
              </h1>
              <p className="text-sm text-gray-400 mt-1">
                Submit your portfolio and department preference. All applications are reviewed by the Founder &amp; Director before studio credentials are issued.
              </p>
            </div>

            {submittedReceipt ? (
              <div className="p-8 rounded-xl border border-emerald-500/30 bg-[#121620] space-y-5">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <h2 className="text-xl font-bold text-white">Application Received</h2>
                    <p className="text-sm text-gray-300 mt-1">
                      Your application for <strong>{submittedReceipt.application.departmentName}</strong> has been saved securely in the studio database.
                    </p>
                  </div>
                </div>

                <div className="p-4 rounded-lg bg-[#0B0D12] border border-white/10">
                  <p className="text-xs text-gray-400">Your Private Tracking Code (save this code)</p>
                  <p className="text-2xl font-bold font-mono-tabular text-amber-400 mt-1">
                    {submittedReceipt.application.trackingCode}
                  </p>
                </div>

                <div className="space-y-2 text-xs text-gray-300 border-t border-white/10 pt-4">
                  <p className="font-semibold text-white">Director Notification Delivery Log:</p>
                  <p>
                    Internal Studio Notification:{' '}
                    <span className="text-emerald-400">
                      {submittedReceipt.notifications.internalCreated ? 'Delivered' : 'Failed'}
                    </span>
                  </p>
                  <p>
                    Director Email:{' '}
                    <span className="font-mono-tabular text-amber-300">
                      {submittedReceipt.notifications.emailStatus}
                    </span>
                    {submittedReceipt.notifications.emailNote
                      ? ` — ${submittedReceipt.notifications.emailNote}`
                      : ''}
                  </p>
                  <p>
                    Director SMS:{' '}
                    <span className="font-mono-tabular text-amber-300">
                      {submittedReceipt.notifications.smsStatus}
                    </span>
                    {submittedReceipt.notifications.smsNote
                      ? ` — ${submittedReceipt.notifications.smsNote}`
                      : ''}
                  </p>
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setTab('track')}
                    className="px-4 py-2 text-xs font-semibold bg-amber-500 text-[#0B0D12] rounded-lg hover:bg-amber-400 cursor-pointer"
                  >
                    Track Application Status
                  </button>
                  <button
                    type="button"
                    onClick={() => setSubmittedReceipt(null)}
                    className="px-4 py-2 text-xs font-medium border border-white/15 rounded-lg text-gray-300 hover:text-white cursor-pointer"
                  >
                    Submit Another Application
                  </button>
                </div>
              </div>
            ) : (
              <form
                onSubmit={handleApplicationSubmit}
                className="p-6 sm:p-8 rounded-xl border border-white/10 bg-[#121620] space-y-5"
              >
                {appSubmitError && (
                  <div className="p-3 rounded-lg border border-red-500/30 bg-red-500/10 text-xs text-red-300">
                    {appSubmitError}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-300 mb-1.5">Full Name *</label>
                    <input
                      required
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="e.g. Akira Takahashi"
                      className="w-full px-3.5 py-2.5 text-sm bg-[#0B0D12] border border-white/15 rounded-lg text-white focus:outline-none focus:border-amber-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-300 mb-1.5">Email Address *</label>
                    <input
                      required
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full px-3.5 py-2.5 text-sm bg-[#0B0D12] border border-white/15 rounded-lg text-white focus:outline-none focus:border-amber-400"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-300 mb-1.5">Phone Number *</label>
                    <input
                      required
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+91 9876543210"
                      className="w-full px-3.5 py-2.5 text-sm bg-[#0B0D12] border border-white/15 rounded-lg text-white focus:outline-none focus:border-amber-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-300 mb-1.5">
                      Official Department (10 Departments) *
                    </label>
                    <select
                      value={departmentId}
                      onChange={(e) => setDepartmentId(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-sm bg-[#0B0D12] border border-white/15 rounded-lg text-white focus:outline-none focus:border-amber-400"
                    >
                      {(overview?.departments || []).map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name} ({d.prefix})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-300 mb-1.5">
                    Applicant Introduction *
                  </label>
                  <textarea
                    required
                    rows={3}
                    value={introduction}
                    onChange={(e) => setIntroduction(e.target.value)}
                    placeholder="Introduce your creative background, artistic influences, and discipline..."
                    className="w-full px-3.5 py-2.5 text-sm bg-[#0B0D12] border border-white/15 rounded-lg text-white focus:outline-none focus:border-amber-400"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-300 mb-1.5">
                      Core Skills (comma-separated) *
                    </label>
                    <input
                      required
                      type="text"
                      value={skills}
                      onChange={(e) => setSkills(e.target.value)}
                      placeholder="Krita, Storyboarding, Feudal Lore, Blender"
                      className="w-full px-3.5 py-2.5 text-sm bg-[#0B0D12] border border-white/15 rounded-lg text-white focus:outline-none focus:border-amber-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-300 mb-1.5">Availability *</label>
                    <select
                      value={availability}
                      onChange={(e) => setAvailability(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-sm bg-[#0B0D12] border border-white/15 rounded-lg text-white focus:outline-none focus:border-amber-400"
                    >
                      <option value="Full-time (35-40 hrs/week)">Full-time (35-40 hrs/week)</option>
                      <option value="Part-time (15-20 hrs/week)">Part-time (15-20 hrs/week)</option>
                      <option value="Project-based / Freelance">Project-based / Freelance</option>
                      <option value="Weekend Contributor">Weekend Contributor</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-300 mb-1.5">
                      Experience Summary *
                    </label>
                    <input
                      required
                      type="text"
                      value={experience}
                      onChange={(e) => setExperience(e.target.value)}
                      placeholder="e.g. 2 years indie manga & character design"
                      className="w-full px-3.5 py-2.5 text-sm bg-[#0B0D12] border border-white/15 rounded-lg text-white focus:outline-none focus:border-amber-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-300 mb-1.5">Portfolio URL</label>
                    <input
                      type="url"
                      value={portfolioUrl}
                      onChange={(e) => setPortfolioUrl(e.target.value)}
                      placeholder="https://artstation.com/..."
                      className="w-full px-3.5 py-2.5 text-sm bg-[#0B0D12] border border-white/15 rounded-lg text-white focus:outline-none focus:border-amber-400"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-300 mb-1.5">
                    Reason for Joining Elder&apos;sVeil Anime Studio *
                  </label>
                  <textarea
                    required
                    rows={3}
                    value={reasonForJoining}
                    onChange={(e) => setReasonForJoining(e.target.value)}
                    placeholder="Why do you want to collaborate with our studio?"
                    className="w-full px-3.5 py-2.5 text-sm bg-[#0B0D12] border border-white/15 rounded-lg text-white focus:outline-none focus:border-amber-400"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-white/10">
                  <div>
                    <label className="flex items-center gap-2 text-xs font-medium text-gray-300 mb-1.5">
                      <FileUp className="w-3.5 h-3.5 text-amber-400" />
                      Resume (PDF, TXT, MD, PNG/JPG — max 10MB)
                    </label>
                    <input
                      type="file"
                      accept=".pdf,.txt,.md,.png,.jpg,.jpeg,.webp"
                      onChange={(e) => setResumeFile(e.target.files?.[0] || null)}
                      className="w-full text-xs text-gray-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-white/10 file:text-gray-200 hover:file:bg-white/15"
                    />
                  </div>
                  <div>
                    <label className="flex items-center gap-2 text-xs font-medium text-gray-300 mb-1.5">
                      <FileUp className="w-3.5 h-3.5 text-amber-400" />
                      Work Sample (PDF, PNG, JPG, ZIP — max 10MB)
                    </label>
                    <input
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg,.webp,.zip,.txt,.md"
                      onChange={(e) => setSampleFile(e.target.files?.[0] || null)}
                      className="w-full text-xs text-gray-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-white/10 file:text-gray-200 hover:file:bg-white/15"
                    />
                  </div>
                </div>

                <label className="flex items-start gap-2.5 text-xs text-gray-300 cursor-pointer pt-2">
                  <input
                    type="checkbox"
                    checked={consentAccepted}
                    onChange={(e) => setConsentAccepted(e.target.checked)}
                    className="mt-0.5 rounded border-white/20 bg-[#0B0D12]"
                  />
                  <span>
                    I consent to Elder&apos;sVeil Anime Studio reviewing my submitted materials for recruitment. I understand submitting an application does not automatically grant studio membership.
                  </span>
                </label>

                <button
                  type="submit"
                  disabled={submittingApp}
                  className="w-full py-3 text-sm font-semibold bg-amber-500 text-[#0B0D12] rounded-lg hover:bg-amber-400 disabled:opacity-50 transition-colors cursor-pointer"
                >
                  {submittingApp ? 'Submitting Application...' : 'Submit Official Studio Application'}
                </button>
              </form>
            )}
          </div>
        )}

        {tab === 'track' && (
          <div className="max-w-xl mx-auto space-y-6">
            <div>
              <h1 className="font-display text-3xl font-bold text-white">
                Track Application Status
              </h1>
              <p className="text-sm text-gray-400 mt-1">
                For applicant privacy, both your tracking code and application email address are required.
              </p>
            </div>

            <form
              onSubmit={handleTrackLookup}
              className="p-6 rounded-xl border border-white/10 bg-[#121620] space-y-4"
            >
              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1.5">Tracking Code</label>
                <input
                  required
                  type="text"
                  value={trackCode}
                  onChange={(e) => setTrackCode(e.target.value)}
                  placeholder="EV-SAM-XXXXXX"
                  className="w-full px-3.5 py-2.5 text-sm font-mono-tabular bg-[#0B0D12] border border-white/15 rounded-lg text-white focus:outline-none focus:border-amber-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1.5">Applicant Email</label>
                <input
                  required
                  type="email"
                  value={trackEmail}
                  onChange={(e) => setTrackEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full px-3.5 py-2.5 text-sm bg-[#0B0D12] border border-white/15 rounded-lg text-white focus:outline-none focus:border-amber-400"
                />
              </div>
              <button
                type="submit"
                disabled={trackLoading}
                className="w-full py-2.5 text-sm font-semibold bg-amber-500 text-[#0B0D12] rounded-lg hover:bg-amber-400 disabled:opacity-50 cursor-pointer"
              >
                {trackLoading ? 'Checking Status...' : 'Check Status'}
              </button>
            </form>

            {trackError && (
              <div className="p-4 rounded-xl border border-red-500/30 bg-red-500/10 text-xs text-red-300">
                {trackError}
              </div>
            )}

            {trackResult && (
              <div className="p-6 rounded-xl border border-white/10 bg-[#121620] space-y-4">
                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                  <div>
                    <p className="text-xs text-gray-400">Tracking Code</p>
                    <p className="text-base font-bold font-mono-tabular text-white">
                      {trackResult.trackingCode}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-400">Current Stage</p>
                    <p className="text-sm font-semibold text-amber-400">{trackResult.status}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <p className="text-gray-400">Department</p>
                    <p className="text-white mt-0.5">{trackResult.departmentName}</p>
                  </div>
                  <div>
                    <p className="text-gray-400">Submitted</p>
                    <p className="text-white font-mono-tabular mt-0.5">
                      {new Date(trackResult.submittedAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                {trackResult.interviewScheduledAt && (
                  <div className="p-3 rounded-lg bg-[#0B0D12] border border-white/10 text-xs">
                    <p className="text-amber-400 font-semibold flex items-center gap-1.5">
                      <ClipboardCheck className="w-4 h-4" />
                      Interview Scheduled
                    </p>
                    <p className="text-gray-300 mt-1 font-mono-tabular">
                      {new Date(trackResult.interviewScheduledAt).toLocaleString()}
                    </p>
                  </div>
                )}

                {trackResult.assessmentPrompt && (
                  <div className="p-3 rounded-lg bg-[#0B0D12] border border-white/10 text-xs">
                    <p className="text-amber-400 font-semibold">Assessment Requested</p>
                    <p className="text-gray-300 mt-1">{trackResult.assessmentPrompt}</p>
                  </div>
                )}

                {trackResult.approvedMemberId && (
                  <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-xs">
                    <p className="text-emerald-300 font-semibold flex items-center gap-1.5">
                      <KeyRound className="w-4 h-4" />
                      Approved — Member ID: {trackResult.approvedMemberId}
                    </p>
                    <p className="text-gray-300 mt-1">
                      Sign in with Google using your application email to access your studio workplace.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>

      <footer className="border-t border-white/10 py-6 px-6 text-xs text-gray-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-amber-500/80" />
            <span>
              Elder&apos;sVeil Anime Studio — Founder &amp; Director: M.J. Mujesh Dharshan
            </span>
          </p>
          <p>Stories Beyond Imagination · Official Ten-Department Studio Ecosystem</p>
        </div>
      </footer>
    </div>
  );
}
