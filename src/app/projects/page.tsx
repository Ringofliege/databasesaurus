'use client';

import { useState, useEffect, useCallback } from 'react';
import { useApp } from '@/lib/app-context';
import { Plus, ExternalLink, Database, Clock, RefreshCw } from 'lucide-react';
import Link from 'next/link';

interface Project {
  id: string;
  name: string;
  slug: string;
  lastDbKind?: string;
  lastDbHost?: string;
  lastDbPort?: number;
  updatedAt: string;
  gitlabRepoPath?: string;
}

export default function ProjectsPage() {
  const { authHeaders, setActiveProject } = useApp();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [needsAuth, setNeedsAuth] = useState(false);

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/projects', {
        headers: authHeaders(),
      });

      if (res.status === 401) {
        setNeedsAuth(true);
        return;
      }

      if (!res.ok) {
        throw new Error('Failed to fetch projects');
      }

      const data = await res.json();
      setProjects(data.projects);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  if (needsAuth) {
    return <LoginForm onSuccess={() => { setNeedsAuth(false); fetchProjects(); }} />;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Projects</h1>
        <div className="flex gap-2">
          <button
            onClick={fetchProjects}
            className="btn btn-secondary flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn btn-primary flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Create Project
          </button>
        </div>
      </div>

      {loading ? (
        <div className="card p-8 text-center text-[var(--muted)]">Loading projects...</div>
      ) : error ? (
        <div className="card p-8 text-center text-[var(--danger)]">{error}</div>
      ) : projects.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-[var(--muted)] mb-4">No projects yet. Create your first project to get started.</p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn btn-primary"
          >
            Create Project
          </button>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead className="bg-[var(--background)]">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-[var(--muted)]">Name</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-[var(--muted)]">Slug</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-[var(--muted)]">DB Kind</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-[var(--muted)]">DB Host</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-[var(--muted)]">Updated</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-[var(--muted)]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {projects.map((project) => (
                <tr key={project.id} className="hover:bg-[var(--background)]">
                  <td className="px-4 py-3 font-medium">{project.name}</td>
                  <td className="px-4 py-3 text-[var(--muted)] font-mono text-sm">{project.slug}</td>
                  <td className="px-4 py-3">
                    {project.lastDbKind ? (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-[var(--background)]">
                        <Database className="w-3 h-3" />
                        {project.lastDbKind}
                      </span>
                    ) : (
                      <span className="text-[var(--muted)]">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {project.lastDbHost || <span className="text-[var(--muted)]">—</span>}
                  </td>
                  <td className="px-4 py-3 text-sm text-[var(--muted)]">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(project.updatedAt).toLocaleDateString()}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/projects/${project.id}`}
                      onClick={() => setActiveProject(project)}
                      className="btn btn-secondary text-sm py-1 px-3 inline-flex items-center gap-1"
                    >
                      Open
                      <ExternalLink className="w-3 h-3" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreateModal && (
        <CreateProjectModal
          onClose={() => setShowCreateModal(false)}
          onCreated={(project) => {
            setProjects([project, ...projects]);
            setShowCreateModal(false);
          }}
        />
      )}
    </div>
  );
}

function LoginForm({ onSuccess }: { onSuccess: () => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const base64 = btoa(`${username}:${password}`);
      const res = await fetch('/api/projects', {
        headers: {
          Authorization: `Basic ${base64}`,
        },
      });

      if (res.status === 401) {
        setError('Invalid credentials');
        return;
      }

      // Store credentials
      localStorage.setItem('dbhelper_credentials', JSON.stringify({ username, password }));
      onSuccess();
    } catch {
      setError('Connection failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto mt-20">
      <div className="card p-8">
        <h1 className="text-2xl font-bold mb-6 text-center">DB + Prisma Helper</h1>
        <p className="text-[var(--muted)] text-center mb-6">Please log in to continue</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="input w-full"
              required
            />
          </div>
          <div>
            <label className="label">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input w-full"
              required
            />
          </div>

          {error && (
            <div className="text-[var(--danger)] text-sm text-center">{error}</div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary w-full"
          >
            {loading ? 'Logging in...' : 'Log In'}
          </button>
        </form>
      </div>
    </div>
  );
}

function CreateProjectModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (project: Project) => void;
}) {
  const { authHeaders } = useApp();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [gitlabRepoPath, setGitlabRepoPath] = useState('');
  const [defaultBranch, setDefaultBranch] = useState('main');
  const [workingDirectory, setWorkingDirectory] = useState('');
  const [pnpmFilter, setPnpmFilter] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Auto-generate slug from name
  useEffect(() => {
    if (!slug || slug === generateSlug(name.slice(0, -1))) {
      setSlug(generateSlug(name));
    }
  }, [name, slug]);

  const generateSlug = (str: string) => {
    return str
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 50);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: {
          ...authHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name,
          slug,
          gitlabRepoPath: gitlabRepoPath || undefined,
          defaultBranch: defaultBranch || undefined,
          workingDirectory: workingDirectory || undefined,
          pnpmFilter: pnpmFilter || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create project');
      }

      const data = await res.json();
      onCreated(data.project);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="card w-full max-w-lg mx-4 max-h-[90vh] overflow-auto">
        <div className="p-6 border-b border-[var(--border)]">
          <h2 className="text-xl font-bold">Create Project</h2>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="label">Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input w-full"
              required
            />
          </div>

          <div>
            <label className="label">Slug *</label>
            <input
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              className="input w-full font-mono"
              pattern="^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$"
              required
            />
            <p className="text-xs text-[var(--muted)] mt-1">
              Lowercase letters, numbers, and hyphens only
            </p>
          </div>

          <div>
            <label className="label">GitLab Repository Path</label>
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
              placeholder="main"
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

          {error && (
            <div className="text-[var(--danger)] text-sm">{error}</div>
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
              className="btn btn-primary"
            >
              {loading ? 'Creating...' : 'Create Project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
