import { stat } from 'node:fs/promises'
import { dirname, isAbsolute, join, resolve } from 'node:path'

export type ConfigDiscoveryResult = {
  /** Directory containing .driftlog.yaml, or null when none was found. */
  repoRoot: string | null
  /** Absolute path to the resolved config file, or null when defaults will be used. */
  configPath: string | null
  /** The flag/env var/walk-up source that found this config. */
  source: 'flag' | 'env' | 'walk-up' | 'cwd' | 'none'
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await stat(p)
    return true
  } catch {
    return false
  }
}

async function isDir(p: string): Promise<boolean> {
  try {
    const s = await stat(p)
    return s.isDirectory()
  } catch {
    return false
  }
}

/**
 * Discover .driftlog.yaml using the documented precedence:
 *   1. --config <path>  (flag)
 *   2. DRIFTLOG_CONFIG  (env)
 *   3. walk-up from startDir, stopping at .git or the filesystem root
 *   4. cwd
 *   5. none -> caller falls back to DEFAULT_CONFIG_V1
 *
 * Throws when --config or DRIFTLOG_CONFIG points to a missing file.
 */
export async function discoverConfig(opts: {
  flagPath?: string | null
  startDir: string
  cwd: string
}): Promise<ConfigDiscoveryResult> {
  const { flagPath, startDir, cwd } = opts

  if (flagPath) {
    const abs = isAbsolute(flagPath) ? flagPath : resolve(cwd, flagPath)
    if (!(await pathExists(abs))) {
      throw new Error(`config file not found: ${flagPath}`)
    }
    return { repoRoot: dirname(abs), configPath: abs, source: 'flag' }
  }

  const envPath = process.env.DRIFTLOG_CONFIG
  if (envPath && envPath.length > 0) {
    const abs = isAbsolute(envPath) ? envPath : resolve(cwd, envPath)
    if (!(await pathExists(abs))) {
      throw new Error(`config file not found (DRIFTLOG_CONFIG): ${envPath}`)
    }
    return { repoRoot: dirname(abs), configPath: abs, source: 'env' }
  }

  let dir = (await isDir(startDir)) ? startDir : dirname(startDir)
  const root = resolve(dir, '/')
  while (true) {
    const candidate = join(dir, '.driftlog.yaml')
    if (await pathExists(candidate)) {
      return { repoRoot: dir, configPath: candidate, source: 'walk-up' }
    }
    if (await pathExists(join(dir, '.git'))) {
      // Reached repo root without finding a config -- stop walking up.
      break
    }
    if (dir === root) break
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }

  const cwdCandidate = join(cwd, '.driftlog.yaml')
  if (await pathExists(cwdCandidate)) {
    return { repoRoot: cwd, configPath: cwdCandidate, source: 'cwd' }
  }

  return { repoRoot: null, configPath: null, source: 'none' }
}
