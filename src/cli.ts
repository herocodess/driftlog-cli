import { Command } from 'commander'

import { registerCheck } from './commands/check.js'
import { registerCi } from './commands/ci.js'
import { registerFix } from './commands/fix.js'
import { registerInit } from './commands/init.js'
import { registerRule } from './commands/rule.js'
import { registerScore } from './commands/score.js'
import { EXIT_USAGE } from './lib/exit-codes.js'

const VERSION = '1.0.0'

function buildProgram(): Command {
  const program = new Command()
    .name('driftlog')
    .description('Architectural drift detection for your codebase.')
    .version(VERSION, '--version', 'Print the CLI version.')
    .helpOption('-h, --help', 'Display help for a command.')
    .addHelpText('after', '\nLearn more: https://driftlog.dev/docs/cli\n')
    .configureOutput({
      writeErr: (str) => process.stderr.write(str),
    })

  registerCheck(program)
  registerFix(program)
  registerInit(program)
  registerScore(program)
  registerCi(program)
  registerRule(program)

  return program
}

export async function run(argv: string[]): Promise<void> {
  const program = buildProgram()
  try {
    await program.parseAsync(argv)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    process.stderr.write(`driftlog: ${msg}\n`)
    process.exit(EXIT_USAGE)
  }
}

if (process.env.NODE_ENV !== 'test') {
  run(process.argv)
}
