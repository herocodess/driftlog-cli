import { resolve } from 'node:path'

import type { Command } from 'commander'

import {
  computeDriftScoreV1,
  type ViolationCounts,
} from '@driftlog/types'
import {
  loadConfigWithDefaults,
  scanRepo,
  type Violation,
} from '@driftlog/parser'

import { c, configureColor } from '../lib/colors.js'
import { isGitHubActions } from '../lib/ci-detection.js'
import { discoverConfig } from '../lib/config-discovery.js'
import { EXIT_OK, EXIT_USAGE, EXIT_VIOLATIONS } from '../lib/exit-codes.js'
import { walkFiles } from '../lib/file-walker.js'
import { changedFilesSince } from '../lib/git-diff.js'
import { detectPathAliases } from '../lib/path-alias.js'
import { createProgress } from '../lib/progress.js'
import { matchesRule } from '../lib/rule-match.js'
import { formatHuman } from '../lib/formatters/human.js'
import { formatJson } from '../lib/formatters/json.js'
import {
  formatGitHubActions,
  writeStepSummary,
} from '../lib/formatters/github-actions.js'
import type { CliScanReport, CliWarning } from '../lib/scan-types.js'

type CheckOptions = {
  config?: string
  cwd?: string
  json?: boolean
  strict?: boolean
  strictParse?: boolean
  include?: string[]
  exclude?: string[]
  rule?: string[]
  base?: string
  changedOnly?: boolean
  quiet?: boolean
  verbose?: boolean
  color?: boolean
}

function collect(value: string, prev: string[] | undefined): string[] {
  return prev ? [...prev, value] : [value]
}

function pickFormat(opts: CheckOptions): 'human' | 'json' | 'github-actions' {
  if (opts.json) return 'json'
  if (isGitHubActions()) return 'github-actions'
  return 'human'
}

function counts(violations: Violation[]): ViolationCounts {
  let errorCount = 0
  let warningCount = 0
  let infoCount = 0
  for (const v of violations) {
    if (v.severity === 'error') errorCount++
    else if (v.severity === 'warning') warningCount++
    else infoCount++
  }
  return { errorCount, warningCount, infoCount }
}

function classifyWarnings(rawWarnings: string[]): CliWarning[] {
  return rawWarnings.map((message) => {
    const lower = message.toLowerCase()
    if (lower.includes('parse') || lower.includes('grammar')) {
      return { type: 'parse_failure', message }
    }
    return { type: 'scanner', message }
  })
}

function filterViolationsByRule(
  violations: Violation[],
  ruleFilter: string[] | undefined,
): Violation[] {
  if (!ruleFilter || ruleFilter.length === 0) return violations
  return violations.filter((v) =>
    ruleFilter.some((flag) => matchesRule(flag, { id: v.ruleId, type: v.ruleType })),
  )
}

