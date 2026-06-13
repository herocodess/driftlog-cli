import { access, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import type { Command } from 'commander'

import { c, configureColor } from '../lib/colors.js'
import { EXIT_OK, EXIT_USAGE } from '../lib/exit-codes.js'
import {
  detectLanguage,
  isTemplateName,
  readTemplate,
  TEMPLATE_NAMES,
  type TemplateName,
} from '../lib/templates.js'

type InitOptions = {
  force?: boolean
  template?: string
  yes?: boolean
  color?: boolean
  cwd?: string
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await access(p)
    return true
  } catch {
    return false
  }
}

export function registerInit(program: Command): void {
  program
    .command('init')
    .description('Drop a starter .driftlog.yaml in the current directory.')
    .option('--force', 'Overwrite an existing .driftlog.yaml.')
    .option(
      '--template <name>',
      `Use a specific starter template (${TEMPLATE_NAMES.join(', ')}).`,
    )
    .option('-y, --yes', 'Non-interactive mode (no prompts).')
    .option('--no-color', 'Disable ANSI colour even on a TTY.')
    .option('--cwd <dir>', 'Working directory.')
    .action(async (options: InitOptions) => {
      configureColor(options.color === false ? false : 'auto')

      const cwd = options.cwd ? resolve(options.cwd) : process.cwd()
      const target = resolve(cwd, '.driftlog.yaml')

      let template: TemplateName
      if (options.template) {
        if (!isTemplateName(options.template)) {
          process.stderr.write(
            `driftlog: invalid --template '${options.template}'. ` +
              `Expected one of ${TEMPLATE_NAMES.join(', ')}.\n`,
          )
          process.exit(EXIT_USAGE)
        }
        template = options.template
      } else {
        template = await detectLanguage(cwd)
      }

      const exists = await fileExists(target)
      if (exists && !options.force) {
        process.stderr.write(
          `driftlog: .driftlog.yaml already exists. Use --force to overwrite.\n`,
        )
        process.exit(EXIT_USAGE)
      }

      const yaml = readTemplate(template)
      try {
        await writeFile(target, yaml, 'utf8')
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        process.stderr.write(`driftlog: could not write .driftlog.yaml: ${msg}\n`)
        process.exit(EXIT_USAGE)
      }

      const detectionNote =
        !options.template && template === 'typescript'
          ? c.dim(' (no source files matched a known language; using the TypeScript default)')
          : ''

      process.stdout.write(
        `Created .driftlog.yaml (${c.bold(template)} template).${detectionNote}\n` +
          `Run \`driftlog check ./\` to scan your repo.\n`,
      )
      process.exit(EXIT_OK)
    })
}
