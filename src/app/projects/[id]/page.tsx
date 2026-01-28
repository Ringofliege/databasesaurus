'use client';

import { useState, useEffect, useCallback, use } from 'react';
import { useApp } from '@/lib/app-context';
import { 
  Save, 
  RefreshCw, 
  Play, 
  Database,
  User,
  Calendar,
  CheckCircle,
  XCircle
} from 'lucide-react';

interface DbObject {
  id: string;
  objectType: 'database' | 'user';
  name: string;
  createdAt: string;
}

interface AuditEvent {
  id: string;
  actor: string;
  action: string;
  success: boolean;
  createdAt: string;
  durationMs?: number;
}

interface ProjectDetail {
  id: string;
  name: string;
  slug: string;
  lastDbKind?: string;
  lastDbHost?: string;
  lastDbPort?: number;
  lastDbName?: string;
  gitlabRepoPath?: string;
  defaultBranch?: string;
  workingDirectory?: string;
  pnpmFilter?: string;
  dbObjects: DbObject[];
  auditEvents: AuditEvent[];
}

export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { authHeaders, setActiveProject, refreshSession, sessionStatus } = useApp();
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showSessionModal, setShowSessionModal] = useState(false);

  // Form state
  const [gitlabRepoPath, setGitlabRepoPath] = useState('');
  const [defaultBranch, setDefaultBranch] = useState('');
  const [workingDirectory, setWorkingDirectory] = useState('');
  const [pnpmFilter, setPnpmFilter] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchProject = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/projects/${id}`, {
        headers: authHeaders(),
      });

      if (!res.ok) {
        throw new Error('Failed to fetch project');
      }

      const data = await res.json();
      setProject(data.project);
      setGitlabRepoPath(data.project.gitlabRepoPath || '');
      setDefaultBranch(data.project.defaultBranch || 'main');
      setWorkingDirectory(data.project.workingDirectory || '');
      setPnpmFilter(data.project.pnpmFilter || '');
      
      // Set as active project
      setActiveProject(data.project);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [id, authHeaders, setActiveProject]);

  useEffect(() => {
    fetchProject();
  }, [fetchProject]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: 'PATCH',
        headers: {
          ...authHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          gitlabRepoPath: gitlabRepoPath || null,
          defaultBranch: defaultBranch || null,
          workingDirectory: workingDirectory || null,
          pnpmFilter: pnpmFilter || null,
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to update project');
      }

      const data = await res.json();
      setProject(prev => prev ? { ...prev, ...data.project } : null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="text-center py-8 text-[var(--muted)]">Loading project...</div>;
  }

  if (error || !project) {
    return (
      <div className="text-center py-8">
        <p className="text-[var(--danger)] mb-4">{error || 'Project not found'}</p>
        <button onClick={fetchProject} className="btn btn-secondary">
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{project.name}</h1>
          <p className="text-[var(--muted)] font-mono text-sm">{project.slug}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchProject}
            className="btn btn-secondary flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
          <button
            onClick={() => setShowSessionModal(true)}
            className="btn btn-primary flex items-center gap-2"
          >
            <Play className="w-4 h-4" />
            {sessionStatus?.active ? 'Reconnect' : 'Start Session'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Metadata Section */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold mb-4">Metadata</h2>
          {project.lastDbHost ? (
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-[var(--muted)]">Database Kind</span>
                <span className="font-medium">{project.lastDbKind}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--muted)]">Host</span>
                <span className="font-medium">{project.lastDbHost}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--muted)]">Port</span>
                <span className="font-medium">{project.lastDbPort}</span>
              </div>
              {project.lastDbName && (
                <div className="flex justify-between">
                  <span className="text-[var(--muted)]">Database</span>
                  <span className="font-medium">{project.lastDbName}</span>
                </div>
              )}
            </div>
          ) : (
            <p className="text-[var(--muted)]">No database connection info yet. Start a session to connect.</p>
          )}
        </div>

        {/* GitLab / Prisma Config */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold mb-4">GitLab / Prisma Config</h2>
          <div className="space-y-4">
            <div>
              <label className="label">Repository Path</label>
              <div className="flex items-center">
                <span className="text-[var(--muted)] text-sm mr-2">peakwork/</span>
                <input
                  type="text"
                  value={gitlabRepoPath}
                  onChange={(e) => setGitlabRepoPath(e.target.value)}
                  className="input flex-1"
                  placeholder="my-repo"
                />
              </div>
            </div>
            <div>
              <label className="label">Default Branch</label>
              <input
                type="text"
                value={defaultBranch}
                onChange={(e) => setDefaultBranch(e.target.value)}
                className="input w-full"
              />
            </div>
            <div>
              <label className="label">Working Directory</label>
              <input
                type="text"
                value={workingDirectory}
                onChange={(e) => setWorkingDirectory(e.target.value)}
                className="input w-full"
                placeholder="packages/api"
              />
            </div>
            <div>
              <label className="label">pnpm Filter</label>
              <input
                type="text"
                value={pnpmFilter}
                onChange={(e) => setPnpmFilter(e.target.value)}
                className="input w-full"
                placeholder="@org/package"
              />
            </div>
            <button
              onClick={handleSave}
              disabled={saving}
              className="btn btn-primary flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>

        {/* Known DB Objects */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold mb-4">Known DB Objects</h2>
          {project.dbObjects.length === 0 ? (
            <p className="text-[var(--muted)]">No known objects yet.</p>
          ) : (
            <div className="space-y-2">
              {project.dbObjects.map((obj) => (
                <div
                  key={obj.id}
                  className="flex items-center gap-3 p-2 rounded bg-[var(--background)]"
                >
                  {obj.objectType === 'database' ? (
                    <Database className="w-4 h-4 text-[var(--primary)]" />
                  ) : (
                    <User className="w-4 h-4 text-[var(--success)]" />
                  )}
                  <span className="font-mono text-sm">{obj.name}</span>
                  <span className="text-xs text-[var(--muted)] ml-auto">
                    {obj.objectType}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Audit Events */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold mb-4">Recent Activity</h2>
          {project.auditEvents.length === 0 ? (
            <p className="text-[var(--muted)]">No activity yet.</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-auto">
              {project.auditEvents.map((event) => (
                <div
                  key={event.id}
                  className="flex items-center gap-3 p-2 rounded bg-[var(--background)] text-sm"
                >
                  {event.success ? (
                    <CheckCircle className="w-4 h-4 text-[var(--success)]" />
                  ) : (
                    <XCircle className="w-4 h-4 text-[var(--danger)]" />
                  )}
                  <span className="font-medium">{event.action}</span>
                  <span className="text-[var(--muted)]">by {event.actor}</span>
                  <span className="text-xs text-[var(--muted)] ml-auto flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {new Date(event.createdAt).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showSessionModal && (
        <SessionModal
          projectId={project.id}
          onClose={() => setShowSessionModal(false)}
          onConnected={() => {
            setShowSessionModal(false);
            refreshSession();
            fetchProject();
          }}
        />
      )}
    </div>
  );
}

function SessionModal({
  projectId,
  onClose,
  onConnected,
}: {
  projectId: string;
  onClose: () => void;
  onConnected: () => void;
}) {
  const { authHeaders } = useApp();
  const [adminUrl, setAdminUrl] = useState('');
  const [passwordOverride, setPasswordOverride] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [success, setSuccess] = useState(false);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setWarnings([]);

    try {
      const res = await fetch(`/api/projects/${projectId}/session/start`, {
        method: 'POST',
        headers: {
          ...authHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          adminUrl,
          passwordOverride: passwordOverride || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to connect');
      }

      setSuccess(true);
      setWarnings(data.warnings || []);
      setExpiresAt(data.expiresAt);

      // Auto close after 2 seconds if successful
      setTimeout(() => {
        onConnected();
      }, 2000);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="card w-full max-w-lg mx-4">
        <div className="p-6 border-b border-[var(--border)]">
          <h2 className="text-xl font-bold">Start Session</h2>
          <p className="text-sm text-[var(--muted)] mt-1">
            Connect to a target database. Credentials are stored only in memory for 60 minutes.
          </p>
        </div>

        {success ? (
          <div className="p-6">
            <div className="flex items-center gap-3 text-[var(--success)] mb-4">
              <CheckCircle className="w-6 h-6" />
              <span className="font-medium">Connected successfully!</span>
            </div>
            {warnings.length > 0 && (
              <div className="space-y-2 mb-4">
                {warnings.map((w, i) => (
                  <div key={i} className="text-[var(--warning)] text-sm p-2 rounded bg-[var(--warning)]/10">
                    {w}
                  </div>
                ))}
              </div>
            )}
            {expiresAt && (
              <p className="text-sm text-[var(--muted)]">
                Session expires at {new Date(expiresAt).toLocaleTimeString()}
              </p>
            )}
          </div>
        ) : (
          <form onSubmit={handleConnect} className="p-6 space-y-4">
            <div>
              <label className="label">Target DB Admin URL *</label>
              <input
                type="text"
                value={adminUrl}
                onChange={(e) => setAdminUrl(e.target.value)}
                className="input w-full font-mono text-sm"
                placeholder="mysql://user:pass@host:3306/database"
                required
              />
              <p className="text-xs text-[var(--muted)] mt-1">
                Supported: mysql://, postgres://, postgresql://
              </p>
            </div>

            <div>
              <label className="label">Password Override (optional)</label>
              <input
                type="password"
                value={passwordOverride}
                onChange={(e) => setPasswordOverride(e.target.value)}
                className="input w-full"
                placeholder="Override password in URL"
              />
            </div>

            {error && (
              <div className="text-[var(--danger)] text-sm p-3 rounded bg-[var(--danger)]/10">
                {error}
              </div>
            )}

            <div className="flex justify-end gap-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="btn btn-primary flex items-center gap-2"
              >
                {loading ? 'Connecting...' : 'Connect'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
