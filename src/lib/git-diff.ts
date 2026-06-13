import simpleGit from 'simple-git'

export type ChangedFilesResult = {
  files: string[]
  base: string
}

const DEFAULT_BASE = 'origin/main'

/**
 * Resolve the list of changed files between the given base ref and HEAD.
 * Always returns POSIX-style repo-relative paths.
 */
export async function changedFilesSince(
  baseRef: string | undefined,
  cwd: string,
): Promise<ChangedFilesResult> {
  const git = simpleGit(cwd)

  const isRepo = await git.checkIsRepo().catch(() => false)
  if (!isRepo) {
    throw new Error(`not a git repository: ${cwd}`)
  }

  const base = baseRef && baseRef.length > 0 ? baseRef : DEFAULT_BASE

  try {
    await git.revparse([base])
  } catch {
    throw new Error(`git ref not found: ${base}`)
  }

  const diff = await git.diff(['--name-only', `${base}...HEAD`])
  const files = diff.split('\n').map((s) => s.trim()).filter(Boolean)

  return { files, base }
}
