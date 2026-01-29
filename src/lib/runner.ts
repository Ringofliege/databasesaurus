import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { prisma } from './prisma';
import { maskDbUrl } from './db-url';
import { getWorkspacePath, ensureWorkspacesRoot, resolveWorkingDirectory, isValidRepoPath, isValidBranchName, findPrismaSchemaDir } from './path-utils';

const MAX_LOG_LINES = 10000;

export interface RunOptions {
  projectId: string;
  kind: string;
  cwd?: string;
  env?: Record<string, string>;
}

export interface RunResult {
  runId: string;
  exitCode: number | null;
  success: boolean;
}

// Allowlisted commands
const ALLOWED_COMMANDS: Record<string, string[]> = {
  'git': ['clone', 'fetch', 'reset', 'checkout', 'status'],
  'pnpm': ['install', '--filter', 'prisma:migrate', 'prisma:generate', 'prisma:seed'],
  'npx': ['prisma', 'migrate', 'deploy', 'generate', 'db', 'seed'],
  'npm': ['install'],
};

/**
 * Validate that a command is allowed.
 */
function isCommandAllowed(command: string, args: string[]): boolean {
  const allowedArgs = ALLOWED_COMMANDS[command];
  if (!allowedArgs) return false;
  
  // For git and basic commands, check first arg
  if (args.length === 0) return false;
  
  // Check if any allowed arg is present in the command args
  return args.some(arg => allowedArgs.includes(arg));
}

/**
 * Set up SSH key for GitLab access.
 * 
 * Supports three formats:
 * 1. GIT_SSH_PRIVATE_KEY_B64: base64-encoded key (recommended for environment variables)
 * 2. GIT_SSH_PRIVATE_KEY: raw key with newlines preserved
 * 3. ~/.ssh/id_ed25519 or ~/.ssh/id_rsa: system SSH keys (used automatically if no env vars)
 */
function setupSshKey(): string | null {
  let sshKey = process.env.GIT_SSH_PRIVATE_KEY;
  let isBase64 = false;
  
  // If raw key not provided, try base64-encoded version
  if (!sshKey && process.env.GIT_SSH_PRIVATE_KEY_B64) {
    try {
      isBase64 = true;
      console.log(`[runner] Decoding base64-encoded SSH key from GIT_SSH_PRIVATE_KEY_B64`);
      const b64Key = process.env.GIT_SSH_PRIVATE_KEY_B64.trim();
      console.log(`[runner] Base64 key length: ${b64Key.length} chars`);
      sshKey = Buffer.from(b64Key, 'base64').toString('utf-8');
      console.log(`[runner] Decoded key length: ${sshKey.length} chars`);
    } catch (err) {
      console.error(`[runner] Failed to decode base64 SSH key:`, err);
      sshKey = null;
    }
  }
  
  if (!sshKey) {
    console.log(`[runner] No GIT_SSH_PRIVATE_KEY or GIT_SSH_PRIVATE_KEY_B64 environment variable set, will use system SSH keys`);
    return null;
  }
  
  try {
    // Trim and normalize the key
    let formattedKey = sshKey.trim();
    
    // Validate key format BEFORE any modifications
    if (!formattedKey.includes('BEGIN') || !formattedKey.includes('END')) {
      console.error(`[runner] SSH key does not appear to be in valid format (missing BEGIN/END markers)`);
      console.error(`[runner] Key starts with: ${formattedKey.substring(0, 50)}`);
      console.error(`[runner] Key ends with: ${formattedKey.substring(Math.max(0, formattedKey.length - 50))}`);
      return null;
    }
    
    // If it came from base64, it should already have proper line endings
    // Only fix escaped newlines if it came from raw env var
    if (!isBase64) {
      formattedKey = formattedKey.replace(/\\n/g, '\n');
    }
    
    // Ensure it ends with a newline
    if (!formattedKey.endsWith('\n')) {
      formattedKey += '\n';
    }
    
    const keyPath = path.join(os.tmpdir(), `ssh_key_${Date.now()}`);
    fs.writeFileSync(keyPath, formattedKey, { mode: 0o600 });
    
    // Verify file was created and is readable
    if (!fs.existsSync(keyPath)) {
      throw new Error(`Failed to create SSH key file at ${keyPath}`);
    }
    
    const stats = fs.statSync(keyPath);
    console.log(`[runner] SSH key created at: ${keyPath} (${stats.size} bytes, mode: ${stats.mode.toString(8)})`);
    
    // Verify the key content is valid
    const keyContent = fs.readFileSync(keyPath, 'utf-8');
    if (!keyContent.includes('BEGIN') || !keyContent.includes('END')) {
      console.error(`[runner] SSH key file verification failed - missing markers after write`);
      throw new Error(`SSH key file does not contain valid markers`);
    }
    
    // Log key type for debugging
    if (keyContent.includes('OPENSSH PRIVATE KEY')) {
      console.log(`[runner] SSH key type: OpenSSH format`);
    } else if (keyContent.includes('RSA PRIVATE KEY')) {
      console.log(`[runner] SSH key type: RSA format`);
    } else if (keyContent.includes('ED25519 PRIVATE KEY')) {
      console.log(`[runner] SSH key type: ED25519 format`);
    }
    
    return keyPath;
  } catch (err) {
    console.error(`[runner] Failed to set up SSH key:`, err);
    return null;
  }
}

