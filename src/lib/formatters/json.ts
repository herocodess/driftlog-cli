import type { CliScanReport } from '../scan-types.js'

const VERSION = '1.0.0'

export function formatJson(report: CliScanReport): string {
  const payload = {
    version: VERSION,
    summary: {
      files_scanned: report.filesScanned,
      skipped_files: report.skippedFiles,
      rules_applied: report.rulesApplied,
      errors: report.errorCount,
      warnings: report.warningCount,
      info: report.infoCount,
      drift_score: report.driftScore,
      duration_ms: report.durationMs,
      using_default_config: report.usingDefaultConfig,
    },
    violations: report.violations.map((v) => ({
      severity: v.severity,
      rule_id: v.ruleId,
      rule_type: v.ruleType,
      file: v.filePath,
      line: v.line,
      column: v.column,
      message: v.message,
      suggestion: v.suggestion ?? null,
    })),
    warnings: report.warnings.map((w) => ({
      type: w.type,
      file: w.file ?? null,
      message: w.message,
    })),
  }
  return JSON.stringify(payload)
}
