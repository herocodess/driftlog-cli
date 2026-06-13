import { appendFile } from 'node:fs/promises'

import { getStepSummaryPath } from '../ci-detection.js'
import type { CliScanReport } from '../scan-types.js'

function escape(value: string): string {
  return value
    .replace(/%/g, '%25')
    .replace(/\r/g, '%0D')
    .replace(/\n/g, '%0A')
}

export function formatGitHubActions(report: CliScanReport): string {
  const lines: string[] = []
  for (const v of report.violations) {
    const cmd = v.severity === 'error' ? 'error' : 'warning'
    const parts = [
      `file=${escape(v.filePath)}`,
      `line=${v.line}`,
      `col=${v.column}`,
      `title=${escape(v.ruleId)}`,
    ].join(',')
    lines.push(`::${cmd} ${parts}::${escape(v.message)}`)
  }
  for (const w of report.warnings) {
    const parts = [
      `title=${escape(w.type)}`,
      w.file ? `file=${escape(w.file)}` : null,
    ]
      .filter(Boolean)
      .join(',')
    lines.push(`::warning ${parts}::${escape(w.message)}`)
  }
  return lines.length === 0 ? '' : lines.join('\n') + '\n'
}

export async function writeStepSummary(report: CliScanReport): Promise<void> {
  const path = getStepSummaryPath()
  if (!path) return

  const rows = report.violations.map(
    (v) =>
      `| ${v.severity} | ${v.ruleId} | ${v.filePath}:${v.line}:${v.column} | ${v.message.replace(/\|/g, '\\|')} |`,
  )

  const secs = (report.durationMs / 1000).toFixed(1)
  const summary = [
    '## Driftlog scan results',
    '',
    `**${report.errorCount} errors, ${report.warningCount} warnings, ${report.infoCount} info in ${secs}s — drift score ${report.driftScore}/100**`,
    '',
    '| Severity | Rule | File | Message |',
    '|---|---|---|---|',
    ...rows,
    '',
  ].join('\n')

  try {
    await appendFile(path, summary, 'utf8')
  } catch (err) {
    // Surface to stderr only -- failing to write the summary should not abort the scan.
    const msg = err instanceof Error ? err.message : String(err)
    process.stderr.write(`driftlog: could not write GITHUB_STEP_SUMMARY: ${msg}\n`)
  }
}
