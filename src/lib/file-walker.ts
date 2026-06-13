import { readFile } from 'node:fs/promises'
import { relative, resolve } from 'node:path'
import fg from 'fast-glob'
import ignore, { type Ignore } from 'ignore'

import { pluginRegistry } from '@driftlog/parser'

const DEFAULT_EXTENSIONS = ['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'dart']

export type WalkOptions = {
  cwd: string
  /** Optional explicit seed list (e.g. from git diff --name-only). */
  seedFiles?: string[]
  includeGlobs?: string[]
  excludeGlobs?: string[]
  /** Patterns from config.settings.ignorePatterns. Already micromatch-applied by the parser, but we also apply here for early pruning. */
  configIgnorePatterns?: string[]
}

export type WalkedFile = {
  /** Repo-root-relative path. POSIX separators. */
  filePath: string
  content: string
}

function defaultExtensions(): string[] {
  const fromRegistry = (pluginRegistry as unknown as {
    plugins?: Map<string, { extensions: string[] }>
  }).plugins
  if (fromRegistry instanceof Map) {
    const seen = new Set<string>()
    for (const plugin of fromRegistry.values()) {
      for (const ext of plugin.extensions) {
        seen.add(ext.replace(/^\./, ''))
      }
    }
    if (seen.size > 0) return [...seen]
  }
  return DEFAULT_EXTENSIONS
}

function buildIgnorer(opts: WalkOptions): Ignore {
  const ig = ignore()
  ig.add(['node_modules', '.git', 'dist', 'build', '.next', '.turbo'])
  if (opts.excludeGlobs && opts.excludeGlobs.length > 0) {
    ig.add(opts.excludeGlobs)
  }
  if (opts.configIgnorePatterns && opts.configIgnorePatterns.length > 0) {
    ig.add(opts.configIgnorePatterns)
  }
  return ig
}

async function loadGitignore(cwd: string): Promise<Ignore | null> {
  try {
    const raw = await readFile(resolve(cwd, '.gitignore'), 'utf8')
    return ignore().add(raw)
  } catch {
    return null
  }
}

function toPosix(p: string): string {
  return p.split('\\').join('/')
}

/**
 * Walk the working tree honouring .gitignore + config ignore + explicit excludes.
 * If seedFiles is supplied, the walk is restricted to those paths (still subject to ignores).
 */
export async function walkFiles(opts: WalkOptions): Promise<WalkedFile[]> {
  const { cwd } = opts
  const exts = defaultExtensions()
  const includeGlobs =
    opts.includeGlobs && opts.includeGlobs.length > 0
      ? opts.includeGlobs
      : exts.map((e) => `**/*.${e}`)

  const baseExclude = ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**']
  const fastGlobIgnore = [
    ...baseExclude,
    ...(opts.excludeGlobs ?? []),
    ...(opts.configIgnorePatterns ?? []),
  ]

  let candidatePaths: string[]
  if (opts.seedFiles && opts.seedFiles.length > 0) {
    candidatePaths = opts.seedFiles
      .map(toPosix)
      .filter((p) => exts.some((e) => p.endsWith(`.${e}`)))
  } else {
    candidatePaths = await fg(includeGlobs, {
      cwd,
      ignore: fastGlobIgnore,
      dot: false,
      onlyFiles: true,
      followSymbolicLinks: false,
    })
  }

  const gitignore = await loadGitignore(cwd)
  const ig = buildIgnorer(opts)

  const filtered = candidatePaths.filter((p) => {
    const rel = toPosix(p)
    if (gitignore && gitignore.ignores(rel)) return false
    if (ig.ignores(rel)) return false
    if (opts.includeGlobs && opts.includeGlobs.length > 0 && opts.seedFiles) {
      // When both an explicit seed list and --include are given, intersect them.
      // fast-glob already handles --include for the no-seed path.
      const matchIg = ignore().add(opts.includeGlobs)
      if (!matchIg.ignores(rel)) return false
    }
    return true
  })

  const results: WalkedFile[] = []
  for (const rel of filtered) {
    const abs = resolve(cwd, rel)
    try {
      const content = await readFile(abs, 'utf8')
      results.push({ filePath: toPosix(relative(cwd, abs)), content })
    } catch {
      // Unreadable file -> skip silently. Most likely a race with deletion.
    }
  }

  results.sort((a, b) => a.filePath.localeCompare(b.filePath))
  return results
}
