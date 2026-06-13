import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

/**
 * Detect whether a repo has a tsconfig.json with `compilerOptions.paths`
 * defined. Driftlog's parser does not currently resolve those aliases
 * (Parser Engine known-limitation #4), so the CLI surfaces a warning so
 * users know some imports may not be analysed.
 */
export async function detectPathAliases(cwd: string): Promise<{
  hasAliases: boolean
  aliasPrefixes: string[]
}> {
  const candidates = ['tsconfig.json', 'tsconfig.base.json']
  for (const name of candidates) {
    try {
      const raw = await readFile(resolve(cwd, name), 'utf8')
      const stripped = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
      const parsed = JSON.parse(stripped) as {
        compilerOptions?: { paths?: Record<string, string[]> }
      }
      const paths = parsed.compilerOptions?.paths
      if (paths && Object.keys(paths).length > 0) {
        return { hasAliases: true, aliasPrefixes: Object.keys(paths) }
      }
    } catch {
      // ignore -- file missing or unreadable
    }
  }
  return { hasAliases: false, aliasPrefixes: [] }
}
