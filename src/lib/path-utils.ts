import * as path from 'path';
import * as fs from 'fs';

const WORKSPACES_ROOT = '/data/workspaces';

/**
 * Validate that a path doesn't contain traversal attempts.
 */
export function isValidPath(inputPath: string): boolean {
  // Check for obvious traversal patterns
  if (inputPath.includes('..')) return false;
  if (inputPath.startsWith('/')) return false;
  if (inputPath.includes('\0')) return false;
  
  // Normalize and check
  const normalized = path.normalize(inputPath);
  if (normalized.includes('..')) return false;
  if (normalized.startsWith('/')) return false;
  
  return true;
}

/**
 * Validate and resolve a working directory within a repository.
 * Returns the absolute path if valid, throws if invalid.
 */
export function resolveWorkingDirectory(
  repoRoot: string,
  workingDirectory: string | null | undefined
): string {
  if (!workingDirectory) {
    return repoRoot;
  }
  
  if (!isValidPath(workingDirectory)) {
    throw new Error(`Invalid working directory: path traversal detected`);
  }
  
  const resolved = path.resolve(repoRoot, workingDirectory);
  
  // Ensure the resolved path is within the repo root
  if (!resolved.startsWith(repoRoot)) {
    throw new Error(`Invalid working directory: path escapes repository root`);
  }
  
  // Check if directory exists
  if (!fs.existsSync(resolved)) {
    throw new Error(`Working directory does not exist: ${workingDirectory}`);
  }
  
  if (!fs.statSync(resolved).isDirectory()) {
    throw new Error(`Working directory is not a directory: ${workingDirectory}`);
  }
  
  return resolved;
}

/**
 * Get the workspace path for a project's repository.
 */
export function getWorkspacePath(projectSlug: string, repoPath: string, branch: string): string {
  // Validate inputs
  if (!isValidPath(projectSlug)) {
    throw new Error('Invalid project slug');
  }
  if (!isValidPath(repoPath)) {
    throw new Error('Invalid repo path');
  }
  if (!isValidPath(branch)) {
    throw new Error('Invalid branch name');
  }
  
  return path.join(WORKSPACES_ROOT, projectSlug, repoPath, branch);
}

/**
 * Ensure the workspaces root directory exists.
 */
export function ensureWorkspacesRoot(): void {
  if (!fs.existsSync(WORKSPACES_ROOT)) {
    fs.mkdirSync(WORKSPACES_ROOT, { recursive: true });
  }
}

/**
 * Validate GitLab repo path format.
 * Should be in format: org/repo or org/subgroup/repo
 */
export function isValidRepoPath(repoPath: string): boolean {
  // Must have at least org/repo format
  const parts = repoPath.split('/');
  if (parts.length < 2) return false;
  
  // Each part must be valid
  for (const part of parts) {
    if (!part) return false;
    if (!/^[a-zA-Z0-9_.-]+$/.test(part)) return false;
  }
  
  return true;
}

/**
 * Validate branch name.
 */
export function isValidBranchName(branch: string): boolean {
  // Git branch naming rules (simplified)
  if (!branch) return false;
  if (branch.includes('..')) return false;
  if (branch.startsWith('/') || branch.endsWith('/')) return false;
  if (branch.includes('\\')) return false;
  if (/[\x00-\x1f\x7f~^:?*\[]/.test(branch)) return false;
  return true;
}

/**
 * Validate slug format.
 */
export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/.test(slug);
}

/**
 * Generate a slug from a name.
 */
export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 50);
}
