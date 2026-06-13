import type { Command } from 'commander'

import { c, configureColor } from '../lib/colors.js'
import { EXIT_OK } from '../lib/exit-codes.js'

type FixOptions = {
  dryRun?: boolean
  yes?: boolean
  rule?: string[]
  config?: string
  cwd?: string
  json?: boolean
  quiet?: boolean
  verbose?: boolean
  color?: boolean
}

function collect(value: string, previous: string[]): string[] {
  return [...previous, value]
}

export function registerFix(program: Command): void {
  program
    .command('fix [path]')
    .description('Auto-fix violations (coming in v1.1).')
    .option('--dry-run', 'Preview fixes without writing (v1.1; accepted as no-op).')
    .option(
      '--yes',
      'Skip the confirmation prompt (v1.1; accepted as no-op).',
    )
    .option(
      '--rule <id>',
      'Limit fixes to a specific rule (v1.1; accepted as no-op).',
      collect,
      [],
    )
    .option('--config <path>', 'Path to .driftlog.yaml (v1.1; accepted as no-op).')
    .option('--cwd <dir>', 'Working directory (v1.1; accepted as no-op).')
    .option('--json', 'Emit JSON output (v1.1; accepted as no-op).')
    .option('--quiet', 'Suppress info output (v1.1; accepted as no-op).')
    .option('-v, --verbose', 'Verbose output (v1.1; accepted as no-op).')
    .option('--no-color', 'Disable ANSI colour even on a TTY.')
    .action((_path: string | undefined, options: FixOptions) => {
      configureColor(options.color === false ? false : 'auto')
      process.stdout.write(
        `${c.bold('driftlog fix')} is coming in v1.1.\n` +
          `${c.dim('Track progress at https://driftlog.dev/changelog')}\n`,
      )
      process.exit(EXIT_OK)
    })
}
