import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { discoverConfig } from '../../src/lib/config-discovery.js'

async function tempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'dl-cli-cfg-'))
}

describe('discoverConfig', () => {
  let root: string
  const originalEnv = { ...process.env }

  beforeEach(async () => {
    root = await tempDir()
    delete process.env.DRIFTLOG_CONFIG
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it('returns source=none when no config exists anywhere', async () => {
    const result = await discoverConfig({
      flagPath: null,
      startDir: root,
      cwd: root,
    })
    expect(result.source).toBe('none')
    expect(result.configPath).toBeNull()
  })

  it('walks up the directory tree to find a config', async () => {
    await writeFile(join(root, '.driftlog.yaml'), 'version: "1"\nrules: []')
    const child = join(root, 'a', 'b')
    await mkdir(child, { recursive: true })
    const result = await discoverConfig({ flagPath: null, startDir: child, cwd: child })
    expect(result.source).toBe('walk-up')
    expect(result.configPath).toBe(join(root, '.driftlog.yaml'))
  })

  it('prefers --config flag over walk-up', async () => {
    await writeFile(join(root, '.driftlog.yaml'), 'version: "1"\nrules: []')
    const alt = join(root, 'alt.yaml')
    await writeFile(alt, 'version: "1"\nrules: []')
    const result = await discoverConfig({ flagPath: alt, startDir: root, cwd: root })
    expect(result.source).toBe('flag')
    expect(result.configPath).toBe(alt)
  })

  it('throws when --config points to a nonexistent file', async () => {
    await expect(
      discoverConfig({
        flagPath: '/nonexistent/driftlog.yaml',
        startDir: root,
        cwd: root,
      }),
    ).rejects.toThrow(/config file not found/)
  })

  it('respects DRIFTLOG_CONFIG env var when no flag is given', async () => {
    const alt = join(root, 'env-config.yaml')
    await writeFile(alt, 'version: "1"\nrules: []')
    process.env.DRIFTLOG_CONFIG = alt
    const result = await discoverConfig({ flagPath: null, startDir: root, cwd: root })
    expect(result.source).toBe('env')
    expect(result.configPath).toBe(alt)
  })
})
