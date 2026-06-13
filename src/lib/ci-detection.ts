import ci from 'ci-info'

export function isCI(): boolean {
  return ci.isCI
}

export function isGitHubActions(): boolean {
  return ci.GITHUB_ACTIONS === true || process.env.GITHUB_ACTIONS === 'true'
}

export function getStepSummaryPath(): string | null {
  const p = process.env.GITHUB_STEP_SUMMARY
  return p && p.length > 0 ? p : null
}