export function registerCheck(program: Command): void {
  program
    .command('check', { isDefault: true })
    .description('Run all rules against the repo. Reports drift score + violations.')
    .argument('[path]', 'Directory or glob to scan.', '.')
    .option('--config <path>', 'Path to .driftlog.yaml. Default: walk-up discovery.')
    .option('--cwd <dir>', 'Working directory.')
    .option('--json', 'Emit a single JSON document. Mutes human output.')
    .option('--strict', 'Promote warnings to errors (exit 1 on any warning).')
    .option('--strict-parse', 'Treat parse failures as errors instead of warnings.')
    .option('--include <glob>', 'Only scan paths matching the glob. Repeatable.', collect)
    .option('--exclude <glob>', 'Skip paths matching the glob. Repeatable.', collect)
    .option('--rule <id>', 'Only run/report this rule. Repeatable.', collect)
    .option('--changed-only', 'Only files changed against base ref.')
    .option('--base <ref>', 'Base ref for --changed-only (default origin/main).')
    .option('-q, --quiet', 'Suppress info/dim lines. Errors and warnings still print.')
    .option('-v, --verbose', 'Verbose progress including per-file parser timing.')
    .option('--no-color', 'Disable ANSI colour even on TTY.')
    .action(async (path: string, options: CheckOptions) => {
      configureColor(options.color === false ? false : 'auto')

      const cwd = options.cwd ? resolve(options.cwd) : process.cwd()
      const targetDir = resolve(cwd, path ?? '.')

      const started = Date.now()
      const format = pickFormat(options)
      const allowProgress = !options.quiet && !options.json && format !== 'github-actions'
      const progress = createProgress({ enabled: allowProgress })

      let configPath: string | null = null
      let repoRoot = targetDir
      try {
        const discovery = await discoverConfig({
          flagPath: options.config ?? null,
          startDir: targetDir,
          cwd,
        })
        configPath = discovery.configPath
        if (discovery.repoRoot) repoRoot = discovery.repoRoot
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        process.stderr.write(`driftlog: ${msg}\n`)
        process.exit(EXIT_USAGE)
      }

      progress.start(`Loading ${configPath ? '.driftlog.yaml' : 'default config'}`)
      const configResult = await loadConfigWithDefaults(repoRoot)
      if (!configResult.success) {
        progress.fail('Config invalid.')
        const lines = configResult.errors
          .map((e) => `  - [${e.code}] ${e.message}`)
          .join('\n')
        process.stderr.write(`driftlog: config invalid:\n${lines}\n`)
        process.exit(EXIT_USAGE)
      }
      const config = configResult.config
      const usingDefaultConfig = configResult.usingDefaults

      let seedFiles: string[] | undefined
      if (options.changedOnly || options.base) {
        try {
          progress.update('Resolving changed files via git diff')
          const result = await changedFilesSince(options.base, repoRoot)
          seedFiles = result.files
        } catch (err) {
          progress.fail('Git diff failed.')
          const msg = err instanceof Error ? err.message : String(err)
          process.stderr.write(`driftlog: ${msg}\n`)
          process.exit(EXIT_USAGE)
        }
      }

      progress.update('Walking files')
      const files = await walkFiles({
        cwd: repoRoot,
        seedFiles,
        includeGlobs: options.include,
        excludeGlobs: options.exclude,
        configIgnorePatterns: config.settings.ignorePatterns,
      })

      if (options.verbose) {
        process.stderr.write(c.dim(`driftlog: walked ${files.length} files\n`))
      }
      progress.update(`Parsing ${files.length} files`)

      const enabledRulesCount = config.rules.filter((r) => r.enabled).length

      const scanResult = await scanRepo(files, {
        orgId: 'cli',
        repoId: 'local',
        repoRoot,
        config,
        usingDefaultConfig,
      })

      progress.update('Applying rules')

      const cliWarnings: CliWarning[] = classifyWarnings(scanResult.warnings)

      const aliases = await detectPathAliases(repoRoot)
      let aliasMatchCount = 0
      if (aliases.hasAliases) {
        for (const file of files) {
          for (const prefix of aliases.aliasPrefixes) {
            const literal = prefix.replace(/\*+$/g, '')
            if (file.content.includes(`from '${literal}`) || file.content.includes(`from "${literal}`)) {
              aliasMatchCount++
              break
            }
          }
        }
        if (aliasMatchCount > 0) {
          cliWarnings.push({
            type: 'unresolved_aliases',
            message:
              `tsconfig.json declares ${aliases.aliasPrefixes.length} path alias prefix(es) and ` +
              `~${aliasMatchCount} scanned files use them. Driftlog does not yet resolve TypeScript ` +
              `path aliases (see https://driftlog.dev/docs/known-limitations); imports that go through ` +
              `an alias may be skipped.`,
          })
        }
      }

      for (const re of scanResult.ruleErrors) {
        cliWarnings.push({
          type: 'rule_error',
          message: `rule '${re.ruleId}' failed: ${re.error}`,
        })
      }

      const filteredViolations = filterViolationsByRule(
        scanResult.violations,
        options.rule,
      )
      const { errorCount, warningCount, infoCount } = counts(filteredViolations)
      const driftScore = computeDriftScoreV1({ errorCount, warningCount, infoCount })

      const parseFailureCount = cliWarnings.filter(
        (w) => w.type === 'parse_failure',
      ).length

      progress.stop()

      const report: CliScanReport = {
        cwd: repoRoot,
        configPath,
        usingDefaultConfig,
        durationMs: Date.now() - started,
        filesScanned: scanResult.scannedFiles,
        skippedFiles: scanResult.skippedFiles,
        rulesApplied: enabledRulesCount,
        violations: filteredViolations,
        warnings: cliWarnings,
        errorCount,
        warningCount,
        infoCount,
        driftScore,
        parseFailureCount,
      }

      if (format === 'json') {
        process.stdout.write(formatJson(report) + '\n')
      } else if (format === 'github-actions') {
        const text = formatGitHubActions(report)
        if (text) process.stdout.write(text)
        await writeStepSummary(report)
      } else {
        if (!options.quiet) {
          process.stdout.write(
            c.dim(
              `Loading ${configPath ?? 'default config'}\n` +
                `Parsing ${files.length} files\n` +
                `Applying ${enabledRulesCount} rules\n`,
            ),
          )
        }
        process.stdout.write(formatHuman(report))
        if (usingDefaultConfig && !options.quiet) {
          process.stdout.write(
            c.dim(
              `\nTip: no .driftlog.yaml found. Run \`driftlog init\` to customise rules for this repo.\n`,
            ),
          )
        }
      }

      let exit: number = EXIT_OK
      if (errorCount > 0) exit = EXIT_VIOLATIONS
      if (exit === EXIT_OK && options.strict && warningCount > 0) exit = EXIT_VIOLATIONS
      if (exit === EXIT_OK && options.strictParse && parseFailureCount > 0) {
        exit = EXIT_VIOLATIONS
      }
      process.exit(exit)
    })
}
