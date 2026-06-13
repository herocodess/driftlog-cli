import { execSync, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const cliPath = resolve(here, '../dist/cli.cjs')
const fixture = resolve(here, 'fixtures/smoke')

function runtimeEnv(extra: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  // The CLI guards its top-level `run()` with `NODE_ENV !== 'test'`. Vitest
  // injects NODE_ENV=test, so child invocations of the bundled bin would
  // exit silently if we inherited the parent env as-is.
  const env = { ...process.env, ...extra }
  delete env.NODE_ENV
  return env
}

beforeAll(() => {
  if (!existsSync(cliPath)) {
    execSync('pnpm --filter driftlog build', {
      stdio: 'inherit',
      cwd: resolve(here, '../../..'),
    })
  }
}, 120_000)

describe('smoke (bundled bin)', () => {
  it('prints version exactly 1.0.0', () => {
    const r = spawnSync('node', [cliPath, '--version'], {
      encoding: 'utf8',
      env: runtimeEnv(),
    })
    expect(r.status).toBe(0)
    expect(r.stdout.trim()).toBe('1.0.0')
  })

  it('exits 1 on the smoke fixture with one error', () => {
    const r = spawnSync(
      'node',
      [cliPath, 'check', '--cwd', fixture, '--json'],
      { encoding: 'utf8', env: runtimeEnv() },
    )
    expect(r.status).toBe(1)
    const out = JSON.parse(r.stdout) as {
      summary: { errors: number }
      violations: Array<{ rule_type: string }>
    }
    expect(out.summary.errors).toBe(1)
    expect(out.violations[0].rule_type).toBe('layer_breach')
  })

  it('fix command exits 0 with the coming-soon message', () => {
    const r = spawnSync('node', [cliPath, 'fix'], {
      encoding: 'utf8',
      env: runtimeEnv(),
    })
    expect(r.status).toBe(0)
    expect(r.stdout).toContain('v1.1')
    expect(r.stdout).toContain('driftlog.dev/changelog')
  })

  it('rule list returns parseable JSON with the six built-ins', () => {
    const r = spawnSync(
      'node',
      [cliPath, 'rule', 'list', '--json'],
      { encoding: 'utf8', env: runtimeEnv() },
    )
    expect(r.status).toBe(0)
    const parsed = JSON.parse(r.stdout) as
      | { rules: Array<{ id: string }> }
      | Array<{ id: string }>
    const rules = Array.isArray(parsed) ? parsed : parsed.rules
    expect(Array.isArray(rules)).toBe(true)
    expect(rules.length).toBeGreaterThanOrEqual(6)
  })

  it('GITHUB_ACTIONS=true auto-selects annotations format', () => {
    const env = runtimeEnv({ GITHUB_ACTIONS: 'true' })
    delete env.GITHUB_STEP_SUMMARY
    const r = spawnSync('node', [cliPath, 'check', '--cwd', fixture], {
      encoding: 'utf8',
      env,
    })
    expect(r.status).toBe(1)
    expect(r.stdout).toMatch(/^::error /m)
  })
})
