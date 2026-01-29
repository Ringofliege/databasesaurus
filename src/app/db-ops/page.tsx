'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useApp } from '@/lib/app-context';
import { useRouter } from 'next/navigation';
import {
  RefreshCw,
  Database,
  Users,
  Terminal,
  Plus,
  Trash2,
  Key,
  Shield,
  Play,
  AlertTriangle,
  Copy,
  Check,
  Activity,
  Table,
  Eye,
  Eraser,
  ChevronRight,
  ChevronDown,
  ChevronLeft,
  X,
  Search,
  Edit,
  Save,
} from 'lucide-react';

interface Overview {
  kind: string;
  host: string;
  port: number;
  currentDatabase: string;
  totalDatabases: number;
  activeConnections: number;
  databaseSize: string;
  serverVersion: string;
}

interface QueryResult {
  rows: Record<string, unknown>[];
  rowCount: number;
  fields: string[];
  executionTimeMs: number;
  truncated: boolean;
  totalCount?: number;
}

interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  isPrimary: boolean;
  defaultValue?: string;
}

type Tab = 'overview' | 'databases' | 'users' | 'console';

export default function DbOpsPage() {
  const { activeProject, sessionStatus } = useApp();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>('overview');

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

  if (!sessionStatus?.active || !activeProject) {
    return (
      <div className="text-center py-8">
        <p className="text-[var(--muted)]">No active session. Please start a session first.</p>
      </div>
    );
  }

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: 'Overview', icon: <Activity className="w-4 h-4" /> },
    { id: 'databases', label: 'Databases', icon: <Database className="w-4 h-4" /> },
    { id: 'users', label: 'Users & Grants', icon: <Users className="w-4 h-4" /> },
    { id: 'console', label: 'SQL Console', icon: <Terminal className="w-4 h-4" /> },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">DB Operations</h1>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-[var(--border)]">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`
              flex items-center gap-2 px-4 py-2 -mb-px border-b-2 transition-colors
              ${activeTab === tab.id
                ? 'border-[var(--primary)] text-[var(--primary)]'
                : 'border-transparent hover:border-[var(--border)]'
              }
            `}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && <OverviewTab />}
      {activeTab === 'databases' && <DatabasesTab />}
      {activeTab === 'users' && <UsersTab />}
      {activeTab === 'console' && <ConsoleTab />}
    </div>
  );
}

