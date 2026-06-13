import { describe, expect, it } from 'vitest'
import { formatJson } from '../../../src/lib/formatters/json.js'
import type { CliScanReport } from '../../../src/lib/scan-types.js'

function buildReport(over: Partial<CliScanReport> = {}): CliScanReport {
  return {
    cwd: '/repo',
    configPath: '/repo/.driftlog.yaml',
    usingDefaultConfig: false,
    durationMs: 2103,
    filesScanned: 142,
    skippedFiles: 0,
    rulesApplied: 4,
    violations: [
      {
        ruleId: 'layer-breach',
        ruleType: 'layer_breach',
        severity: 'error',
        filePath: 'src/components/Cart.tsx',
        line: 42,
        column: 8,
        message: 'UI layer imports from data layer (src/db/orders.ts)',
      },
    ],
    warnings: [
      { type: 'parse_failure', file: 'lib/macros.dart', message: 'could not parse' },
    ],
    errorCount: 1,
    warningCount: 0,
    infoCount: 0,
    driftScore: 97,
    parseFailureCount: 1,
    ...over,
  }
}

describe('formatJson', () => {
  it('emits a single-line JSON document with the documented top-level keys', () => {
    const out = formatJson(buildReport())
    expect(out.includes('\n')).toBe(false)
    const parsed = JSON.parse(out)
    expect(parsed.version).toBe('1.0.0')
    expect(parsed.summary.files_scanned).toBe(142)
    expect(parsed.summary.errors).toBe(1)
    expect(parsed.summary.drift_score).toBe(97)
    expect(parsed.summary.duration_ms).toBe(2103)
    expect(parsed.violations).toHaveLength(1)
    expect(parsed.violations[0]).toMatchObject({
      severity: 'error',
      rule_id: 'layer-breach',
      file: 'src/components/Cart.tsx',
      line: 42,
      column: 8,
    })
    expect(parsed.warnings[0]).toMatchObject({
      type: 'parse_failure',
      file: 'lib/macros.dart',
    })
  })

  it('serialises empty results without crashing', () => {
    const out = formatJson(
      buildReport({ violations: [], warnings: [], errorCount: 0, driftScore: 100 }),
    )
    const parsed = JSON.parse(out)
    expect(parsed.violations).toEqual([])
    expect(parsed.warnings).toEqual([])
    expect(parsed.summary.drift_score).toBe(100)
  })
})
