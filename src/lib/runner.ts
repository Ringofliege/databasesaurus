import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { prisma } from './prisma';
import { maskDbUrl } from './db-url';
import { getWorkspacePath, ensureWorkspacesRoot, resolveWorkingDirectory, isValidRepoPath, isValidBranchName } from './path-utils';

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
 */
function setupSshKey(): string | null {
  const sshKey = process.env.GIT_SSH_PRIVATE_KEY;
  if (!sshKey) return null;
  
  const keyPath = path.join(os.tmpdir(), `ssh_key_${Date.now()}`);
  fs.writeFileSync(keyPath, sshKey, { mode: 0o600 });
  return keyPath;
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
    if (command === 'git' && args.includes('clone') || args.includes('fetch')) {
      sshKeyPath = setupSshKey();
      if (sshKeyPath) {
        env.GIT_SSH_COMMAND = `ssh -i ${sshKeyPath} -o StrictHostKeyChecking=accept-new`;
      }
    }
    
    return new Promise((resolve, reject) => {
      try {
        this.process = spawn(command, args, {
          cwd: options.cwd,
          env,
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        
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
 */
export async function cloneOrRefreshRepo(
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
  
  ensureWorkspacesRoot();
  
  const workspacePath = getWorkspacePath(projectSlug, repoPath, branch);
  const repoUrl = `git@gitlab.com:${repoPath}.git`;
  
  const runner = new CommandRunner();
  
  // Check if repo already exists
  const repoExists = fs.existsSync(path.join(workspacePath, '.git'));
  
  let result: RunResult;
  
  if (repoExists && refresh) {
    // Refresh existing repo
    result = await runner.run('git', ['fetch', 'origin'], {
      projectId: projectSlug, // Will be replaced with actual project ID
      kind: 'git.fetch',
      cwd: workspacePath,
    });
    
    if (result.success) {
      const resetRunner = new CommandRunner();
      result = await resetRunner.run('git', ['reset', '--hard', `origin/${branch}`], {
        projectId: projectSlug,
        kind: 'git.reset',
        cwd: workspacePath,
      });
    }
  } else if (!repoExists) {
    // Clone new repo
    // Ensure parent directory exists
    fs.mkdirSync(path.dirname(workspacePath), { recursive: true });
    
    result = await runner.run('git', ['clone', '-b', branch, repoUrl, workspacePath], {
      projectId: projectSlug,
      kind: 'git.clone',
    });
  } else {
    // Repo exists and no refresh requested
    return { workspacePath, runId: '' };
  }
  
  if (!result.success) {
    throw new Error(`Git operation failed with exit code ${result.exitCode}`);
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
  const cwd = resolveWorkingDirectory(workspacePath, workingDirectory);
  
  // Check for Prisma schema
  const schemaPath = path.join(cwd, 'prisma', 'schema.prisma');
  if (!fs.existsSync(schemaPath)) {
    throw new Error(`Prisma schema not found at ${path.join(workingDirectory || '', 'prisma', 'schema.prisma')}`);
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