/**
 * Set up SSH config to avoid known_hosts issues.
 */
function setupSshConfig(): string | null {
  try {
    const sshDir = path.join(os.homedir(), '.ssh');
    
    // Ensure .ssh directory exists
    if (!fs.existsSync(sshDir)) {
      fs.mkdirSync(sshDir, { mode: 0o700 });
    }
    
    // Create config file with strict host key checking disabled for gitlab
    const configPath = path.join(sshDir, 'config');
    const configContent = `Host gitlab.com
  StrictHostKeyChecking accept-new
  UserKnownHostsFile=/dev/null
  User git
`;
    
    // Append config if it doesn't exist, or update if needed
    if (!fs.existsSync(configPath)) {
      fs.writeFileSync(configPath, configContent, { mode: 0o600 });
      console.log(`[runner] SSH config created at: ${configPath}`);
    }
    
    return configPath;
  } catch (err) {
    console.error(`[runner] Failed to set up SSH config:`, err);
    return null;
  }
}

/**
 * Clean up SSH key file.
 */
function cleanupSshKey(keyPath: string | null): void {
  if (keyPath && fs.existsSync(keyPath)) {
    fs.unlinkSync(keyPath);
  }
}

/**
 * Run a command and stream output to the database.
 */
export class CommandRunner extends EventEmitter {
  private runId: string | null = null;
  private process: ChildProcess | null = null;
  private logBuffer: string[] = [];
  private flushInterval: ReturnType<typeof setInterval> | null = null;
  