function OverviewTab() {
  const { activeProject, authHeaders } = useApp();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOverview = useCallback(async () => {
    if (!activeProject) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/projects/${activeProject.id}/db/overview`, {
        headers: authHeaders(),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to fetch overview');
      }

      const data = await res.json();
      setOverview(data.overview);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [activeProject, authHeaders]);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  if (loading) {
    return <div className="text-center py-8 text-[var(--muted)]">Loading overview...</div>;
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-[var(--danger)] mb-4">{error}</p>
        <button onClick={fetchOverview} className="btn btn-secondary">
          Try Again
        </button>
      </div>
    );
  }

  if (!overview) {
    return <div className="text-center py-8 text-[var(--muted)]">No data available</div>;
  }

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button
          onClick={fetchOverview}
          className="btn btn-secondary flex items-center gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card p-4">
          <div className="text-[var(--muted)] text-sm mb-1">Database Kind</div>
          <div className="text-2xl font-bold">{overview.kind}</div>
          <div className="text-xs text-[var(--muted)]">v{overview.serverVersion}</div>
        </div>
        <div className="card p-4">
          <div className="text-[var(--muted)] text-sm mb-1">Total Databases</div>
          <div className="text-2xl font-bold">{overview.totalDatabases}</div>
        </div>
        <div className="card p-4">
          <div className="text-[var(--muted)] text-sm mb-1">Active Connections</div>
          <div className="text-2xl font-bold">{overview.activeConnections}</div>
        </div>
        <div className="card p-4">
          <div className="text-[var(--muted)] text-sm mb-1">Database Size</div>
          <div className="text-2xl font-bold">{overview.databaseSize}</div>
        </div>
      </div>

      <div className="card p-6 mt-6">
        <h2 className="text-lg font-semibold mb-4">Connection Details</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <span className="text-[var(--muted)]">Host:</span>
            <span className="ml-2 font-mono">{overview.host}</span>
          </div>
          <div>
            <span className="text-[var(--muted)]">Port:</span>
            <span className="ml-2 font-mono">{overview.port}</span>
          </div>
          <div>
            <span className="text-[var(--muted)]">Current Database:</span>
            <span className="ml-2 font-mono">{overview.currentDatabase || 'N/A'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function DatabasesTab() {
  const { activeProject, authHeaders } = useApp();
  const [databases, setDatabases] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [clearConfirm, setClearConfirm] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [expandedDb, setExpandedDb] = useState<string | null>(null);
  const [tables, setTables] = useState<string[]>([]);
  const [tablesLoading, setTablesLoading] = useState(false);
  const [tablePreview, setTablePreview] = useState<{ table: string; data: QueryResult } | null>(null);
  const [truncateConfirm, setTruncateConfirm] = useState<{ database: string; table: string } | null>(null);
  const [browseData, setBrowseData] = useState<{ database: string; table: string } | null>(null);

  const fetchDatabases = useCallback(async () => {
    if (!activeProject) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/projects/${activeProject.id}/db/databases`, {
        headers: authHeaders(),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to fetch databases');
      }

      const data = await res.json();
      setDatabases(data.databases);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [activeProject, authHeaders]);

  const fetchTables = useCallback(async (database: string) => {
    if (!activeProject) return;
    setTablesLoading(true);
    setTables([]);

    try {
      const res = await fetch(`/api/projects/${activeProject.id}/db/tables?database=${encodeURIComponent(database)}`, {
        headers: authHeaders(),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to fetch tables');
      }

      const data = await res.json();
      setTables(data.tables);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setTablesLoading(false);
    }
  }, [activeProject, authHeaders]);

  useEffect(() => {
    fetchDatabases();
  }, [fetchDatabases]);

  const toggleDatabase = async (db: string) => {
    if (expandedDb === db) {
      setExpandedDb(null);
      setTables([]);
    } else {
      setExpandedDb(db);
      await fetchTables(db);
    }
  };

  const handleCreate = async (name: string) => {
    if (!activeProject) return;
    setActionLoading(true);

    try {
      const res = await fetch(`/api/projects/${activeProject.id}/db/databases`, {
        method: 'POST',
        headers: {
          ...authHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create database');
      }

      setShowCreateModal(false);
      fetchDatabases();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDrop = async (name: string) => {
    if (!activeProject) return;
    setActionLoading(true);

    try {
      const res = await fetch(`/api/projects/${activeProject.id}/db/databases/${name}`, {
        method: 'DELETE',
        headers: {
          ...authHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ confirmName: name }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to drop database');
      }

      setDeleteConfirm(null);
      if (expandedDb === name) {
        setExpandedDb(null);
        setTables([]);
      }
      fetchDatabases();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleClear = async (name: string) => {
    if (!activeProject) return;
    setActionLoading(true);

    try {
      const res = await fetch(`/api/projects/${activeProject.id}/db/databases/${name}/clear`, {
        method: 'POST',
        headers: {
          ...authHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ confirmName: name }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to clear database');
      }

      setClearConfirm(null);
      if (expandedDb === name) {
        await fetchTables(name);
      }
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setActionLoading(false);
    }
  };

  const handlePreviewTable = async (database: string, table: string) => {
    if (!activeProject) return;

    try {
      const res = await fetch(
        `/api/projects/${activeProject.id}/db/tables/${encodeURIComponent(table)}/preview?database=${encodeURIComponent(database)}&limit=3`,
        { headers: authHeaders() }
      );

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to fetch table preview');
      }

      const data = await res.json();
      setTablePreview({ table, data: data.result });
    } catch (err) {
      alert((err as Error).message);
    }
  };

  const handleTruncateTable = async (database: string, table: string) => {
    if (!activeProject) return;
    setActionLoading(true);

    try {
      const res = await fetch(
        `/api/projects/${activeProject.id}/db/tables/${encodeURIComponent(table)}/truncate`,
        {
          method: 'POST',
          headers: {
            ...authHeaders(),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ database, confirmName: table }),
        }
      );

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to truncate table');
      }

      setTruncateConfirm(null);
      alert(`Table "${table}" has been cleared.`);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return <div className="text-center py-8 text-[var(--muted)]">Loading databases...</div>;
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-[var(--danger)] mb-4">{error}</p>
        <button onClick={fetchDatabases} className="btn btn-secondary">
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <p className="text-[var(--muted)]">{databases.length} databases found</p>
        <div className="flex gap-2">
          <button
            onClick={fetchDatabases}
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
            Create Database
          </button>
        </div>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full">
          <thead className="bg-[var(--background)]">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-medium text-[var(--muted)]">Name</th>
              <th className="px-4 py-3 text-right text-sm font-medium text-[var(--muted)]">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {databases.map((db) => (
              <React.Fragment key={db}>
                <tr className="hover:bg-[var(--background)]">
                  <td className="px-4 py-3">
                    <button
                      onClick={() => toggleDatabase(db)}
                      className="flex items-center gap-2 font-mono hover:text-[var(--primary)] transition-colors"
                    >
                      {expandedDb === db ? (
                        <ChevronDown className="w-4 h-4" />
                      ) : (
                        <ChevronRight className="w-4 h-4" />
                      )}
                      <Database className="w-4 h-4" />
                      {db}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => setClearConfirm(db)}
                        className="btn btn-secondary text-sm py-1 px-3"
                        title="Clear all data"
                      >
                        Clear
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(db)}
                        className="btn btn-danger text-sm py-1 px-3"
                        title="Drop database"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
                {expandedDb === db && (
                  <tr key={`${db}-tables`}>
                    <td colSpan={2} className="px-4 py-3 bg-[var(--background)]">
                      {tablesLoading ? (
                        <div className="text-center py-4 text-[var(--muted)]">Loading tables...</div>
                      ) : tables.length === 0 ? (
                        <div className="text-center py-4 text-[var(--muted)]">No tables found</div>
                      ) : (
                        <div className="pl-8">
                          <p className="text-sm text-[var(--muted)] mb-2">{tables.length} tables found</p>
                          <div className="space-y-1">
                            {tables.map((table) => (
                              <div
                                key={table}
                                className="flex items-center justify-between py-2 px-3 rounded hover:bg-[var(--card)] transition-colors"
                              >
                                <span className="flex items-center gap-2 font-mono text-sm">
                                  <Table className="w-3 h-3 text-[var(--muted)]" />
                                  {table}
                                </span>
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => setBrowseData({ database: db, table })}
                                    className="btn btn-primary text-xs py-1 px-2 flex items-center gap-1"
                                    title="Browse and edit table data"
                                  >
                                    <Database className="w-3 h-3" />
                                    Browse
                                  </button>
                                  <button
                                    onClick={() => handlePreviewTable(db, table)}
                                    className="btn btn-secondary text-xs py-1 px-2 flex items-center gap-1"
                                    title="Preview first 3 rows"
                                  >
                                    <Eye className="w-3 h-3" />
                                    Preview
                                  </button>
                                  <button
                                    onClick={() => setTruncateConfirm({ database: db, table })}
                                    className="btn btn-danger text-xs py-1 px-2 flex items-center gap-1"
                                    title="Clear table data"
                                  >
                                    <Eraser className="w-3 h-3" />
                                    Clear
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {showCreateModal && (
        <CreateDatabaseModal
          onClose={() => setShowCreateModal(false)}
          onCreate={handleCreate}
          loading={actionLoading}
        />
      )}

      {deleteConfirm && (
        <ConfirmModal
          title="Drop Database"
          message={`Are you sure you want to drop "${deleteConfirm}"? This cannot be undone.`}
          confirmText={deleteConfirm}
          onConfirm={() => handleDrop(deleteConfirm)}
          onCancel={() => setDeleteConfirm(null)}
          loading={actionLoading}
          danger
        />
      )}

      {clearConfirm && (
        <ConfirmModal
          title="Clear Database"
          message={`Are you sure you want to clear all data in "${clearConfirm}"?`}
          confirmText={clearConfirm}
          onConfirm={() => handleClear(clearConfirm)}
          onCancel={() => setClearConfirm(null)}
          loading={actionLoading}
          danger
        />
      )}

      {truncateConfirm && (
        <ConfirmModal
          title="Clear Table"
          message={`Are you sure you want to clear all data in table "${truncateConfirm.table}"?`}
          confirmText={truncateConfirm.table}
          onConfirm={() => handleTruncateTable(truncateConfirm.database, truncateConfirm.table)}
          onCancel={() => setTruncateConfirm(null)}
          loading={actionLoading}
          danger
        />
      )}

      {tablePreview && (
        <TablePreviewModal
          table={tablePreview.table}
          data={tablePreview.data}
          onClose={() => setTablePreview(null)}
        />
      )}

      {browseData && (
        <TableDataBrowserModal
          database={browseData.database}
          table={browseData.table}
          onClose={() => setBrowseData(null)}
        />
      )}
    </div>
  );
}

function CreateDatabaseModal({
  onClose,
  onCreate,
  loading,
}: {
  onClose: () => void;
  onCreate: (name: string) => void;
  loading: boolean;
}) {
  const [name, setName] = useState('');

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="card w-full max-w-md mx-4">
        <div className="p-6 border-b border-[var(--border)]">
          <h2 className="text-xl font-bold">Create Database</h2>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onCreate(name);
          }}
          className="p-6 space-y-4"
        >
          <div>
            <label className="label">Database Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input w-full font-mono"
              pattern="^[a-zA-Z0-9_]+$"
              required
            />
            <p className="text-xs text-[var(--muted)] mt-1">
              Alphanumeric characters and underscores only
            </p>
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <button type="button" onClick={onClose} className="btn btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={loading} className="btn btn-primary">
              {loading ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ConfirmModal({
  title,
  message,
  confirmText,
  onConfirm,
  onCancel,
  loading,
  danger,
}: {
  title: string;
  message: string;
  confirmText: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
  danger?: boolean;
}) {
  const [input, setInput] = useState('');

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="card w-full max-w-md mx-4">
        <div className="p-6 border-b border-[var(--border)]">
          <h2 className="text-xl font-bold flex items-center gap-2">
            {danger && <AlertTriangle className="w-5 h-5 text-[var(--danger)]" />}
            {title}
          </h2>
        </div>
        <div className="p-6 space-y-4">
          <p>{message}</p>
          <div>
            <label className="label">Type &quot;{confirmText}&quot; to confirm</label>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="input w-full font-mono"
            />
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <button onClick={onCancel} className="btn btn-secondary">
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={loading || input !== confirmText}
              className={danger ? 'btn btn-danger' : 'btn btn-primary'}
            >
              {loading ? 'Processing...' : 'Confirm'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function TablePreviewModal({
  table,
  data,
  onClose,
}: {
  table: string;
  data: QueryResult;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="card w-full max-w-4xl mx-4 max-h-[80vh] overflow-hidden flex flex-col">
        <div className="p-4 border-b border-[var(--border)] flex justify-between items-center">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Table className="w-5 h-5" />
            Preview: {table}
          </h2>
          <button onClick={onClose} className="btn btn-secondary p-2">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4 overflow-auto flex-1">
          {data.rows.length === 0 ? (
            <div className="text-center py-8 text-[var(--muted)]">
              <p>No data in this table</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    {data.fields.map((field) => (
                      <th key={field} className="px-3 py-2 text-left font-medium text-[var(--muted)]">
                        {field}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row, idx) => (
                    <tr key={idx} className="border-b border-[var(--border)] hover:bg-[var(--background)]">
                      {data.fields.map((field) => (
                        <td key={field} className="px-3 py-2 font-mono text-xs">
                          {row[field] === null ? (
                            <span className="text-[var(--muted)] italic">NULL</span>
                          ) : typeof row[field] === 'object' ? (
                            JSON.stringify(row[field])
                          ) : (
                            String(row[field])
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-4 text-xs text-[var(--muted)]">
            Showing {data.rows.length} row(s) • Query took {data.executionTimeMs}ms
          </div>
        </div>
      </div>
    </div>
  );
}

function TableDataBrowserModal({
  database,
  table,
  onClose,
}: {
  database: string;
  table: string;
  onClose: () => void;
}) {
  const { activeProject, authHeaders } = useApp();
  const [data, setData] = useState<QueryResult | null>(null);
  const [columns, setColumns] = useState<ColumnInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [pageSize] = useState(50);
  const [editingRow, setEditingRow] = useState<number | null>(null);
  const [editedData, setEditedData] = useState<Record<string, unknown>>({});
  const [deleteConfirm, setDeleteConfirm] = useState<Record<string, unknown> | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchColumns = useCallback(async () => {
    if (!activeProject) return;

    try {
      const res = await fetch(
        `/api/projects/${activeProject.id}/db/tables/${encodeURIComponent(table)}/columns?database=${encodeURIComponent(database)}`,
        { headers: authHeaders() }
      );

      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Failed to fetch columns');
      }

      const d = await res.json();
      setColumns(d.columns);
    } catch (err) {
      console.error('Error fetching columns:', err);
    }
  }, [activeProject, authHeaders, database, table]);

  const fetchData = useCallback(async () => {
    if (!activeProject) return;
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        database,
        limit: String(pageSize),
        offset: String(page * pageSize),
      });
      if (search) params.set('search', search);

      const res = await fetch(
        `/api/projects/${activeProject.id}/db/tables/${encodeURIComponent(table)}/data?${params}`,
        { headers: authHeaders() }
      );

      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Failed to fetch data');
      }

      const d = await res.json();
      setData(d.result);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [activeProject, authHeaders, database, table, page, pageSize, search]);

  useEffect(() => {
    fetchColumns();
  }, [fetchColumns]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const primaryKeyColumns = columns.filter(c => c.isPrimary);

  const getPrimaryKey = (row: Record<string, unknown>): Record<string, unknown> => {
    const pk: Record<string, unknown> = {};
    if (primaryKeyColumns.length > 0) {
      for (const col of primaryKeyColumns) {
        pk[col.name] = row[col.name];
      }
    } else {
      // Fall back to all columns if no primary key
      for (const key of Object.keys(row)) {
        pk[key] = row[key];
      }
    }
    return pk;
  };

  const handleEdit = (idx: number, row: Record<string, unknown>) => {
    setEditingRow(idx);
    setEditedData({ ...row });
  };

  const handleCancelEdit = () => {
    setEditingRow(null);
    setEditedData({});
  };

  const handleSaveEdit = async () => {
    if (!activeProject || editingRow === null || !data) return;

    const originalRow = data.rows[editingRow];
    const primaryKey = getPrimaryKey(originalRow);

    // Only include changed fields
    const changedData: Record<string, unknown> = {};
    for (const key of Object.keys(editedData)) {
      if (editedData[key] !== originalRow[key]) {
        changedData[key] = editedData[key];
      }
    }

    if (Object.keys(changedData).length === 0) {
      handleCancelEdit();
      return;
    }

    setActionLoading(true);

    try {
      const res = await fetch(
        `/api/projects/${activeProject.id}/db/tables/${encodeURIComponent(table)}/data`,
        {
          method: 'PUT',
          headers: {
            ...authHeaders(),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            database,
            primaryKey,
            data: changedData,
          }),
        }
      );

      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Failed to update row');
      }

      // Refresh data
      await fetchData();
      handleCancelEdit();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async (row: Record<string, unknown>) => {
    if (!activeProject) return;

    const primaryKey = getPrimaryKey(row);
    setActionLoading(true);

    try {
      const res = await fetch(
        `/api/projects/${activeProject.id}/db/tables/${encodeURIComponent(table)}/data`,
        {
          method: 'DELETE',
          headers: {
            ...authHeaders(),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            database,
            primaryKey,
          }),
        }
      );

      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Failed to delete row');
      }

      // Refresh data
      await fetchData();
      setDeleteConfirm(null);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setActionLoading(false);
    }
  };

  const totalPages = data?.totalCount ? Math.ceil(data.totalCount / pageSize) : 1;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="card w-full max-w-6xl mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-[var(--border)] flex justify-between items-center flex-shrink-0">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Database className="w-5 h-5" />
              {table}
            </h2>
            <p className="text-sm text-[var(--muted)]">Database: {database}</p>
          </div>
          <button onClick={onClose} className="btn btn-secondary p-2">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search Bar */}
        <div className="p-4 border-b border-[var(--border)] flex-shrink-0">
          <div className="flex gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted)]" />
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(0);
                }}
                placeholder="Search text columns..."
                className="input w-full pl-9"
              />
            </div>
            <button
              onClick={fetchData}
              className="btn btn-secondary flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          {loading && !data ? (
            <div className="text-center py-8 text-[var(--muted)]">Loading data...</div>
          ) : error ? (
            <div className="text-center py-8">
              <p className="text-[var(--danger)] mb-4">{error}</p>
              <button onClick={fetchData} className="btn btn-secondary">
                Try Again
              </button>
            </div>
          ) : data?.rows.length === 0 ? (
            <div className="text-center py-8 text-[var(--muted)]">
              <p>No data found</p>
              {search && <p className="text-sm mt-1">Try a different search term</p>}
            </div>
          ) : data ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    <th className="px-3 py-2 text-left font-medium text-[var(--muted)] sticky left-0 bg-[var(--card)]">
                      Actions
                    </th>
                    {data.fields.map((field) => (
                      <th key={field} className="px-3 py-2 text-left font-medium text-[var(--muted)]">
                        <span className="flex items-center gap-1">
                          {field}
                          {primaryKeyColumns.some(c => c.name === field) && (
                            <span title="Primary Key">
                              <Key className="w-3 h-3 text-[var(--primary)]" />
                            </span>
                          )}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row, idx) => (
                    <tr key={idx} className="border-b border-[var(--border)] hover:bg-[var(--background)]">
                      <td className="px-3 py-2 sticky left-0 bg-[var(--card)]">
                        {editingRow === idx ? (
                          <div className="flex gap-1">
                            <button
                              onClick={handleSaveEdit}
                              disabled={actionLoading}
                              className="btn btn-primary text-xs p-1"
                              title="Save changes"
                            >
                              <Save className="w-3 h-3" />
                            </button>
                            <button
                              onClick={handleCancelEdit}
                              disabled={actionLoading}
                              className="btn btn-secondary text-xs p-1"
                              title="Cancel"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex gap-1">
                            <button
                              onClick={() => handleEdit(idx, row)}
                              className="btn btn-secondary text-xs p-1"
                              title="Edit row"
                            >
                              <Edit className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => setDeleteConfirm(row)}
                              className="btn btn-danger text-xs p-1"
                              title="Delete row"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </td>
                      {data.fields.map((field) => (
                        <td key={field} className="px-3 py-2 font-mono text-xs">
                          {editingRow === idx ? (
                            <input
                              type="text"
                              value={editedData[field] === null ? '' : String(editedData[field] ?? '')}
                              onChange={(e) => setEditedData({ ...editedData, [field]: e.target.value || null })}
                              className="input text-xs py-1 px-2 w-full min-w-[100px]"
                              placeholder={row[field] === null ? 'NULL' : ''}
                            />
                          ) : row[field] === null ? (
                            <span className="text-[var(--muted)] italic">NULL</span>
                          ) : typeof row[field] === 'object' ? (
                            JSON.stringify(row[field])
                          ) : (
                            String(row[field])
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>

        {/* Footer with pagination */}
        <div className="p-4 border-t border-[var(--border)] flex justify-between items-center flex-shrink-0">
          <div className="text-sm text-[var(--muted)]">
            {data && (
              <>
                Showing {page * pageSize + 1} - {Math.min((page + 1) * pageSize, data.totalCount || data.rowCount)} of {data.totalCount || data.rowCount} rows
                {data.executionTimeMs && ` • ${data.executionTimeMs}ms`}
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0 || loading}
              className="btn btn-secondary p-2"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm">
              Page {page + 1} of {totalPages}
            </span>
            <button
              onClick={() => setPage(p => p + 1)}
              disabled={page >= totalPages - 1 || loading}
              className="btn btn-secondary p-2"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-60">
          <div className="card w-full max-w-md mx-4">
            <div className="p-6 border-b border-[var(--border)]">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-[var(--danger)]" />
                Delete Row
              </h2>
            </div>
            <div className="p-6 space-y-4">
              <p>Are you sure you want to delete this row? This cannot be undone.</p>
              <div className="text-xs font-mono bg-[var(--background)] p-3 rounded overflow-auto max-h-40">
                {Object.entries(deleteConfirm).map(([key, val]) => (
                  <div key={key}>
                    <span className="text-[var(--muted)]">{key}:</span>{' '}
                    {val === null ? <span className="italic">NULL</span> : String(val)}
                  </div>
                ))}
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button
                  onClick={() => setDeleteConfirm(null)}
                  disabled={actionLoading}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDelete(deleteConfirm)}
                  disabled={actionLoading}
                  className="btn btn-danger"
                >
                  {actionLoading ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function UsersTab() {
  const { activeProject, authHeaders } = useApp();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showGrantModal, setShowGrantModal] = useState(false);
  const [createdUser, setCreatedUser] = useState<{ username: string; password: string } | null>(null);
  const [databases, setDatabases] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchDatabases = useCallback(async () => {
    if (!activeProject) return;
    try {
      const res = await fetch(`/api/projects/${activeProject.id}/db/databases`, {
        headers: authHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setDatabases(data.databases);
      }
    } catch {
      // Ignore
    }
  }, [activeProject, authHeaders]);

  useEffect(() => {
    fetchDatabases();
  }, [fetchDatabases]);

  const handleCreateUser = async (username: string, password?: string) => {
    if (!activeProject) return;
    setLoading(true);

    try {
      const res = await fetch(`/api/projects/${activeProject.id}/db/users`, {
        method: 'POST',
        headers: {
          ...authHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create user');
      }

      const data = await res.json();
      setCreatedUser({ username: data.username, password: data.password });
      setShowCreateModal(false);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Create User Card */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Users className="w-5 h-5" />
            Create User
          </h2>
          <p className="text-[var(--muted)] mb-4">
            Create a new database user with auto-generated or custom password.
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn btn-primary flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Create User
          </button>
        </div>

        {/* Grant Rights Card */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Shield className="w-5 h-5" />
            Grant App Rights
          </h2>
          <p className="text-[var(--muted)] mb-4">
            Grant standard application rights (SELECT, INSERT, UPDATE, DELETE) to a user on a database.
          </p>
          <button
            onClick={() => setShowGrantModal(true)}
            className="btn btn-primary flex items-center gap-2"
          >
            <Key className="w-4 h-4" />
            Grant Rights
          </button>
        </div>
      </div>

      {showCreateModal && (
        <CreateUserModal
          projectSlug={activeProject?.slug || ''}
          onClose={() => setShowCreateModal(false)}
          onCreate={handleCreateUser}
          loading={loading}
        />
      )}

      {showGrantModal && (
        <GrantRightsModal
          databases={databases}
          onClose={() => setShowGrantModal(false)}
        />
      )}

      {createdUser && (
        <PasswordDisplayModal
          username={createdUser.username}
          password={createdUser.password}
          onClose={() => setCreatedUser(null)}
        />
      )}
    </div>
  );
}

function CreateUserModal({
  projectSlug,
  onClose,
  onCreate,
  loading,
}: {
  projectSlug: string;
  onClose: () => void;
  onCreate: (username: string, password?: string) => void;
  loading: boolean;
}) {
  const [username, setUsername] = useState(`${projectSlug}_app`);
  const [password, setPassword] = useState('');
  const [autoGenerate, setAutoGenerate] = useState(true);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="card w-full max-w-md mx-4">
        <div className="p-6 border-b border-[var(--border)]">
          <h2 className="text-xl font-bold">Create User</h2>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onCreate(username, autoGenerate ? undefined : password);
          }}
          className="p-6 space-y-4"
        >
          <div>
            <label className="label">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="input w-full font-mono"
              pattern="^[a-zA-Z0-9_]+$"
              required
            />
          </div>
          <div>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={autoGenerate}
                onChange={(e) => setAutoGenerate(e.target.checked)}
              />
              Auto-generate password
            </label>
          </div>
          {!autoGenerate && (
            <div>
              <label className="label">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input w-full"
                minLength={8}
                required={!autoGenerate}
              />
            </div>
          )}
          <div className="flex justify-end gap-3 pt-4">
            <button type="button" onClick={onClose} className="btn btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={loading} className="btn btn-primary">
              {loading ? 'Creating...' : 'Create User'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PasswordDisplayModal({
  username,
  password,
  onClose,
}: {
  username: string;
  password: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(password);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="card w-full max-w-md mx-4">
        <div className="p-6 border-b border-[var(--border)]">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Check className="w-5 h-5 text-[var(--success)]" />
            User Created
          </h2>
        </div>
        <div className="p-6 space-y-4">
          <p>
            User <span className="font-mono font-medium">{username}</span> was created successfully.
          </p>
          <div>
            <label className="label">Password (save this now!)</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={password}
                readOnly
                className="input flex-1 font-mono"
              />
              <button
                onClick={copyToClipboard}
                className="btn btn-secondary flex items-center gap-2"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <p className="text-xs text-[var(--warning)] mt-2">
              This password will not be shown again. Make sure to save it!
            </p>
          </div>
          <div className="flex justify-end pt-4">
            <button onClick={onClose} className="btn btn-primary">
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function GrantRightsModal({
  databases,
  onClose,
}: {
  databases: string[];
  onClose: () => void;
}) {
  const { activeProject, authHeaders } = useApp();
  const [database, setDatabase] = useState(databases[0] || '');
  const [username, setUsername] = useState('');
  const [previewSql, setPreviewSql] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePreview = async () => {
    if (!activeProject || !database || !username) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/projects/${activeProject.id}/db/grants/app-rights`, {
        method: 'POST',
        headers: {
          ...authHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ database, username, preview: true }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to preview grants');
      }

      const data = await res.json();
      setPreviewSql(data.sql);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleGrant = async () => {
    if (!activeProject || !database || !username) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/projects/${activeProject.id}/db/grants/app-rights`, {
        method: 'POST',
        headers: {
          ...authHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ database, username }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to grant rights');
      }

      setSuccess(true);
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
          <h2 className="text-xl font-bold">Grant App Rights</h2>
        </div>
        <div className="p-6 space-y-4">
          {success ? (
            <div>
              <div className="flex items-center gap-2 text-[var(--success)] mb-4">
                <Check className="w-5 h-5" />
                Rights granted successfully!
              </div>
              <button onClick={onClose} className="btn btn-primary">
                Done
              </button>
            </div>
          ) : (
            <>
              <div>
                <label className="label">Database</label>
                <select
                  value={database}
                  onChange={(e) => setDatabase(e.target.value)}
                  className="input w-full"
                >
                  {databases.map((db) => (
                    <option key={db} value={db}>
                      {db}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Username</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="input w-full font-mono"
                  required
                />
              </div>

              {previewSql.length > 0 && (
                <div>
                  <label className="label">SQL Preview</label>
                  <div className="bg-[var(--background)] p-3 rounded font-mono text-sm space-y-1 max-h-48 overflow-auto">
                    {previewSql.map((sql, i) => (
                      <div key={i}>{sql}</div>
                    ))}
                  </div>
                </div>
              )}

              {error && (
                <div className="text-[var(--danger)] text-sm">{error}</div>
              )}

              <div className="flex justify-end gap-3 pt-4">
                <button onClick={onClose} className="btn btn-secondary">
                  Cancel
                </button>
                <button
                  onClick={handlePreview}
                  disabled={loading || !database || !username}
                  className="btn btn-secondary"
                >
                  Preview SQL
                </button>
                <button
                  onClick={handleGrant}
                  disabled={loading || !database || !username}
                  className="btn btn-primary"
                >
                  {loading ? 'Granting...' : 'Grant Rights'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ConsoleTab() {
  const { activeProject, authHeaders } = useApp();
  const [sql, setSql] = useState('');
  const [database, setDatabase] = useState('');
  const [mode, setMode] = useState<'readonly' | 'danger'>('readonly');
  const [dangerConfirmed, setDangerConfirmed] = useState(false);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [databases, setDatabases] = useState<string[]>([]);

  const fetchDatabases = useCallback(async () => {
    if (!activeProject) return;
    try {
      const res = await fetch(`/api/projects/${activeProject.id}/db/databases`, {
        headers: authHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setDatabases(data.databases);
        if (data.databases.length > 0 && !database) {
          setDatabase(data.databases[0]);
        }
      }
    } catch {
      // Ignore
    }
  }, [activeProject, authHeaders, database]);

  useEffect(() => {
    fetchDatabases();
  }, [fetchDatabases]);

  const handleExecute = async () => {
    if (!activeProject || !sql.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch(`/api/projects/${activeProject.id}/db/query`, {
        method: 'POST',
        headers: {
          ...authHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sql: sql.trim(),
          database: database || undefined,
          mode,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Query failed');
      }

      const data = await res.json();
      setResult(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-4 items-end">
        <div className="flex-1">
          <label className="label">Database</label>
          <select
            value={database}
            onChange={(e) => setDatabase(e.target.value)}
            className="input w-full"
          >
            <option value="">Use connection default</option>
            {databases.map((db) => (
              <option key={db} value={db}>
                {db}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Mode</label>
          <div className="flex gap-2">
            <button
              onClick={() => {
                setMode('readonly');
                setDangerConfirmed(false);
              }}
              className={`btn ${mode === 'readonly' ? 'btn-primary' : 'btn-secondary'}`}
            >
              Read-Only
            </button>
            <button
              onClick={() => setMode('danger')}
              className={`btn ${mode === 'danger' ? 'btn-danger' : 'btn-secondary'}`}
            >
              <AlertTriangle className="w-4 h-4 mr-1" />
              Danger Mode
            </button>
          </div>
        </div>
      </div>

      {mode === 'danger' && !dangerConfirmed && (
        <DangerConfirmation onConfirm={() => setDangerConfirmed(true)} />
      )}

      <div>
        <label className="label">SQL Query</label>
        <textarea
          value={sql}
          onChange={(e) => setSql(e.target.value)}
          className="input w-full h-40 font-mono text-sm"
          placeholder="SELECT * FROM users LIMIT 10;"
        />
      </div>

      <div className="flex justify-between items-center">
        <p className="text-sm text-[var(--muted)]">
          {mode === 'readonly' 
            ? 'Allowed: SELECT, SHOW, DESCRIBE, EXPLAIN, WITH'
            : 'Danger mode: All statements allowed (with audit logging)'
          }
        </p>
        <button
          onClick={handleExecute}
          disabled={loading || !sql.trim() || (mode === 'danger' && !dangerConfirmed)}
          className="btn btn-primary flex items-center gap-2"
        >
          <Play className="w-4 h-4" />
          {loading ? 'Executing...' : 'Execute'}
        </button>
      </div>

      {error && (
        <div className="p-4 rounded bg-[var(--danger)]/10 text-[var(--danger)]">
          {error}
        </div>
      )}

      {result && (
        <div className="card overflow-hidden">
          <div className="p-4 border-b border-[var(--border)] flex justify-between items-center">
            <span>
              {result.rowCount} rows {result.truncated && '(truncated)'} in {result.executionTimeMs}ms
            </span>
          </div>
          {result.rows.length > 0 ? (
            <div className="overflow-auto max-h-96">
              <table className="w-full text-sm">
                <thead className="bg-[var(--background)] sticky top-0">
                  <tr>
                    {result.fields.map((field) => (
                      <th key={field} className="px-3 py-2 text-left font-medium">
                        {field}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {result.rows.map((row, i) => (
                    <tr key={i} className="hover:bg-[var(--background)]">
                      {result.fields.map((field) => (
                        <td key={field} className="px-3 py-2 font-mono">
                          {String(row[field] ?? 'NULL')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-4 text-[var(--muted)]">Query executed successfully. No rows returned.</div>
          )}
        </div>
      )}
    </div>
  );
}

function DangerConfirmation({ onConfirm }: { onConfirm: () => void }) {
  const [input, setInput] = useState('');

  return (
    <div className="p-4 rounded bg-[var(--danger)]/10 border border-[var(--danger)]">
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-[var(--danger)] flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="font-medium text-[var(--danger)]">Danger Mode Warning</p>
          <p className="text-sm mt-1">
            Danger mode allows executing write operations (INSERT, UPDATE, DELETE, DROP, etc.).
            All queries are logged for audit purposes.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="input text-sm"
              placeholder='Type "DANGER" to confirm'
            />
            <button
              onClick={onConfirm}
              disabled={input !== 'DANGER'}
              className="btn btn-danger text-sm"
            >
              Enable Danger Mode
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
