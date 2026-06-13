import ora, { type Ora } from 'ora'
import { isCI } from './ci-detection.js'

export type Progress = {
  start(text: string): void
  update(text: string): void
  succeed(text?: string): void
  fail(text?: string): void
  stop(): void
}

const NOOP: Progress = {
  start() {},
  update() {},
  succeed() {},
  fail() {},
  stop() {},
}

export function createProgress(opts: { enabled: boolean }): Progress {
  if (!opts.enabled) return NOOP
  if (!process.stderr.isTTY) return NOOP
  if (isCI()) return NOOP

  let spinner: Ora | null = null
  return {
    start(text: string) {
      spinner = ora({ text, stream: process.stderr }).start()
    },
    update(text: string) {
      if (spinner) spinner.text = text
    },
    succeed(text?: string) {
      if (spinner) spinner.succeed(text)
      spinner = null
    },
    fail(text?: string) {
      if (spinner) spinner.fail(text)
      spinner = null
    },
    stop() {
      if (spinner) spinner.stop()
      spinner = null
    },
  }
}
