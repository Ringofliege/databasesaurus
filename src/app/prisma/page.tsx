'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useApp } from '@/lib/app-context';
import { useRouter } from 'next/navigation';
import {
  RefreshCw,
  GitBranch,
  Play,
  Download,
  FileCode,
  Sprout,
  Loader2,
  CheckCircle,
  XCircle,
} from 'lucide-react';

interface RunStatus {
  runId: string;
  status: string;
  exitCode: number | null;
  logs: string[];
}

export default function PrismaPage() {
  const { activeProject, sessionStatus, authHeaders } = useApp();
  const router = useRouter();
  const [currentRun, setCurrentRun] = useState<RunStatus | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Redirect if no session
  useEffect(() => {
    if (!sessionStatus?.active) {
      if (activeProject) {
        router.push(`/projects/${activeProject.id}`);
      } else {
        router.push('/projects');
      }
    }
  }, [sessionStatus, activeProject, router]);

  // Auto-scroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const streamLogs = useCallback(async (runId: string) => {
    if (!activeProject) return;
    
    try {
      const res = await fetch(`/api/projects/${activeProject.id}/prisma/logs/stream?runId=${runId}`, {
        headers: authHeaders(),
      });

      // Check if it's a complete response (JSON)
      const contentType = res.headers.get('content-type');
      if (contentType?.includes('application/json')) {
        const data = await res.json();
        setLogs(data.logs || []);
        setCurrentRun({
          runId,
          status: data.status,
          exitCode: data.exitCode,
          logs: data.logs || [],
        });
        return;
      }

      // SSE stream
      const reader = res.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          
          const eventMatch = line.match(/^event: (.+)$/m);
          const dataMatch = line.match(/^data: (.+)$/m);
          
          if (eventMatch && dataMatch) {
            const event = eventMatch[1];
            const data = JSON.parse(dataMatch[1]);
            
            if (event === 'log') {
              setLogs(prev => [...prev, data.line]);
            } else if (event === 'complete') {
              setCurrentRun({
                runId,
                status: data.status,
                exitCode: data.exitCode,
                logs: [],
              });
              return;
            } else if (event === 'error') {
              setError(data.message);
              return;
            }
          }
        }
      }
    } catch (err) {
      setError((err as Error).message);
    }
  }, [activeProject, authHeaders]);

  const runCommand = async (endpoint: string, label: string) => {
    if (!activeProject) return;
    setLoading(label);
    setError(null);
    setLogs([]);
    setCurrentRun(null);

    try {
      const res = await fetch(`/api/projects/${activeProject.id}/prisma/${endpoint}`, {
        method: 'POST',
        headers: {
          ...authHeaders(),
          'Content-Type': 'application/json',
        },
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `Failed to run ${label}`);
      }

      const data = await res.json();
      
      if (data.runId) {
        // Stream logs for this run
        await streamLogs(data.runId);
      } else {
        setCurrentRun({
          runId: '',
          status: data.success ? 'success' : 'failed',
          exitCode: data.exitCode,
          logs: [],
        });
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(null);
    }
  };

  if (!sessionStatus?.active || !activeProject) {
    return (
      <div className="text-center py-8">
        <p className="text-[var(--muted)]">No active session. Please start a session first.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Prisma Operations</h1>
      </div>

      {/* GitLab Config */}
      <div className="card p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <GitBranch className="w-5 h-5" />
          Repository Configuration
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <span className="text-[var(--muted)]">Repository:</span>
            <span className="ml-2 font-mono">
              {activeProject.gitlabRepoPath ? `peakwork/${activeProject.gitlabRepoPath}` : '—'}
            </span>
          </div>
          <div>
            <span className="text-[var(--muted)]">Branch:</span>
            <span className="ml-2 font-mono">{activeProject.defaultBranch || 'main'}</span>
          </div>
          <div>
            <span className="text-[var(--muted)]">Working Dir:</span>
            <span className="ml-2 font-mono">{activeProject.workingDirectory || '/'}</span>
          </div>
          <div>
            <span className="text-[var(--muted)]">pnpm Filter:</span>
            <span className="ml-2 font-mono">{activeProject.pnpmFilter || '—'}</span>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <button
          onClick={() => runCommand('clone', 'Clone/Refresh')}
          disabled={!!loading || !activeProject.gitlabRepoPath}
          className="card p-4 hover:bg-[var(--background)] transition-colors disabled:opacity-50 text-left"
        >
          <div className="flex items-center gap-2 mb-2">
            {loading === 'Clone/Refresh' ? (
              <Loader2 className="w-5 h-5 animate-spin text-[var(--primary)]" />
            ) : (
              <Download className="w-5 h-5 text-[var(--primary)]" />
            )}
            <span className="font-medium">Clone/Refresh</span>
          </div>
          <p className="text-xs text-[var(--muted)]">Clone or update repository</p>
        </button>

        <button
          onClick={() => runCommand('migrate-deploy', 'Migrate Deploy')}
          disabled={!!loading || !activeProject.gitlabRepoPath}
          className="card p-4 hover:bg-[var(--background)] transition-colors disabled:opacity-50 text-left"
        >
          <div className="flex items-center gap-2 mb-2">
            {loading === 'Migrate Deploy' ? (
              <Loader2 className="w-5 h-5 animate-spin text-[var(--primary)]" />
            ) : (
              <Play className="w-5 h-5 text-[var(--primary)]" />
            )}
            <span className="font-medium">Migrate Deploy</span>
          </div>
          <p className="text-xs text-[var(--muted)]">Run prisma migrate deploy</p>
        </button>

        <button
          onClick={() => runCommand('generate', 'Generate')}
          disabled={!!loading || !activeProject.gitlabRepoPath}
          className="card p-4 hover:bg-[var(--background)] transition-colors disabled:opacity-50 text-left"
        >
          <div className="flex items-center gap-2 mb-2">
            {loading === 'Generate' ? (
              <Loader2 className="w-5 h-5 animate-spin text-[var(--primary)]" />
            ) : (
              <FileCode className="w-5 h-5 text-[var(--primary)]" />
            )}
            <span className="font-medium">Generate</span>
          </div>
          <p className="text-xs text-[var(--muted)]">Run prisma generate</p>
        </button>

        <button
          onClick={() => runCommand('seed', 'Seed')}
          disabled={!!loading || !activeProject.gitlabRepoPath}
          className="card p-4 hover:bg-[var(--background)] transition-colors disabled:opacity-50 text-left"
        >
          <div className="flex items-center gap-2 mb-2">
            {loading === 'Seed' ? (
              <Loader2 className="w-5 h-5 animate-spin text-[var(--primary)]" />
            ) : (
              <Sprout className="w-5 h-5 text-[var(--primary)]" />
            )}
            <span className="font-medium">Seed</span>
          </div>
          <p className="text-xs text-[var(--muted)]">Run prisma db seed</p>
        </button>

        {activeProject.pnpmFilter && (
          <button
            onClick={() => runCommand('pnpm-prisma-migrate', 'pnpm Migrate')}
            disabled={!!loading}
            className="card p-4 hover:bg-[var(--background)] transition-colors disabled:opacity-50 text-left"
          >
            <div className="flex items-center gap-2 mb-2">
              {loading === 'pnpm Migrate' ? (
                <Loader2 className="w-5 h-5 animate-spin text-[var(--primary)]" />
              ) : (
                <RefreshCw className="w-5 h-5 text-[var(--primary)]" />
              )}
              <span className="font-medium">pnpm Migrate</span>
            </div>
            <p className="text-xs text-[var(--muted)]">pnpm --filter prisma:migrate</p>
          </button>
        )}
      </div>

      {/* Logs Panel */}
      <div className="card">
        <div className="p-4 border-b border-[var(--border)] flex items-center justify-between">
          <h3 className="font-semibold">Logs</h3>
          {currentRun && (
            <div className="flex items-center gap-2">
              {currentRun.status === 'success' ? (
                <span className="flex items-center gap-1 text-[var(--success)]">
                  <CheckCircle className="w-4 h-4" />
                  Success
                </span>
              ) : currentRun.status === 'failed' ? (
                <span className="flex items-center gap-1 text-[var(--danger)]">
                  <XCircle className="w-4 h-4" />
                  Failed (exit code: {currentRun.exitCode})
                </span>
              ) : currentRun.status === 'running' ? (
                <span className="flex items-center gap-1 text-[var(--primary)]">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Running...
                </span>
              ) : null}
            </div>
          )}
        </div>
        <div className="bg-black text-green-400 font-mono text-sm p-4 h-80 overflow-auto">
          {error && (
            <div className="text-red-400 mb-2">Error: {error}</div>
          )}
          {logs.length === 0 && !error && (
            <div className="text-gray-500">No output yet. Run a command to see logs here.</div>
          )}
          {logs.map((line, i) => (
            <div key={i} className="whitespace-pre-wrap">{line}</div>
          ))}
          <div ref={logsEndRef} />
        </div>
      </div>
    </div>
  );
}
