import { Command } from 'commander'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { registerFix } from '../../src/commands/fix.js'

type Captured = { stdout: string; exitCode: number | undefined }

function runFix(args: string[]): Captured {
  const program = new Command()
    .name('driftlog')
    .exitOverride()
    .configureOutput({
      writeOut: (s) => captured.stdout.concat(s),
      writeErr: (s) => captured.stdout.concat(s),
    })

  const captured: Captured = { stdout: '', exitCode: undefined }

  registerFix(program)

  const writeSpy = vi
    .spyOn(process.stdout, 'write')
    .mockImplementation((chunk: string | Uint8Array) => {
      captured.stdout += typeof chunk === 'string' ? chunk : chunk.toString()
      return true
    })

  const exitSpy = vi
    .spyOn(process, 'exit')
    .mockImplementation(((code?: number) => {
      captured.exitCode = code ?? 0
      throw new Error(`__exit_${code ?? 0}__`)
    }) as never)

  try {
    program.parse(['node', 'driftlog', ...args])
  } catch (err) {
    if (!(err instanceof Error) || !err.message.startsWith('__exit_')) {
      throw err
    }
  } finally {
    writeSpy.mockRestore()
    exitSpy.mockRestore()
  }

  return captured
}

describe('driftlog fix (v1.0.0 placeholder)', () => {
  beforeEach(() => {
    process.env.NO_COLOR = '1'
  })
  afterEach(() => {
    delete process.env.NO_COLOR
  })

  it('exits 0 with the coming-soon message', () => {
    const { stdout, exitCode } = runFix(['fix'])
    expect(exitCode).toBe(0)
    expect(stdout).toContain('v1.1')
    expect(stdout).toContain('driftlog.dev/changelog')
  })

  it('accepts every documented flag as a no-op without parse errors', () => {
    const { stdout, exitCode } = runFix([
      'fix',
      '--dry-run',
      '--yes',
      '--rule',
      'layer-breach',
      '--config',
      '.driftlog.yaml',
      '--cwd',
      '.',
      '--json',
      '--quiet',
      '--verbose',
      'src/',
    ])
    expect(exitCode).toBe(0)
    expect(stdout).toContain('v1.1')
    expect(stdout).toContain('driftlog.dev/changelog')
  })

  it('--help lists every documented flag', () => {
    const program = new Command().exitOverride()
    registerFix(program)

    let helpText = ''
    try {
      program.parse(['node', 'driftlog', 'fix', '--help'])
    } catch {
      // commander throws on --help when exitOverride() is set
    }

    helpText = program.commands.find((c) => c.name() === 'fix')?.helpInformation() ?? ''

    expect(helpText).toContain('--dry-run')
    expect(helpText).toContain('--yes')
    expect(helpText).toContain('--rule')
    expect(helpText).toContain('--config')
    expect(helpText).toContain('--cwd')
    expect(helpText).toContain('--json')
    expect(helpText).toContain('--quiet')
    expect(helpText).toContain('--verbose')
    expect(helpText).toContain('--no-color')
  })

  it('--rule can be repeated without tripping the parser', () => {
    const { stdout, exitCode } = runFix([
      'fix',
      '--rule',
      'layer-breach',
      '--rule',
      'forbidden-import',
    ])
    expect(exitCode).toBe(0)
    expect(stdout).toContain('v1.1')
  })
})
