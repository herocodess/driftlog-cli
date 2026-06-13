/**
 * The repo has a kebab-vs-snake-case split: rule TYPES in the parser schema
 * are snake_case (`layer_breach`), while built-in rule metadata IDs in
 * @driftlog/types are kebab-case (`layer-breach`). Users see kebab-case in
 * `driftlog rule list` and reasonably try to pass it to `rule test`, etc.
 *
 * This helper accepts either form and tests against both rule.id and
 * rule.type, normalising punctuation in both directions.
 */
function normalize(s: string): string {
  return s.toLowerCase().replace(/[-_]/g, '-')
}

export function matchesRule(
  candidate: string,
  rule: { id: string; type: string },
): boolean {
  const c = normalize(candidate)
  return normalize(rule.id) === c || normalize(rule.type) === c
}

export function knownRuleNames(
  rules: ReadonlyArray<{ id: string; type: string }>,
): string[] {
  const seen = new Set<string>()
  for (const r of rules) {
    seen.add(r.id)
    seen.add(r.type)
    // Also surface the kebab-case form of each type so the error message
    // hints that both spellings work.
    seen.add(r.type.replace(/_/g, '-'))
  }
  return [...seen].sort()
}
