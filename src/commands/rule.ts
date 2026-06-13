import { access, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { BUILT_IN_RULE_METADATA } from '@driftlog/types'
import yaml from 'js-yaml'
import type { Command } from 'commander'

import {
  loadConfigWithDefaults,
  scanRepo,
  type Violation,
} from '@driftlog/parser'
import { computeDriftScoreV1 } from '@driftlog/types'

import { c, configureColor, severityColor } from '../lib/colors.js'
import { discoverConfig } from '../lib/config-discovery.js'
import { EXIT_OK, EXIT_USAGE, EXIT_VIOLATIONS } from '../lib/exit-codes.js'
import { walkFiles } from '../lib/file-walker.js'
import { knownRuleNames, matchesRule } from '../lib/rule-match.js'

type ListOptions = {
  json?: boolean
  config?: string
  color?: boolean
  cwd?: string
}

type RuleRow = {
  id: string
  severity: 'error' | 'warning' | 'info'
  description: string
  source: 'builtin' | 'custom'
}

const VALID_SEVERITIES = new Set(['error', 'warning', 'info'])

function builtInRows(): RuleRow[] {
  return Object.values(BUILT_IN_RULE_METADATA).map((m) => ({
    id: m.id,
    severity: m.defaultSeverity,
    description: m.description,
    source: 'builtin' as const,
  }))
}

function severityFromRule(raw: unknown): 'error' | 'warning' | 'info' {
  if (typeof raw === 'string' && VALID_SEVERITIES.has(raw)) {
    return raw as 'error' | 'warning' | 'info'
  }
  return 'warning'
}

async function readCustomRules(configPath: string | null): Promise<RuleRow[]> {
  if (!configPath) return []
  let raw: string
  try {
    raw = await readFile(configPath, 'utf8')
  } catch {
    throw new Error(`config file not readable: ${configPath}`)
  }
  let parsed: unknown
  try {
    parsed = yaml.load(raw, { maxAliases: 100 } as yaml.LoadOptions)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'invalid YAML'
    throw new Error(`config file malformed: ${msg}`)
  }
  if (!parsed || typeof parsed !== 'object') return []
  const rules = (parsed as { rules?: unknown }).rules
  if (!Array.isArray(rules)) return []
  const builtinIds = new Set(Object.keys(BUILT_IN_RULE_METADATA))
  const rows: RuleRow[] = []
  for (const r of rules) {
    if (!r || typeof r !== 'object') continue
    const obj = r as Record<string, unknown>
    const id = typeof obj.id === 'string' ? obj.id : null
    if (!id) continue
    if (builtinIds.has(id)) continue
    rows.push({
      id,
      severity: severityFromRule(obj.severity),
      description:
        typeof obj.name === 'string' && obj.name.length > 0
          ? obj.name
          : 'Custom rule defined in .driftlog.yaml.',
      source: 'custom',
    })
  }
  return rows
}

function renderHuman(builtins: RuleRow[], custom: RuleRow[]): string {
  const ruleIdWidth = Math.max(
    ...[...builtins, ...custom].map((r) => r.id.length),
    8,
  )
  const sevWidth = 7
  function line(row: RuleRow): string {
    const id = c.bold(row.id.padEnd(ruleIdWidth))
    const sev = severityColor(row.severity)(row.severity.padEnd(sevWidth))
    return `${id}  ${sev}  ${row.description}`
  }
  const out: string[] = []
  for (const r of builtins) out.push(line(r))
  if (custom.length > 0) {
    out.push('')
    out.push(c.dim('# Custom rules (from .driftlog.yaml)'))
    for (const r of custom) out.push(line(r))
  }
  return out.join('\n') + '\n'
}

type NewRuleAlias = 'layer' | 'forbidden' | 'boundary' | 'cycle' | 'module' | 'pattern'

const RULE_ALIASES: Record<NewRuleAlias, { type: string; starter: Record<string, unknown> }> = {
  layer: {
    type: 'layer_breach',
    starter: { allowedDirections: ['ui -> domain', 'domain -> data'] },
  },
  forbidden: {
    type: 'forbidden_import',
    starter: {
      patterns: ['^lodash$'],
      message: 'Replace with native ES features or a lighter alternative.',
    },
  },
  boundary: {
    type: 'boundary_crossing',
    starter: {
      boundaries: [{ from: 'src/billing/**', to: 'src/checkout/**' }],
      bidirectional: false,
    },
  },
  cycle: { type: 'circular_dependency', starter: {} },
  module: {
    type: 'module_isolation',
    starter: {
      modules: ['src/features/*/'],
      allowedExports: ['index.ts'],
      applyTo: ['import', 'dynamic'],
    },
  },
  pattern: {
    type: 'pattern_ban',
    starter: {
      patterns: ['^moment$'],
      message: 'Use date-fns or Temporal instead.',
      applyTo: ['import', 'dynamic'],
      caseSensitive: true,
    },
  },
}

function isAlias(value: string): value is NewRuleAlias {
  return value in RULE_ALIASES
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p)
    return true
  } catch {
    return false
  }
}

