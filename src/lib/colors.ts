import pc from 'picocolors'
import { isCI } from './ci-detection.js'

export type ColorOption = boolean | 'auto'

let colorEnabled = true

export function configureColor(option: ColorOption): void {
  if (option === 'auto') {
    if (process.env.NO_COLOR && process.env.NO_COLOR.length > 0) {
      colorEnabled = false
      return
    }
    if (isCI()) {
      colorEnabled = false
      return
    }
    colorEnabled = Boolean(process.stdout.isTTY)
    return
  }
  colorEnabled = option
}

function maybe(fn: (s: string) => string): (s: string) => string {
  return (s: string) => (colorEnabled ? fn(s) : s)
}

export const c = {
  red: maybe(pc.red),
  yellow: maybe(pc.yellow),
  green: maybe(pc.green),
  dim: maybe(pc.dim),
  bold: maybe(pc.bold),
  cyan: maybe(pc.cyan),
  underline: maybe(pc.underline),
}

export function severityColor(severity: 'error' | 'warning' | 'info'): (s: string) => string {
  if (severity === 'error') return c.red
  if (severity === 'warning') return c.yellow
  return c.dim
}
