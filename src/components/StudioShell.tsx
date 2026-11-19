import React, { useEffect, useState } from 'react';
import {
  Bell,
  Calendar,
  CheckSquare,
  Crown,
  FileCheck2,
  FolderOpen,
  Globe,
  Home,
  Layers,
  LogOut,
  Megaphone,
  Menu,
  UserCog,
  Wrench,
  X,
} from 'lucide-react';
import { StudioCrest } from './StudioLogo.tsx';
import { useStudioAuth } from '../contexts/StudioAuthContext.tsx';
import { apiFetch } from '../lib/api.ts';
import { DirectorOffice } from './DirectorOffice.tsx';
import { DepartmentWorkplace } from './DepartmentWorkplace.tsx';
import { StudioSharedWorkspace, type SharedSection } from './StudioSharedWorkspace.tsx';

type ActiveRoute =
  | { kind: 'shared'; section: SharedSection }
  | { kind: 'director' }
  | { kind: 'department'; deptId: string };

export function StudioShell({ onExitToPublic }: { onExitToPublic: () => void }) {
  const { studioUser, unreadNotifications, logout } = useStudioAuth();
  const [route, setRoute] = useState<ActiveRoute>(
    studioUser?.role === 'DIRECTOR' || studioUser?.role === 'ADMIN'
      ? { kind: 'director' }
      : { kind: 'shared', section: 'dashboard' }
  );
  const [departments, setDepartments] = useState<Array<{ id: string; prefix: string; name: string }>>([]);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch<{ departments: Array<{ id: string; prefix: string; name: string }> }>(
          '/api/studio/directory'
        );
        setDepartments(res.departments);
      } catch {
        // Handled cleanly
      }
    })();
  }, []);

  if (!studioUser) return null;

  const isDirectorOrAdmin = studioUser.role === 'DIRECTOR' || studioUser.role === 'ADMIN';
  const accessibleDepartments = isDirectorOrAdmin
    ? departments
    : departments.filter((d) => studioUser.departments.some((m) => m.departmentId === d.id));

  const navItems: Array<{ section: SharedSection; label: string; icon: React.ReactNode }> = [
    { section: 'dashboard', label: 'Personal Dashboard', icon: <Home className="w-4 h-4" /> },
    { section: 'projects', label: 'Production Pipeline', icon: <Layers className="w-4 h-4" /> },
    { section: 'tasks', label: 'Tasks', icon: <CheckSquare className="w-4 h-4" /> },
    { section: 'calendar', label: 'Calendar', icon: <Calendar className="w-4 h-4" /> },
    { section: 'files', label: 'Asset Library', icon: <FolderOpen className="w-4 h-4" /> },
    { section: 'reviews', label: 'Work Reviews', icon: <FileCheck2 className="w-4 h-4" /> },
    { section: 'announcements', label: 'Announcements', icon: <Megaphone className="w-4 h-4" /> },
    { section: 'tools', label: 'Creative Software', icon: <Wrench className="w-4 h-4" /> },
    { section: 'profile', label: 'Profile & Security', icon: <UserCog className="w-4 h-4" /> },
  ];

  const selectRoute = (next: ActiveRoute) => {
    setRoute(next);
    setMobileMenuOpen(false);
  };

  const sidebarContent = (
    <div className="flex flex-col h-full bg-[#0E1118] border-r border-white/10">
      <div className="p-4 border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-2.5 min-w-0">
          <StudioCrest className="w-7 h-7 shrink-0" />
          <div className="min-w-0">
            <p className="font-display text-base font-bold text-white truncate">Elder&apos;sVeil</p>
            <p className="text-[11px] font-mono-tabular text-amber-400 truncate">
              {studioUser.memberId || studioUser.role}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setMobileMenuOpen(false)}
          className="lg:hidden p-1 text-gray-400 hover:text-white"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-5 text-xs">
        {isDirectorOrAdmin && (
          <div className="space-y-1">
            <p className="px-2.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
              Command &amp; Governance
            </p>
            <button
              type="button"
              onClick={() => selectRoute({ kind: 'director' })}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors cursor-pointer ${
                route.kind === 'director'
                  ? 'bg-amber-500 text-[#0B0D12] font-semibold'
                  : 'text-gray-300 hover:bg-white/5 hover:text-white'
              }`}
            >
              <Crown className="w-4 h-4 shrink-0" />
              <span className="truncate">
                {studioUser.role === 'DIRECTOR' ? "Director's Office" : 'Admin Workplace'}
              </span>
            </button>
          </div>
        )}

        <div className="space-y-1">
          <p className="px-2.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
            Studio Workplace
          </p>
          {navItems.map((item) => {
            const active = route.kind === 'shared' && route.section === item.section;
            return (
              <button
                key={item.section}
                type="button"
                onClick={() => selectRoute({ kind: 'shared', section: item.section })}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors cursor-pointer ${
                  active
                    ? 'bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/40'
                    : 'text-gray-300 hover:bg-white/5 hover:text-white'
                }`}
              >
                {item.icon}
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </div>

        <div className="space-y-1">
          <p className="px-2.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
            Department Workplaces ({accessibleDepartments.length})
          </p>
          {accessibleDepartments.map((d) => {
            const active = route.kind === 'department' && route.deptId === d.id;
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => selectRoute({ kind: 'department', deptId: d.id })}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg transition-colors cursor-pointer ${
                  active
                    ? 'bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/40'
                    : 'text-gray-300 hover:bg-white/5 hover:text-white'
                }`}
              >
                <span className="truncate">{d.name}</span>
                <span className="font-mono-tabular text-[11px] text-gray-400 shrink-0">
                  {d.prefix}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="p-3 border-t border-white/10 space-y-1.5 text-xs">
        <button
          type="button"
          onClick={onExitToPublic}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-gray-300 hover:bg-white/5 hover:text-white cursor-pointer"
        >
          <Globe className="w-4 h-4" />
          <span>Public Studio Portal</span>
        </button>
        <button
          type="button"
          onClick={logout}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-gray-400 hover:bg-red-500/10 hover:text-red-300 cursor-pointer"
        >
          <LogOut className="w-4 h-4" />
          <span>Sign Out</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0B0D12] text-[#F1F3F7] flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-[264px] shrink-0 sticky top-0 h-screen">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="w-[270px] h-full">{sidebarContent}</div>
          <div
            className="flex-1 bg-black/60"
            onClick={() => setMobileMenuOpen(false)}
          />
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-20 h-14 px-6 border-b border-white/10 bg-[#0B0D12]/90 backdrop-blur-md flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-1.5 rounded-md border border-white/15 text-gray-300"
            >
              <Menu className="w-4 h-4" />
            </button>
            <p className="text-xs text-gray-400 truncate">
              Elder&apos;sVeil Anime Studio ·{' '}
              <span className="text-white font-medium">
                {route.kind === 'director'
                  ? studioUser.role === 'DIRECTOR'
                    ? "Director's Office"
                    : 'Admin Workplace'
                  : route.kind === 'department'
                    ? `${departments.find((d) => d.id === route.deptId)?.name || route.deptId} Department`
                    : route.section.charAt(0).toUpperCase() + route.section.slice(1)}
              </span>
            </p>
          </div>

          <div className="flex items-center gap-4 text-xs shrink-0">
            <button
              type="button"
              onClick={() => selectRoute({ kind: 'shared', section: 'dashboard' })}
              className="inline-flex items-center gap-1.5 text-gray-300 hover:text-white cursor-pointer"
            >
              <Bell className="w-4 h-4 text-amber-400" />
              <span className="font-mono-tabular">{unreadNotifications}</span>
            </button>
            <span className="hidden sm:inline text-gray-400">
              {studioUser.fullName} · <span className="text-amber-400">{studioUser.role}</span>
            </span>
          </div>
        </header>

        <main className="flex-1 p-6 max-w-7xl w-full mx-auto">
          {route.kind === 'director' && <DirectorOffice />}
          {route.kind === 'department' && <DepartmentWorkplace deptId={route.deptId} />}
          {route.kind === 'shared' && <StudioSharedWorkspace section={route.section} />}
        </main>
      </div>
    </div>
  );
}
