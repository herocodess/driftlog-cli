import type { Violation } from '@driftlog/parser'

export type CliWarning = {
  type: 'parse_failure' | 'unresolved_aliases' | 'rule_error' | 'scanner'
  message: string
  file?: string
}

export type CliScanReport = {
  cwd: string
  configPath: string | null
  usingDefaultConfig: boolean
  durationMs: number
  filesScanned: number
  skippedFiles: number
  rulesApplied: number
  violations: Violation[]
  warnings: CliWarning[]
  errorCount: number
  warningCount: number
  infoCount: number
  driftScore: number
  parseFailureCount: number
}
