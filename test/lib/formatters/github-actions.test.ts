import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  formatGitHubActions,
  writeStepSummary,
} from '../../../src/lib/formatters/github-actions.js'
import type { CliScanReport } from '../../../src/lib/scan-types.js'

function buildReport(over: Partial<CliScanReport> = {}): CliScanReport {
  return {
    cwd: '/repo',
    configPath: null,
    usingDefaultConfig: true,
    durationMs: 1500,
    filesScanned: 10,
    skippedFiles: 0,
    rulesApplied: 2,
    violations: [
      {
        ruleId: 'layer-breach',
        ruleType: 'layer_breach',
        severity: 'error',
        filePath: 'src/x.ts',
        line: 1,
        column: 2,
        message: 'bad import',
      },
      {
        ruleId: 'pattern-ban',
        ruleType: 'pattern_ban',
        severity: 'warning',
        filePath: 'src/y.ts',
        line: 3,
        column: 4,
        message: 'banned\nimport',
      },
    ],
    warnings: [],
    errorCount: 1,
    warningCount: 1,
    infoCount: 0,
    driftScore: 92,
    parseFailureCount: 0,
    ...over,
  }
}

describe('formatGitHubActions', () => {
  it('emits ::error and ::warning lines with escaped newlines', () => {
    const out = formatGitHubActions(buildReport())
    const lines = out.trim().split('\n')
    expect(lines).toHaveLength(2)
    expect(lines[0]).toMatch(
      /^::error file=src\/x\.ts,line=1,col=2,title=layer-breach::bad import$/,
    )
    expect(lines[1]).toContain('::warning')
    expect(lines[1]).toContain('%0A') // newline escaped
  })

  it('returns empty string when there are no violations or warnings', () => {
    const out = formatGitHubActions(
      buildReport({ violations: [], warnings: [], errorCount: 0, warningCount: 0 }),
    )
    expect(out).toBe('')
  })
})

describe('writeStepSummary', () => {
  let originalSummary: string | undefined

  beforeEach(() => {
    originalSummary = process.env.GITHUB_STEP_SUMMARY
  })
  afterEach(() => {
    if (originalSummary === undefined) delete process.env.GITHUB_STEP_SUMMARY
    else process.env.GITHUB_STEP_SUMMARY = originalSummary
  })

  it('appends a Markdown table when GITHUB_STEP_SUMMARY is set', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dl-cli-summary-'))
    const path = join(dir, 'summary.md')
    process.env.GITHUB_STEP_SUMMARY = path

    await writeStepSummary(buildReport())
    const written = await readFile(path, 'utf8')

    expect(written).toContain('## Driftlog scan results')
    expect(written).toContain('| Severity | Rule | File | Message |')
    expect(written).toContain('| error | layer-breach | src/x.ts:1:2 |')
    expect(written).toContain('drift score 92/100')
  })

  it('is a no-op when GITHUB_STEP_SUMMARY is unset', async () => {
    delete process.env.GITHUB_STEP_SUMMARY
    await expect(writeStepSummary(buildReport())).resolves.toBeUndefined()
  })
})
