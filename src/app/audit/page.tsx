'use client';

import { useState, useEffect, useCallback } from 'react';
import { useApp } from '@/lib/app-context';
import {
  RefreshCw,
  CheckCircle,
  XCircle,
  Calendar,
  Clock,
  Filter,
  Eye,
} from 'lucide-react';

interface AuditEvent {
  id: string;
  projectId: string;
  actor: string;
  action: string;
  success: boolean;
  durationMs?: number;
  payloadJson: Record<string, unknown>;
  createdAt: string;
}

interface Project {
  id: string;
  name: string;
  slug: string;
}

export default function AuditPage() {
  const { authHeaders } = useApp();
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedProject, setSelectedProject] = useState<string>('');
  const [actionFilter, setActionFilter] = useState<string>('');
  const [selectedEvent, setSelectedEvent] = useState<AuditEvent | null>(null);

  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch('/api/projects', {
        headers: authHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setProjects(data.projects);
      }
    } catch {
      // Ignore
    }
  }, [authHeaders]);

  const fetchEvents = useCallback(async () => {
    if (!selectedProject) {
      setEvents([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ limit: '100' });
      if (actionFilter) {
        params.set('action', actionFilter);
      }

      const res = await fetch(`/api/projects/${selectedProject}/audit?${params}`, {
        headers: authHeaders(),
      });

      if (!res.ok) {
        throw new Error('Failed to fetch audit events');
      }

      const data = await res.json();
      setEvents(data.events);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [selectedProject, actionFilter, authHeaders]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const actionTypes = [
    'session.start',
    'session.end',
    'project.create',
    'project.update',
    'db.create',
    'db.drop',
    'db.clear',
    'user.create',
    'user.rotate-password',
    'grants.app-rights',
    'sql.execute',
    'prisma.clone',
    'prisma.migrate-deploy',
    'prisma.generate',
    'prisma.seed',
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Audit Log</h1>
        <button
          onClick={fetchEvents}
          disabled={!selectedProject}
          className="btn btn-secondary flex items-center gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="card p-4 mb-6">
        <div className="flex items-center gap-4">
          <Filter className="w-5 h-5 text-[var(--muted)]" />
          <div className="flex-1">
            <label className="label">Project</label>
            <select
              value={selectedProject}
              onChange={(e) => setSelectedProject(e.target.value)}
              className="input w-full"
            >
              <option value="">Select a project...</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.slug})
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <label className="label">Action Type</label>
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="input w-full"
            >
              <option value="">All actions</option>
              {actionTypes.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {!selectedProject ? (
        <div className="card p-8 text-center text-[var(--muted)]">
          Select a project to view audit events
        </div>
      ) : loading ? (
        <div className="card p-8 text-center text-[var(--muted)]">Loading audit events...</div>
      ) : error ? (
        <div className="card p-8 text-center text-[var(--danger)]">{error}</div>
      ) : events.length === 0 ? (
        <div className="card p-8 text-center text-[var(--muted)]">No audit events found</div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead className="bg-[var(--background)]">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-[var(--muted)]">Timestamp</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-[var(--muted)]">Actor</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-[var(--muted)]">Action</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-[var(--muted)]">Status</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-[var(--muted)]">Duration</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-[var(--muted)]">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {events.map((event) => (
                <tr key={event.id} className="hover:bg-[var(--background)]">
                  <td className="px-4 py-3 text-sm">
                    <div className="flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-[var(--muted)]" />
                      {new Date(event.createdAt).toLocaleString()}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-medium">{event.actor}</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-1 rounded-full text-xs font-medium bg-[var(--background)]">
                      {event.action}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {event.success ? (
                      <span className="flex items-center gap-1 text-[var(--success)]">
                        <CheckCircle className="w-4 h-4" />
                        Success
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[var(--danger)]">
                        <XCircle className="w-4 h-4" />
                        Failed
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {event.durationMs !== null && event.durationMs !== undefined ? (
                      <span className="flex items-center gap-1 text-[var(--muted)]">
                        <Clock className="w-3 h-3" />
                        {event.durationMs}ms
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setSelectedEvent(event)}
                      className="btn btn-secondary text-sm py-1 px-3 flex items-center gap-1"
                    >
                      <Eye className="w-3 h-3" />
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedEvent && (
        <EventDetailModal
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
        />
      )}
    </div>
  );
}

function EventDetailModal({
  event,
  onClose,
}: {
  event: AuditEvent;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="card w-full max-w-2xl mx-4 max-h-[90vh] overflow-auto">
        <div className="p-6 border-b border-[var(--border)]">
          <h2 className="text-xl font-bold">Event Details</h2>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">ID</label>
              <p className="font-mono text-sm">{event.id}</p>
            </div>
            <div>
              <label className="label">Timestamp</label>
              <p>{new Date(event.createdAt).toLocaleString()}</p>
            </div>
            <div>
              <label className="label">Actor</label>
              <p className="font-medium">{event.actor}</p>
            </div>
            <div>
              <label className="label">Action</label>
              <p className="font-mono">{event.action}</p>
            </div>
            <div>
              <label className="label">Status</label>
              <p className={event.success ? 'text-[var(--success)]' : 'text-[var(--danger)]'}>
                {event.success ? 'Success' : 'Failed'}
              </p>
            </div>
            <div>
              <label className="label">Duration</label>
              <p>{event.durationMs !== null && event.durationMs !== undefined ? `${event.durationMs}ms` : '—'}</p>
            </div>
          </div>

          <div>
            <label className="label">Payload</label>
            <pre className="bg-[var(--background)] p-4 rounded font-mono text-sm overflow-auto max-h-64">
              {JSON.stringify(event.payloadJson, null, 2) || 'null'}
            </pre>
          </div>

          <div className="flex justify-end pt-4">
            <button onClick={onClose} className="btn btn-primary">
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
