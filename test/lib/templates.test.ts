import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  detectLanguage,
  isTemplateName,
  readTemplate,
  TEMPLATE_NAMES,
} from '../../src/lib/templates.js'
import { parseConfigString } from '@driftlog/parser'

async function tempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'dl-cli-tmpl-'))
}

describe('templates', () => {
  it('exposes the four documented template names', () => {
    expect([...TEMPLATE_NAMES]).toEqual(['typescript', 'javascript', 'dart', 'mixed'])
  })

  it('isTemplateName accepts valid names and rejects others', () => {
    expect(isTemplateName('typescript')).toBe(true)
    expect(isTemplateName('mixed')).toBe(true)
    expect(isTemplateName('rust')).toBe(false)
    expect(isTemplateName('')).toBe(false)
  })

  for (const name of ['typescript', 'javascript', 'dart', 'mixed'] as const) {
    it(`${name} template validates against the parser schema`, () => {
      const yaml = readTemplate(name)
      const result = parseConfigString(yaml)
      if (!result.success) {
        throw new Error(
          `${name} template failed schema validation: ` +
            result.errors.map((e) => e.message).join('; '),
        )
      }
      expect(result.success).toBe(true)
    })
  }

  describe('detectLanguage', () => {
    it('returns typescript for a TS-only directory', async () => {
      const dir = await tempDir()
      await mkdir(join(dir, 'src'), { recursive: true })
      await writeFile(join(dir, 'src/index.ts'), 'export {}')
      expect(await detectLanguage(dir)).toBe('typescript')
    })

    it('returns dart for a Dart-only directory', async () => {
      const dir = await tempDir()
      await mkdir(join(dir, 'lib'), { recursive: true })
      await writeFile(join(dir, 'lib/main.dart'), 'void main() {}')
      expect(await detectLanguage(dir)).toBe('dart')
    })

    it('returns mixed when both TS and Dart are present', async () => {
      const dir = await tempDir()
      await mkdir(join(dir, 'src'), { recursive: true })
      await mkdir(join(dir, 'lib'), { recursive: true })
      await writeFile(join(dir, 'src/index.ts'), 'export {}')
      await writeFile(join(dir, 'lib/main.dart'), 'void main() {}')
      expect(await detectLanguage(dir)).toBe('mixed')
    })

    it('falls back to typescript for an empty directory', async () => {
      const dir = await tempDir()
      expect(await detectLanguage(dir)).toBe('typescript')
    })
  })
})
