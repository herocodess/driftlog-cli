import { resolve } from 'node:path'

import type { Command } from 'commander'

import { computeDriftScoreV1, type ViolationCounts } from '@driftlog/types'
import { loadConfigWithDefaults, scanRepo } from '@driftlog/parser'

import { c, configureColor } from '../lib/colors.js'
import { discoverConfig } from '../lib/config-discovery.js'
import { EXIT_OK, EXIT_USAGE } from '../lib/exit-codes.js'
import { walkFiles } from '../lib/file-walker.js'
import { matchesRule } from '../lib/rule-match.js'

type ScoreOptions = {
  config?: string
  cwd?: string
  rule?: string
  window?: string
  json?: boolean
  color?: boolean
}

export function registerScore(program: Command): void {
  program
    .command('score')
    .description('Print the current drift score (0-100).')
    .option('--config <path>', 'Path to .driftlog.yaml.')
    .option('--cwd <dir>', 'Working directory.')
    .option('--rule <id>', 'Score a single rule rather than the whole config.')
    .option(
      '--window <duration>',
      'Trailing window. Accepts 7d/30d/90d. Currently a no-op locally (CLI has no history); reserved for future cloud-aware scoring.',
    )
    .option('--json', 'Emit a JSON document instead of a human-readable line.')
    .option('--no-color', 'Disable ANSI colour.')
    .action(async (options: ScoreOptions) => {
      configureColor(options.color === false ? false : 'auto')

      const cwd = options.cwd ? resolve(options.cwd) : process.cwd()
      let repoRoot = cwd
      let configPath: string | null = null
      try {
        const discovery = await discoverConfig({
          flagPath: options.config ?? null,
          startDir: cwd,
          cwd,
        })
        configPath = discovery.configPath
        if (discovery.repoRoot) repoRoot = discovery.repoRoot
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        process.stderr.write(`driftlog: ${msg}\n`)
        process.exit(EXIT_USAGE)
      }

      const configResult = await loadConfigWithDefaults(repoRoot)
      if (!configResult.success) {
        process.stderr.write(`driftlog: config invalid\n`)
        process.exit(EXIT_USAGE)
      }
      const config = configResult.config

      const files = await walkFiles({
        cwd: repoRoot,
        configIgnorePatterns: config.settings.ignorePatterns,
      })

      const scanResult = await scanRepo(files, {
        orgId: 'cli',
        repoId: 'local',
        repoRoot,
        config,
        usingDefaultConfig: configResult.usingDefaults,
      })

      let violations = scanResult.violations
      if (options.rule) {
        const flag = options.rule
        violations = violations.filter((v) =>
          matchesRule(flag, { id: v.ruleId, type: v.ruleType }),
        )
      }

      const counts: ViolationCounts = { errorCount: 0, warningCount: 0, infoCount: 0 }
      for (const v of violations) {
        if (v.severity === 'error') counts.errorCount++
        else if (v.severity === 'warning') counts.warningCount++
        else counts.infoCount++
      }
      const score = computeDriftScoreV1(counts)

      // Aggregate per-rule violation counts to surface top/weakest rules.
      const perRule = new Map<string, number>()
      for (const v of scanResult.violations) {
        perRule.set(v.ruleId, (perRule.get(v.ruleId) ?? 0) + 1)
      }
      const ranked = [...perRule.entries()].sort((a, b) => a[1] - b[1])
      const topRule = ranked[0]
      const worstRule = ranked.at(-1)

      if (options.json) {
        process.stdout.write(
          JSON.stringify({
            repo: repoRoot,
            score,
            window: options.window ?? null,
            rule: options.rule ?? null,
            counts,
            top_rule: topRule ? { id: topRule[0], violation_count: topRule[1] } : null,
            weakest_rule: worstRule ? { id: worstRule[0], violation_count: worstRule[1] } : null,
            note:
              options.window
                ? 'window is a no-op locally; trailing-window scoring requires cloud history.'
                : null,
          }) + '\n',
        )
        process.exit(EXIT_OK)
      }

      const lines: string[] = []
      lines.push(`Repo: ${repoRoot}`)
      lines.push(c.bold(`Score: ${score}/100`))
      if (topRule) lines.push(`Top rule: ${topRule[0]} (${topRule[1]} violations)`)
      if (worstRule && worstRule !== topRule) {
        lines.push(`Weakest: ${worstRule[0]} (${worstRule[1]} violations)`)
      }
      if (options.window) {
        lines.push(
          c.dim(
            `Note: --window is a no-op for local scans. Trailing-window scoring lives in the cloud product.`,
          ),
        )
      }
      lines.push('')
      lines.push(c.dim(`(config: ${configPath ?? 'defaults'})`))
      process.stdout.write(lines.join('\n') + '\n')
      process.exit(EXIT_OK)
    })
}
