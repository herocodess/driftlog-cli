import { c, severityColor } from '../colors.js'
import type { CliScanReport } from '../scan-types.js'

const HEADER = ['SEVERITY', 'RULE', 'FILE', 'MESSAGE'] as const

function padRight(s: string, width: number): string {
  if (s.length >= width) return s
  return s + ' '.repeat(width - s.length)
}

function truncate(s: string, max: number): string {
  if (max <= 1) return s.slice(0, Math.max(0, max))
  if (s.length <= max) return s
  return s.slice(0, max - 1) + '…'
}

export function formatHuman(report: CliScanReport): string {
  const lines: string[] = []

  if (report.violations.length === 0) {
    lines.push(c.green('No violations found.'))
  } else {
    const severityWidth = Math.max(
      HEADER[0].length,
      ...report.violations.map((v) => v.severity.length),
    )
    const ruleWidth = Math.max(
      HEADER[1].length,
      ...report.violations.map((v) => v.ruleId.length),
    )
    const fileEntries = report.violations.map(
      (v) => `${v.filePath}:${v.line}:${v.column}`,
    )
    const fileWidth = Math.max(HEADER[2].length, ...fileEntries.map((s) => s.length))

    const termWidth = process.stdout.columns && process.stdout.columns > 40
      ? process.stdout.columns
      : 120
    const msgBudget = Math.max(20, termWidth - severityWidth - ruleWidth - fileWidth - 6)

    lines.push(
      c.bold(
        [
          padRight(HEADER[0], severityWidth),
          padRight(HEADER[1], ruleWidth),
          padRight(HEADER[2], fileWidth),
          HEADER[3],
        ].join('  '),
      ),
    )

    for (let i = 0; i < report.violations.length; i++) {
      const v = report.violations[i]
      const sev = severityColor(v.severity)(padRight(v.severity, severityWidth))
      const rule = padRight(v.ruleId, ruleWidth)
      const file = padRight(fileEntries[i], fileWidth)
      const message = truncate(v.message, msgBudget)
      lines.push([sev, rule, file, message].join('  '))
    }
  }

  const summaryParts = [
    `${report.errorCount} ${report.errorCount === 1 ? 'error' : 'errors'}`,
    `${report.warningCount} ${report.warningCount === 1 ? 'warning' : 'warnings'}`,
    `${report.infoCount} info`,
  ]
  const secs = (report.durationMs / 1000).toFixed(1)
  lines.push('')
  lines.push(c.bold(`${summaryParts.join(', ')} in ${secs}s`))
  lines.push(`Drift score ${report.driftScore}/100`)

  if (report.warnings.length > 0) {
    lines.push('')
    lines.push(c.bold('Warnings:'))
    for (const w of report.warnings) {
      const prefix = w.file ? `${w.file}: ` : ''
      lines.push(c.dim(`  - ${prefix}${w.message}`))
    }
  }

  return lines.join('\n') + '\n'
}
