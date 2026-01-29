import * as path from 'path';
import * as fs from 'fs';

const WORKSPACES_ROOT = process.env.WORKSPACES_ROOT || '/data/workspaces';

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
    try {
      fs.mkdirSync(WORKSPACES_ROOT, { recursive: true, mode: 0o755 });
    } catch (err) {
      // If permission denied, try to create with less restrictive permissions
      if ((err as NodeJS.ErrnoException).code === 'EACCES') {
        console.error(`Failed to create ${WORKSPACES_ROOT}. Please ensure the directory is writable.`);
        throw new Error(`Cannot create workspace directory at ${WORKSPACES_ROOT}: permission denied`);
      }
      throw err;
    }
  } else {
    // Directory exists, ensure it's writable
    try {
      // Test if we can write to the directory
      const testFile = path.join(WORKSPACES_ROOT, '.write-test-' + Date.now());
      fs.writeFileSync(testFile, '');
      fs.unlinkSync(testFile);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'EACCES') {
        console.error(`${WORKSPACES_ROOT} is not writable`);
        throw new Error(`Workspace directory is not writable: ${WORKSPACES_ROOT}`);
      }
      throw err;
    }
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
  return /^[a-z0-9][a-z0-9\-]*[a-z0-9]$|^[a-z0-9]$/.test(slug);
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

/**
 * Find Prisma schema file in a workspace.
 * Searches common locations for schema.prisma files.
 * Returns the directory containing the schema, or null if not found.
 */
export function findPrismaSchemaDir(workspacePath: string, maxDepth = 5): string | null {
  const searchPaths = [
    // Common locations first
    'prisma',
    'db/prisma',
    'database/prisma',
    'src/prisma',
    'packages/db/prisma',
    'packages/database/prisma',
  ];

  // Check common locations first
  for (const searchPath of searchPaths) {
    const schemaPath = path.join(workspacePath, searchPath, 'schema.prisma');
    if (fs.existsSync(schemaPath)) {
      return path.join(workspacePath, searchPath);
    }
  }

  // Fallback: recursively search for schema.prisma
  function searchDir(dir: string, depth: number): string | null {
    if (depth > maxDepth) return null;

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      
      // First check if schema.prisma exists in this directory
      const hasSchema = entries.some(e => e.isFile() && e.name === 'schema.prisma');
      if (hasSchema) {
        return dir;
      }

      // Then recurse into subdirectories (skip node_modules, .git, etc.)
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const dirName = entry.name;
          if (dirName === 'node_modules' || dirName === '.git' || dirName === 'dist' || dirName === 'build' || dirName.startsWith('.')) {
            continue;
          }
          const found = searchDir(path.join(dir, dirName), depth + 1);
          if (found) return found;
        }
      }
    } catch {
      // Ignore permission errors, etc.
    }

    return null;
  }

  return searchDir(workspacePath, 0);
}

/**
 * Get the relative path of the Prisma schema directory from the workspace root.
 */
export function getPrismaSchemaRelativePath(workspacePath: string): string | null {
  const schemaDir = findPrismaSchemaDir(workspacePath);
  if (!schemaDir) return null;
  
  const relativePath = path.relative(workspacePath, schemaDir);
  // Return the parent directory (e.g., 'packages/db' instead of 'packages/db/prisma')
  const parentDir = path.dirname(relativePath);
  return parentDir === '.' ? '' : parentDir;
}
