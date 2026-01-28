'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useApp } from '@/lib/app-context';
import { 
  FolderKanban, 
  Database, 
  GitBranch, 
  ScrollText,
  ChevronRight,
  Circle
} from 'lucide-react';

const navItems = [
  { href: '/projects', label: 'Projects', icon: FolderKanban },
  { href: '/db-ops', label: 'DB Ops', icon: Database },
  { href: '/prisma', label: 'Prisma', icon: GitBranch },
  { href: '/audit', label: 'Audit', icon: ScrollText },
];

export function Sidebar() {
  const pathname = usePathname();
  const { activeProject, sessionStatus } = useApp();

  return (
    <aside className="w-64 h-screen bg-[var(--card-bg)] border-r border-[var(--border)] flex flex-col">
      {/* Logo */}
      <div className="p-4 border-b border-[var(--border)]">
        <h1 className="text-lg font-bold flex items-center gap-2">
          <Database className="w-6 h-6 text-[var(--primary)]" />
          DB + Prisma Helper
        </h1>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4">
        <ul className="space-y-1">
          {navItems.map((item) => {
            const isActive = pathname.startsWith(item.href);
            const Icon = item.icon;
            
            // Check if route requires session
            const requiresSession = item.href === '/db-ops' || item.href === '/prisma';
            const isDisabled = requiresSession && !sessionStatus?.active;
            
            return (
              <li key={item.href}>
                <Link
                  href={isDisabled ? '#' : item.href}
                  className={`
                    flex items-center gap-3 px-3 py-2 rounded-md transition-colors
                    ${isActive ? 'bg-[var(--primary)] text-white' : 'hover:bg-[var(--background)]'}
                    ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}
                  `}
                  onClick={(e) => isDisabled && e.preventDefault()}
                >
                  <Icon className="w-5 h-5" />
                  {item.label}
                  {requiresSession && !sessionStatus?.active && (
                    <span className="ml-auto text-xs text-[var(--warning)]">No session</span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Active Project Info */}
      {activeProject && (
        <div className="p-4 border-t border-[var(--border)]">
          <div className="text-xs text-[var(--muted)] mb-1">Active Project</div>
          <Link 
            href={`/projects/${activeProject.id}`}
            className="flex items-center gap-2 text-sm font-medium hover:text-[var(--primary)]"
          >
            {activeProject.name}
            <ChevronRight className="w-4 h-4" />
          </Link>
          {activeProject.lastDbHost && (
            <div className="text-xs text-[var(--muted)] mt-1">
              {activeProject.lastDbKind}: {activeProject.lastDbHost}
            </div>
          )}
        </div>
      )}
    </aside>
  );
}

export function TopBar() {
  const { activeProject, sessionStatus } = useApp();

  const formatTimeRemaining = (expiresAt: string) => {
    const remaining = new Date(expiresAt).getTime() - Date.now();
    if (remaining <= 0) return 'Expired';
    const minutes = Math.floor(remaining / 60000);
    return `${minutes}m remaining`;
  };

  return (
    <header className="h-14 bg-[var(--card-bg)] border-b border-[var(--border)] flex items-center justify-between px-6">
      <div className="flex items-center gap-4">
        {activeProject ? (
          <span className="text-sm">
            <span className="text-[var(--muted)]">Project:</span>{' '}
            <span className="font-medium">{activeProject.name}</span>
          </span>
        ) : (
          <span className="text-sm text-[var(--muted)]">No project selected</span>
        )}
      </div>

      <div className="flex items-center gap-4">
        {/* Session Status */}
        <div className="flex items-center gap-2 text-sm">
          <Circle
            className={`w-3 h-3 ${
              sessionStatus?.active ? 'text-[var(--success)] fill-current' : 'text-[var(--muted)]'
            }`}
          />
          {sessionStatus?.active ? (
            <span>
              Connected
              {sessionStatus.expiresAt && (
                <span className="text-[var(--muted)] ml-2">
                  ({formatTimeRemaining(sessionStatus.expiresAt)})
                </span>
              )}
            </span>
          ) : (
            <span className="text-[var(--muted)]">Disconnected</span>
          )}
        </div>
      </div>
    </header>
  );
}

export function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
