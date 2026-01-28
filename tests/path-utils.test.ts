import { describe, it, expect } from 'vitest';
import {
  isValidPath,
  resolveWorkingDirectory,
  isValidRepoPath,
  isValidBranchName,
  isValidSlug,
  generateSlug,
} from '../src/lib/path-utils';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

describe('isValidPath', () => {
  it('should return true for simple relative paths', () => {
    expect(isValidPath('packages/api')).toBe(true);
  });

  it('should return true for nested paths', () => {
    expect(isValidPath('src/components/ui')).toBe(true);
  });

  it('should return false for path traversal with ..', () => {
    expect(isValidPath('../etc/passwd')).toBe(false);
  });

  it('should return false for path traversal in middle', () => {
    expect(isValidPath('packages/../../../etc/passwd')).toBe(false);
  });

  it('should return false for absolute paths', () => {
    expect(isValidPath('/etc/passwd')).toBe(false);
  });

  it('should return false for null bytes', () => {
    expect(isValidPath('path\0with\0nulls')).toBe(false);
  });

  it('should return true for paths with dots in names', () => {
    expect(isValidPath('src/file.test.ts')).toBe(true);
  });

  it('should return true for empty string', () => {
    expect(isValidPath('')).toBe(true);
  });
});

describe('resolveWorkingDirectory', () => {
  const tempDir = path.join(os.tmpdir(), 'test-repo-' + Date.now());
  const subDir = path.join(tempDir, 'packages', 'api');

  beforeAll(() => {
    fs.mkdirSync(subDir, { recursive: true });
  });

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should return repo root for null working directory', () => {
    const result = resolveWorkingDirectory(tempDir, null);
    expect(result).toBe(tempDir);
  });

  it('should return repo root for undefined working directory', () => {
    const result = resolveWorkingDirectory(tempDir, undefined);
    expect(result).toBe(tempDir);
  });

  it('should resolve valid subdirectory', () => {
    const result = resolveWorkingDirectory(tempDir, 'packages/api');
    expect(result).toBe(subDir);
  });

  it('should throw for path traversal attempt', () => {
    expect(() => resolveWorkingDirectory(tempDir, '../etc')).toThrow('path traversal detected');
  });

  it('should throw for non-existent directory', () => {
    expect(() => resolveWorkingDirectory(tempDir, 'nonexistent')).toThrow('does not exist');
  });
});

describe('isValidRepoPath', () => {
  it('should return true for simple org/repo format', () => {
    expect(isValidRepoPath('peakwork/my-repo')).toBe(true);
  });

  it('should return true for nested subgroup format', () => {
    expect(isValidRepoPath('peakwork/subgroup/my-repo')).toBe(true);
  });

  it('should return true for multiple subgroups', () => {
    expect(isValidRepoPath('peakwork/a/b/c/my-repo')).toBe(true);
  });

  it('should return false for single segment', () => {
    expect(isValidRepoPath('my-repo')).toBe(false);
  });

  it('should return false for empty string', () => {
    expect(isValidRepoPath('')).toBe(false);
  });

  it('should return false for path with special characters', () => {
    expect(isValidRepoPath('org/repo@with@at')).toBe(false);
  });

  it('should return true for underscores and dots', () => {
    expect(isValidRepoPath('org/my_repo.name')).toBe(true);
  });

  it('should return false for leading slash', () => {
    expect(isValidRepoPath('/org/repo')).toBe(false);
  });
});

describe('isValidBranchName', () => {
  it('should return true for main', () => {
    expect(isValidBranchName('main')).toBe(true);
  });

  it('should return true for feature branches', () => {
    expect(isValidBranchName('feature/my-feature')).toBe(true);
  });

  it('should return true for release branches', () => {
    expect(isValidBranchName('release/1.0.0')).toBe(true);
  });

  it('should return false for empty string', () => {
    expect(isValidBranchName('')).toBe(false);
  });

  it('should return false for path traversal', () => {
    expect(isValidBranchName('feature/../main')).toBe(false);
  });

  it('should return false for leading slash', () => {
    expect(isValidBranchName('/main')).toBe(false);
  });

  it('should return false for trailing slash', () => {
    expect(isValidBranchName('main/')).toBe(false);
  });

  it('should return false for backslash', () => {
    expect(isValidBranchName('feature\\test')).toBe(false);
  });

  it('should return false for control characters', () => {
    expect(isValidBranchName('main~test')).toBe(false);
    expect(isValidBranchName('main^test')).toBe(false);
    expect(isValidBranchName('main:test')).toBe(false);
    expect(isValidBranchName('main?test')).toBe(false);
    expect(isValidBranchName('main*test')).toBe(false);
    expect(isValidBranchName('main[test')).toBe(false);
  });
});

describe('isValidSlug', () => {
  it('should return true for simple slugs', () => {
    expect(isValidSlug('my-project')).toBe(true);
  });

  it('should return true for single character', () => {
    expect(isValidSlug('a')).toBe(true);
  });

  it('should return true for numbers', () => {
    expect(isValidSlug('project-123')).toBe(true);
  });

  it('should return false for uppercase', () => {
    expect(isValidSlug('My-Project')).toBe(false);
  });

  it('should return false for leading hyphen', () => {
    expect(isValidSlug('-project')).toBe(false);
  });

  it('should return false for trailing hyphen', () => {
    expect(isValidSlug('project-')).toBe(false);
  });

  it('should return false for spaces', () => {
    expect(isValidSlug('my project')).toBe(false);
  });

  it('should return false for underscores', () => {
    expect(isValidSlug('my_project')).toBe(false);
  });

  it('should return false for empty string', () => {
    expect(isValidSlug('')).toBe(false);
  });
});

describe('generateSlug', () => {
  it('should convert to lowercase', () => {
    expect(generateSlug('My Project')).toBe('my-project');
  });

  it('should replace spaces with hyphens', () => {
    expect(generateSlug('My Cool Project')).toBe('my-cool-project');
  });

  it('should remove special characters', () => {
    expect(generateSlug('Project @#$%!')).toBe('project');
  });

  it('should collapse multiple hyphens', () => {
    expect(generateSlug('My   Project')).toBe('my-project');
  });

  it('should trim leading/trailing hyphens', () => {
    expect(generateSlug('  Project  ')).toBe('project');
  });

  it('should truncate long names', () => {
    const longName = 'a'.repeat(100);
    const slug = generateSlug(longName);
    expect(slug.length).toBeLessThanOrEqual(50);
  });

  it('should handle numbers', () => {
    expect(generateSlug('Project 123')).toBe('project-123');
  });

  it('should handle German umlauts', () => {
    expect(generateSlug('Über Projekt')).toBe('ber-projekt');
  });
});