function renderTraceLine(v: Violation, ruleIdWidth: number): string {
  const sev = severityColor(v.severity)(v.severity.padEnd(7))
  const id = c.bold(v.ruleId.padEnd(ruleIdWidth))
  return `${sev}  ${id}  ${v.filePath}:${v.line}:${v.column}  ${v.message}`
}

export function registerRule(program: Command): void {
  const rule = program
    .command('rule')
    .description('Manage rules in the config.')

  rule
    .command('list')
    .description('Print every rule with its scope and severity.')
    .option('--json', 'Emit JSON instead of human-readable output.')
    .option('--config <path>', 'Use this config file (bypasses discovery).')
    .option('--no-color', 'Disable ANSI colour even on a TTY.')
    .option('--cwd <dir>', 'Working directory for config resolution.')
    .action(async (options: ListOptions) => {
      configureColor(options.color === false ? false : 'auto')

      const cwd = options.cwd ? resolve(options.cwd) : process.cwd()
      let configPath: string | null = null
      try {
        const discovery = await discoverConfig({
          flagPath: options.config ?? null,
          startDir: cwd,
          cwd,
        })
        configPath = discovery.configPath
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        process.stderr.write(`driftlog: ${msg}\n`)
        process.exit(EXIT_USAGE)
      }

      const builtins = builtInRows()
      let custom: RuleRow[]
      try {
        custom = await readCustomRules(configPath)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        process.stderr.write(`driftlog: ${msg}\n`)
        process.exit(EXIT_USAGE)
      }

      if (options.json) {
        const payload = [...builtins, ...custom].map((r) => ({
          id: r.id,
          severity: r.severity,
          description: r.description,
          source: r.source,
        }))
        process.stdout.write(JSON.stringify(payload) + '\n')
        process.exit(EXIT_OK)
      }

      process.stdout.write(renderHuman(builtins, custom))
      process.exit(EXIT_OK)
    })

  rule
    .command('new <type>')
    .description(
      `Append a starter rule to .driftlog.yaml. Type is one of: ${Object.keys(RULE_ALIASES).join(', ')}.`,
    )
    .option('--id <id>', 'Custom rule id. Defaults to <type>[-n].')
    .option('--severity <level>', 'error | warning | info', 'warning')
    .option('--config <path>', 'Path to .driftlog.yaml. Default: cwd.')
    .option('--cwd <dir>', 'Working directory.')
    .option('--no-color', 'Disable ANSI colour.')
    .action(
      async (
        type: string,
        options: {
          id?: string
          severity?: string
          config?: string
          cwd?: string
          color?: boolean
        },
      ) => {
        configureColor(options.color === false ? false : 'auto')

        if (!isAlias(type)) {
          process.stderr.write(
            `driftlog: invalid rule type '${type}'. Expected one of ${Object.keys(RULE_ALIASES).join(', ')}.\n`,
          )
          process.exit(EXIT_USAGE)
        }

        const cwd = options.cwd ? resolve(options.cwd) : process.cwd()
        const target = options.config
          ? resolve(cwd, options.config)
          : resolve(cwd, '.driftlog.yaml')

        if (!(await pathExists(target))) {
          process.stderr.write(
            `driftlog: ${target} does not exist. Run \`driftlog init\` first.\n`,
          )
          process.exit(EXIT_USAGE)
        }

        const raw = await readFile(target, 'utf8')
        let parsed: Record<string, unknown>
        try {
          parsed = (yaml.load(raw, { maxAliases: 100 } as yaml.LoadOptions) ?? {}) as Record<string, unknown>
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'invalid YAML'
          process.stderr.write(`driftlog: config malformed: ${msg}\n`)
          process.exit(EXIT_USAGE)
        }
        if (!Array.isArray(parsed.rules)) parsed.rules = []

        const alias = RULE_ALIASES[type]
        const existingIds = new Set(
          (parsed.rules as Array<Record<string, unknown>>)
            .map((r) => (typeof r.id === 'string' ? r.id : null))
            .filter((s): s is string => Boolean(s)),
        )
        let id = options.id
        if (!id) {
          id = type
          let n = 2
          while (existingIds.has(id)) {
            id = `${type}-${n}`
            n++
          }
        }
        if (existingIds.has(id)) {
          process.stderr.write(`driftlog: rule id '${id}' already exists.\n`)
          process.exit(EXIT_USAGE)
        }

        const severity = severityFromRule(options.severity)
        const newRule: Record<string, unknown> = {
          id,
          type: alias.type,
          enabled: true,
          severity,
        }
        if (Object.keys(alias.starter).length > 0) {
          newRule.config = alias.starter
        }
        ;(parsed.rules as unknown[]).push(newRule)

        const dumped = yaml.dump(parsed, { lineWidth: 100, noRefs: true })
        await writeFile(target, dumped, 'utf8')
        process.stdout.write(
          `Added ${c.bold(id)} (${alias.type}) to ${target}.\n` +
            c.dim('Note: YAML comments may have been reformatted by the writer.\n'),
        )
        process.exit(EXIT_OK)
      },
    )

  rule
    .command('test <id>')
    .description('Run a single rule against the repo with verbose tracing.')
    .option('--config <path>', 'Path to .driftlog.yaml.')
    .option('--cwd <dir>', 'Working directory.')
    .option('--no-color', 'Disable ANSI colour.')
    .action(
      async (
        id: string,
        options: { config?: string; cwd?: string; color?: boolean },
      ) => {
        configureColor(options.color === false ? false : 'auto')

        const cwd = options.cwd ? resolve(options.cwd) : process.cwd()
        let repoRoot = cwd
        try {
          const discovery = await discoverConfig({
            flagPath: options.config ?? null,
            startDir: cwd,
            cwd,
          })
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

        const known = config.rules.some((r) => matchesRule(id, r))
        if (!known) {
          process.stderr.write(
            `driftlog: rule '${id}' not found in active config. Known: ${knownRuleNames(config.rules).join(', ')}\n`,
          )
          process.exit(EXIT_USAGE)
        }

        const files = await walkFiles({
          cwd: repoRoot,
          configIgnorePatterns: config.settings.ignorePatterns,
        })

        const started = Date.now()
        const scanResult = await scanRepo(files, {
          orgId: 'cli',
          repoId: 'local',
          repoRoot,
          config,
          usingDefaultConfig: configResult.usingDefaults,
        })

        const filtered = scanResult.violations.filter((v) =>
          matchesRule(id, { id: v.ruleId, type: v.ruleType }),
        )

        process.stdout.write(
          c.dim(
            `Tested rule '${id}' against ${scanResult.scannedFiles} files in ${
              Date.now() - started
            }ms.\n\n`,
          ),
        )

        if (filtered.length === 0) {
          process.stdout.write(c.bold('No violations for this rule.\n'))
        } else {
          const widest = Math.max(...filtered.map((v) => v.ruleId.length), 6)
          for (const v of filtered) {
            process.stdout.write(renderTraceLine(v, widest) + '\n')
          }
        }

        const errorCount = filtered.filter((v) => v.severity === 'error').length
        const warningCount = filtered.filter((v) => v.severity === 'warning').length
        const infoCount = filtered.filter((v) => v.severity === 'info').length
        const score = computeDriftScoreV1({ errorCount, warningCount, infoCount })
        process.stdout.write(
          `\n${filtered.length} total — ` +
            `${errorCount} errors, ${warningCount} warnings, ${infoCount} info. ` +
            `Rule score: ${score}/100\n`,
        )

        process.exit(filtered.some((v) => v.severity === 'error') ? EXIT_VIOLATIONS : EXIT_OK)
      },
    )
}
