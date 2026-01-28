'use client';

import { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';

interface SessionStatus {
  active: boolean;
  expiresAt: string | null;
  dbKind?: string;
  dbHost?: string;
  dbPort?: number;
}

interface Project {
  id: string;
  name: string;
  slug: string;
  lastDbKind?: string;
  lastDbHost?: string;
  lastDbPort?: number;
  gitlabRepoPath?: string;
  defaultBranch?: string;
  workingDirectory?: string;
  pnpmFilter?: string;
}

interface AppContextType {
  activeProject: Project | null;
  setActiveProject: (project: Project | null) => void;
  sessionStatus: SessionStatus | null;
  refreshSession: () => Promise<void>;
  authHeaders: () => HeadersInit;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [sessionStatus, setSessionStatus] = useState<SessionStatus | null>(null);
  const [credentials, setCredentials] = useState<{ username: string; password: string } | null>(null);

  // Load credentials from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem('dbhelper_credentials');
    if (stored) {
      try {
        setCredentials(JSON.parse(stored));
      } catch {
        // Invalid stored credentials
      }
    }
  }, []);

  const authHeaders = useCallback((): HeadersInit => {
    if (!credentials) {
      return {};
    }
    const base64 = btoa(`${credentials.username}:${credentials.password}`);
    return {
      Authorization: `Basic ${base64}`,
    };
  }, [credentials]);

  const refreshSession = useCallback(async () => {
    if (!activeProject) {
      setSessionStatus(null);
      return;
    }

    try {
      const res = await fetch(`/api/projects/${activeProject.id}/session/status`, {
        headers: authHeaders(),
      });

      if (res.ok) {
        const data = await res.json();
        setSessionStatus(data);
      } else {
        setSessionStatus({ active: false, expiresAt: null });
      }
    } catch {
      setSessionStatus({ active: false, expiresAt: null });
    }
  }, [activeProject, authHeaders]);

  // Refresh session status when active project changes
  useEffect(() => {
    refreshSession();
  }, [refreshSession]);

  // Refresh session status periodically
  useEffect(() => {
    if (!activeProject) return;

    const interval = setInterval(refreshSession, 30000);
    return () => clearInterval(interval);
  }, [activeProject, refreshSession]);

  return (
    <AppContext.Provider
      value={{
        activeProject,
        setActiveProject,
        sessionStatus,
        refreshSession,
        authHeaders,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}

// Store credentials
export function setStoredCredentials(username: string, password: string) {
  localStorage.setItem('dbhelper_credentials', JSON.stringify({ username, password }));
}

// Clear credentials
export function clearStoredCredentials() {
  localStorage.removeItem('dbhelper_credentials');
}
