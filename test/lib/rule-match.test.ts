import { describe, expect, it } from 'vitest'
import { knownRuleNames, matchesRule } from '../../src/lib/rule-match.js'

describe('matchesRule', () => {
  const rule = { id: 'layers', type: 'layer_breach' }

  it('matches the exact id', () => {
    expect(matchesRule('layers', rule)).toBe(true)
  })

  it('matches the exact snake_case type', () => {
    expect(matchesRule('layer_breach', rule)).toBe(true)
  })

  it('matches the kebab-case form of the type', () => {
    expect(matchesRule('layer-breach', rule)).toBe(true)
  })

  it('is case-insensitive', () => {
    expect(matchesRule('Layer-Breach', rule)).toBe(true)
  })

  it('rejects unrelated names', () => {
    expect(matchesRule('forbidden-import', rule)).toBe(false)
  })
})

describe('knownRuleNames', () => {
  it('lists both id, snake type, and kebab type for every rule', () => {
    const names = knownRuleNames([
      { id: 'layers', type: 'layer_breach' },
      { id: 'no-jquery', type: 'pattern_ban' },
    ])
    expect(names).toContain('layers')
    expect(names).toContain('layer_breach')
    expect(names).toContain('layer-breach')
    expect(names).toContain('no-jquery')
    expect(names).toContain('pattern_ban')
    expect(names).toContain('pattern-ban')
  })
})
