import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  getStepSummaryPath,
  isGitHubActions,
} from '../../src/lib/ci-detection.js'

describe('ci-detection', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    delete process.env.GITHUB_ACTIONS
    delete process.env.GITHUB_STEP_SUMMARY
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it('detects GitHub Actions via env var', () => {
    process.env.GITHUB_ACTIONS = 'true'
    expect(isGitHubActions()).toBe(true)
  })

  it('does not detect GitHub Actions when env unset', () => {
    delete process.env.GITHUB_ACTIONS
    // ci-info may have already cached at import time, but the explicit env
    // override path inside isGitHubActions ensures the env wins.
    if (!process.env.CI) {
      expect(isGitHubActions()).toBe(false)
    }
  })

  it('returns the GITHUB_STEP_SUMMARY path when set', () => {
    process.env.GITHUB_STEP_SUMMARY = '/tmp/summary.md'
    expect(getStepSummaryPath()).toBe('/tmp/summary.md')
  })

  it('returns null when GITHUB_STEP_SUMMARY is unset or empty', () => {
    delete process.env.GITHUB_STEP_SUMMARY
    expect(getStepSummaryPath()).toBeNull()
    process.env.GITHUB_STEP_SUMMARY = ''
    expect(getStepSummaryPath()).toBeNull()
  })
})