  async run(
    command: string,
    args: string[],
    options: RunOptions
  ): Promise<RunResult> {
    // Validate command
    if (!isCommandAllowed(command, args)) {
      throw new Error(`Command not allowed: ${command} ${args.join(' ')}`);
    }
    
    // Create run record
    const run = await prisma.run.create({
      data: {
        projectId: options.projectId,
        kind: options.kind,
        status: 'running',
        startedAt: new Date(),
      },
    });
    this.runId = run.id;
    
    // Set up environment
    const env: Record<string, string> = {
      ...process.env as Record<string, string>,
      ...options.env,
    };
    
    // Set up SSH if needed
    let sshKeyPath: string | null = null;
    if (command === 'git' && (args.includes('clone') || args.includes('fetch'))) {
      // Only set up SSH if HTTPS token is not available
      if (!process.env.GITLAB_TOKEN) {
        // Set up SSH config first
        setupSshConfig();
        
        sshKeyPath = setupSshKey();
        if (sshKeyPath) {
          // Use SSH with minimal options for debugging
          // -v: verbose (goes to stderr)
          // -i: specify identity file  
          // -o BatchMode=yes: prevent interactive prompts
          // -o ConnectTimeout=10: timeout after 10s
          env.GIT_SSH_COMMAND = `ssh -v -i ${sshKeyPath} -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile=/dev/null -o BatchMode=yes -o ConnectTimeout=10`;
          env.GIT_TRACE = '1';
          console.log(`[runner] SSH setup: using provided key from GIT_SSH_PRIVATE_KEY_B64`);
        } else {
          // If no SSH key provided, try to use SSH agent and disable passphrase prompts
          env.SSH_ASKPASS = '/bin/echo';
          env.SSH_ASKPASS_REQUIRE = 'never';
          env.GIT_SSH_COMMAND = 'ssh -v -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile=/dev/null -o BatchMode=yes -o ConnectTimeout=10';
          env.GIT_TRACE = '1';
          console.log(`[runner] SSH setup: no SSH key provided, using system SSH keys`);
        }
      } else {
        // Using HTTPS token authentication - no SSH setup needed
        env.GIT_TRACE = '1';
        console.log(`[runner] Using HTTPS token authentication - SSH not needed`);
      }
    }
    
    return new Promise((resolve, reject) => {
      try {
        // Use ignore for stdin to prevent interactive prompts
        this.process = spawn(command, args, {
          cwd: options.cwd,
          env,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        
        // Set a timeout to prevent hanging (especially for git clone with SSH passphrase prompts)
        // Git operations should complete within 5 minutes
        const timeoutDuration = command === 'git' ? 300000 : 600000; // 5 min for git, 10 min for others
        const timeout = setTimeout(() => {
          if (this.process && !this.process.killed) {
            console.error(`[runner] Process timeout after ${timeoutDuration}ms. Killing process.`);
            this.addLogLine(`⚠️ Process timeout - killed after ${timeoutDuration}ms. This usually means the process was waiting for input (e.g., SSH passphrase). Make sure GIT_SSH_PRIVATE_KEY is set to a passphrase-less key.`);
            this.process.kill('SIGKILL');
          }
        }, timeoutDuration);
        
        // Clear timeout on process exit
        this.process.on('exit', () => clearTimeout(timeout));
        
        // Start log flushing
        this.startLogFlushing();
        
        // Handle stdout
        this.process.stdout?.on('data', (data: Buffer) => {
          const lines = data.toString().split('\n');
          for (const line of lines) {
            if (line) {
              this.addLogLine(this.maskSecrets(line, options.env));
            }
          }
        });
        
        // Handle stderr
        this.process.stderr?.on('data', (data: Buffer) => {
          const lines = data.toString().split('\n');
          for (const line of lines) {
            if (line) {
              this.addLogLine(this.maskSecrets(line, options.env));
            }
          }
        });
        
        // Handle completion
        this.process.on('close', async (code) => {
          // Clean up SSH key
          cleanupSshKey(sshKeyPath);
          
          // Flush remaining logs
          await this.flushLogs();
          this.stopLogFlushing();
          
          // Update run record
          const status = code === 0 ? 'success' : 'failed';
          await prisma.run.update({
            where: { id: this.runId! },
            data: {
              status,
              exitCode: code,
              finishedAt: new Date(),
            },
          });
          
          this.emit('complete', { runId: this.runId, exitCode: code, status });
          
          resolve({
            runId: this.runId!,
            exitCode: code,
            success: code === 0,
          });
        });
        
        this.process.on('error', async (error) => {
          cleanupSshKey(sshKeyPath);
          this.addLogLine(`Error: ${error.message}`);
          await this.flushLogs();
          this.stopLogFlushing();
          
          await prisma.run.update({
            where: { id: this.runId! },
            data: {
              status: 'failed',
              exitCode: -1,
              finishedAt: new Date(),
            },
          });
          
          reject(error);
        });
        
      } catch (error) {
        cleanupSshKey(sshKeyPath);
        reject(error);
      }
    });
  }
  
  private maskSecrets(line: string, env?: Record<string, string>): string {
    let masked = line;
    
    // Mask DATABASE_URL if present
    if (env?.DATABASE_URL) {
      masked = masked.replace(env.DATABASE_URL, maskDbUrl(env.DATABASE_URL));
    }
    
    // Mask any URL-like patterns with passwords
    masked = masked.replace(/:([^:@\/\s]{3,})@/g, ':****@');
    
    return masked;
  }
  
  private addLogLine(line: string): void {
    this.logBuffer.push(line);
    this.emit('log', line);
    
    // Keep buffer size in check
    if (this.logBuffer.length > MAX_LOG_LINES * 2) {
      this.logBuffer = this.logBuffer.slice(-MAX_LOG_LINES);
    }
  }
  
  private startLogFlushing(): void {
    this.flushInterval = setInterval(() => {
      this.flushLogs().catch(console.error);
    }, 1000);
  }
  
  private stopLogFlushing(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
  }
  
  private async flushLogs(): Promise<void> {
    if (this.logBuffer.length === 0 || !this.runId) return;
    
    const linesToFlush = this.logBuffer.splice(0, this.logBuffer.length);
    
    // Batch insert logs
    await prisma.runLog.createMany({
      data: linesToFlush.map(line => ({
        runId: this.runId!,
        line,
      })),
    });
  }
  
  async cancel(): Promise<void> {
    if (this.process) {
      this.process.kill('SIGTERM');
    }
  }
}

/**
 * Clone or refresh a GitLab repository.
 * 
 * SSH Key Setup Options (in priority order):
 * 
 * 1. RECOMMENDED: GIT_SSH_PRIVATE_KEY_B64 (base64-encoded, no newlines)
 *    - Best for environment variables and Docker
 *    - Avoid newline encoding issues
 *    - Generate with: cat ~/.ssh/gitlab_deploy_key | base64 -w0
 * 
 * 2. GIT_SSH_PRIVATE_KEY (raw key with newlines preserved)
 *    - May have issues with shell environment variables
 *    - Ensure newlines are preserved when setting
 * 
 * 3. Docker Volume Mount (best for containerized deployments)
 *    - Mount key at /home/nextjs/.ssh/id_ed25519 or /home/nextjs/.ssh/id_rsa
 *    - Will be used automatically if no environment variables set
 * 
 * The key MUST be passphrase-less (generated with -N "")
 * 
 * Example Docker setup:
 *   docker run -e GIT_SSH_PRIVATE_KEY_B64="$(cat ~/.ssh/gitlab_deploy_key | base64 -w0)" ...
 * 
 * Or with docker-compose:
 *   volumes:
 *     - ~/.ssh/gitlab_deploy_key:/home/nextjs/.ssh/id_ed25519:ro
 */
export async function cloneOrRefreshRepo(
  projectId: string,
  projectSlug: string,
  repoPath: string,
  branch: string,
  refresh = false
): Promise<{ workspacePath: string; runId: string }> {
  if (!isValidRepoPath(repoPath)) {
    throw new Error('Invalid repository path');
  }
  if (!isValidBranchName(branch)) {
    throw new Error('Invalid branch name');
  }
  
  console.log(`[cloneOrRefreshRepo] Ensuring workspaces root...`);
  ensureWorkspacesRoot();
  
  const workspacePath = getWorkspacePath(projectSlug, repoPath, branch);
  console.log(`[cloneOrRefreshRepo] Workspace path: ${workspacePath}`);
  
  // Determine authentication method
  let repoUrl: string;
  let authMethod: 'ssh' | 'https' = 'ssh';
  
  if (process.env.GITLAB_TOKEN) {
    // Use HTTPS with token (recommended for reliability)
    const token = process.env.GITLAB_TOKEN.trim();
    if (!token) {
      console.warn(`[cloneOrRefreshRepo] GITLAB_TOKEN is empty after trimming, will fall back to SSH`);
    } else {
      repoUrl = `https://oauth2:${token}@gitlab.com/${repoPath}.git`;
      authMethod = 'https';
      console.log(`[cloneOrRefreshRepo] Using HTTPS authentication with GitLab token (length: ${token.length})`);
    }
  } 
  
  if (authMethod === 'ssh' && process.env.GITLAB_USERNAME && process.env.GITLAB_TOKEN) {
    // Alternative HTTPS format with username (fallback if first GITLAB_TOKEN check didn't work)
    const username = process.env.GITLAB_USERNAME.trim();
    const token = process.env.GITLAB_TOKEN.trim();
    if (token) {
      repoUrl = `https://${username}:${token}@gitlab.com/${repoPath}.git`;
      authMethod = 'https';
      console.log(`[cloneOrRefreshRepo] Using HTTPS authentication with GitLab username and token`);
    }
  }
  
  if (authMethod === 'ssh') {
    // Use SSH (requires SSH key setup)
    repoUrl = `git@gitlab.com:${repoPath}.git`;
    console.log(`[cloneOrRefreshRepo] Using SSH authentication (requires GIT_SSH_PRIVATE_KEY_B64 or SSH key)`);
  }
  
  console.log(`[cloneOrRefreshRepo] Repository URL: ${repoUrl.replace(/:[^@]*@/, ':****@')} (auth method: ${authMethod})`);
  
  const runner = new CommandRunner();
  
  // Check if repo already exists
  const repoExists = fs.existsSync(path.join(workspacePath, '.git'));
  console.log(`[cloneOrRefreshRepo] Repo exists: ${repoExists}`);
  
  let result: RunResult;
  
  if (repoExists && refresh) {
    // Refresh existing repo
    console.log(`[cloneOrRefreshRepo] Refreshing existing repo...`);
    result = await runner.run('git', ['fetch', 'origin'], {
      projectId,
      kind: 'git.fetch',
      cwd: workspacePath,
    });
    
    if (result.success) {
      const resetRunner = new CommandRunner();
      console.log(`[cloneOrRefreshRepo] Running git reset...`);
      result = await resetRunner.run('git', ['reset', '--hard', `origin/${branch}`], {
        projectId,
        kind: 'git.reset',
        cwd: workspacePath,
      });
    }
  } else if (!repoExists) {
    // Clone new repo
    console.log(`[cloneOrRefreshRepo] Cloning new repo...`);
    // Ensure parent directory exists
    try {
      const parentDir = path.dirname(workspacePath);
      console.log(`[cloneOrRefreshRepo] Creating parent directory: ${parentDir}`);
      fs.mkdirSync(parentDir, { recursive: true, mode: 0o755 });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'EACCES') {
        throw new Error(`Cannot create workspace directory: permission denied. Ensure /data/workspaces is writable.`);
      }
      throw err;
    }
    
    console.log(`[cloneOrRefreshRepo] Running git clone...`);
    result = await runner.run('git', ['clone', '-b', branch, repoUrl, workspacePath], {
      projectId,
      kind: 'git.clone',
    });
    console.log(`[cloneOrRefreshRepo] Git clone result:`, result);
  } else {
    // Repo exists and no refresh requested
    console.log(`[cloneOrRefreshRepo] Repo exists and no refresh requested`);
    return { workspacePath, runId: '' };
  }
  
  console.log(`[cloneOrRefreshRepo] Git operation result:`, result);
  if (!result.success) {
    console.error(`[cloneOrRefreshRepo] Git operation failed:`, result);
    
    // Fetch logs from database for better error reporting
    try {
      const runLogs = await prisma.runLog.findMany({
        where: { runId: result.runId },
        orderBy: { ts: 'asc' },
        select: { line: true },
      });
      
      const logMessages = runLogs.map(log => log.line).join('\n');
      console.error(`[cloneOrRefreshRepo] Git logs:\n${logMessages}`);
      
      throw new Error(`Git operation failed with exit code ${result.exitCode}:\n${logMessages}`);
    } catch (err) {
      if (err instanceof Error) {
        throw err;
      }
      throw new Error(`Git operation failed with exit code ${result.exitCode}`);
    }
  }
  
  return { workspacePath, runId: result.runId };
}

/**
 * Run a Prisma command in a workspace.
 */
export async function runPrismaCommand(
  projectId: string,
  workspacePath: string,
  workingDirectory: string | null,
  command: 'migrate-deploy' | 'generate' | 'seed',
  databaseUrl: string,
  pnpmFilter?: string
): Promise<RunResult> {
  let cwd: string;
  let schemaDir: string | null = null;
  
  if (workingDirectory) {
    // If working directory is explicitly set, use it
    cwd = resolveWorkingDirectory(workspacePath, workingDirectory);
    // Check for Prisma schema in the explicit directory
    const schemaPath = path.join(cwd, 'prisma', 'schema.prisma');
    if (!fs.existsSync(schemaPath)) {
      throw new Error(`Prisma schema not found at ${path.join(workingDirectory, 'prisma', 'schema.prisma')}`);
    }
  } else {
    // Auto-detect Prisma schema location
    schemaDir = findPrismaSchemaDir(workspacePath);
    if (!schemaDir) {
      throw new Error('Prisma schema not found. Please set a working directory or ensure schema.prisma exists in the repository.');
    }
    // The working directory should be the parent of the prisma folder
    cwd = path.dirname(schemaDir);
    // If prisma folder is at root, use the workspace root
    if (cwd === workspacePath || !cwd.startsWith(workspacePath)) {
      cwd = workspacePath;
    }
  }
  
  const runner = new CommandRunner();
  
  const env: Record<string, string> = {
    DATABASE_URL: databaseUrl,
  };
  
  let args: string[];
  let cmd: string;
  
  if (pnpmFilter) {
    cmd = 'pnpm';
    const prismaCmd = command === 'migrate-deploy' ? 'prisma:migrate' : 
                      command === 'generate' ? 'prisma:generate' : 'prisma:seed';
    args = ['--filter', pnpmFilter, prismaCmd];
  } else {
    cmd = 'npx';
    switch (command) {
      case 'migrate-deploy':
        args = ['prisma', 'migrate', 'deploy'];
        break;
      case 'generate':
        args = ['prisma', 'generate'];
        break;
      case 'seed':
        args = ['prisma', 'db', 'seed'];
        break;
    }
  }
  
  return runner.run(cmd, args, {
    projectId,
    kind: `prisma.${command}`,
    cwd: pnpmFilter ? workspacePath : cwd,
    env,
  });
}

/**
 * Get logs for a run.
 */
export async function getRunLogs(runId: string, limit = 1000): Promise<{ ts: Date; line: string }[]> {
  const logs = await prisma.runLog.findMany({
    where: { runId },
    orderBy: { ts: 'asc' },
    take: limit,
    select: { ts: true, line: true },
  });
  return logs;
}

/**
 * Get run status.
 */
export async function getRunStatus(runId: string): Promise<{
  status: string;
  exitCode: number | null;
  startedAt: Date | null;
  finishedAt: Date | null;
} | null> {
  const run = await prisma.run.findUnique({
    where: { id: runId },
    select: {
      status: true,
      exitCode: true,
      startedAt: true,
      finishedAt: true,
    },
  });
  return run;
}
