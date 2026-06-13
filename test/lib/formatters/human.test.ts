import { describe, expect, it } from 'vitest'
import { formatHuman } from '../../../src/lib/formatters/human.js'
import { configureColor } from '../../../src/lib/colors.js'
import type { CliScanReport } from '../../../src/lib/scan-types.js'

function buildReport(over: Partial<CliScanReport> = {}): CliScanReport {
  return {
    cwd: '/repo',
    configPath: null,
    usingDefaultConfig: false,
    durationMs: 1200,
    filesScanned: 5,
    skippedFiles: 0,
    rulesApplied: 2,
    violations: [],
    warnings: [],
    errorCount: 0,
    warningCount: 0,
    infoCount: 0,
    driftScore: 100,
    parseFailureCount: 0,
    ...over,
  }
}

describe('formatHuman', () => {
  it('prints a clean-result summary plus drift score line', () => {
    configureColor(false)
    const out = formatHuman(buildReport())
    expect(out).toContain('No violations found.')
    expect(out).toContain('0 errors, 0 warnings, 0 info in 1.2s')
    expect(out).toContain('Drift score 100/100')
  })

  it('renders a table with one row per violation', () => {
    configureColor(false)
    const out = formatHuman(
      buildReport({
        violations: [
          {
            ruleId: 'layer-breach',
            ruleType: 'layer_breach',
            severity: 'error',
            filePath: 'src/x.ts',
            line: 1,
            column: 2,
            message: 'msg',
          },
        ],
        errorCount: 1,
        driftScore: 97,
      }),
    )
    expect(out).toContain('SEVERITY')
    expect(out).toContain('layer-breach')
    expect(out).toContain('src/x.ts:1:2')
    expect(out).toContain('Drift score 97/100')
  })

  it('lists structured warnings under a Warnings: header', () => {
    configureColor(false)
    const out = formatHuman(
      buildReport({
        warnings: [{ type: 'unresolved_aliases', message: 'tsconfig paths detected' }],
      }),
    )
    expect(out).toContain('Warnings:')
    expect(out).toContain('tsconfig paths detected')
  })
})
