import fg from 'fast-glob'

export type TemplateName = 'typescript' | 'javascript' | 'dart' | 'mixed'

export const TEMPLATE_NAMES: ReadonlyArray<TemplateName> = [
  'typescript',
  'javascript',
  'dart',
  'mixed',
]

export function isTemplateName(value: string): value is TemplateName {
  return (TEMPLATE_NAMES as readonly string[]).includes(value)
}

const TYPESCRIPT = `# .driftlog.yaml
# Driftlog architectural drift detection.
# Docs: https://driftlog.dev/docs/rules
#
# This is the TypeScript starter. Tweak the layers/patterns to match
# your repo, then commit it.

version: '1'

layers:
  - name: ui
    patterns:
      - 'src/components/**'
      - 'src/pages/**'
      - 'src/app/**'
  - name: domain
    patterns:
      - 'src/domain/**'
      - 'src/services/**'
  - name: data
    patterns:
      - 'src/db/**'
      - 'src/api/**'

rules:
  - id: layers
    type: layer_breach
    enabled: true
    severity: error
    config:
      allowedDirections:
        - 'ui -> domain'
        - 'domain -> data'

  - id: no-cycles
    type: circular_dependency
    enabled: true
    severity: error

  # Uncomment to ban specific imports across the repo.
  # - id: no-moment
  #   type: pattern_ban
  #   enabled: true
  #   severity: warning
  #   config:
  #     patterns:
  #       - '^moment$'
  #     message: 'Use date-fns or Temporal instead of moment.'

settings:
  failOn: error
  maxViolationsPerRule: 100
  ignorePatterns:
    - '**/*.test.ts'
    - '**/*.test.tsx'
    - '**/*.spec.ts'
    - '**/node_modules/**'
    - '**/*.d.ts'
    - '**/dist/**'
    - '**/build/**'
`

const JAVASCRIPT = `# .driftlog.yaml
# Driftlog architectural drift detection.
# Docs: https://driftlog.dev/docs/rules

version: '1'

layers:
  - name: ui
    patterns:
      - 'src/components/**'
      - 'src/pages/**'
  - name: domain
    patterns:
      - 'src/domain/**'
      - 'src/services/**'
  - name: data
    patterns:
      - 'src/db/**'
      - 'src/api/**'

rules:
  - id: layers
    type: layer_breach
    enabled: true
    severity: error
    config:
      allowedDirections:
        - 'ui -> domain'
        - 'domain -> data'

  - id: no-cycles
    type: circular_dependency
    enabled: true
    severity: error

settings:
  failOn: error
  maxViolationsPerRule: 100
  ignorePatterns:
    - '**/*.test.js'
    - '**/*.test.jsx'
    - '**/*.spec.js'
    - '**/node_modules/**'
    - '**/dist/**'
    - '**/build/**'
`

const DART = `# .driftlog.yaml
# Driftlog architectural drift detection -- Flutter / Dart starter.
# Docs: https://driftlog.dev/docs/rules

version: '1'

layers:
  - name: presentation
    patterns:
      - 'lib/presentation/**'
      - 'lib/screens/**'
      - 'lib/widgets/**'
  - name: domain
    patterns:
      - 'lib/domain/**'
      - 'lib/usecases/**'
  - name: data
    patterns:
      - 'lib/data/**'
      - 'lib/repositories/**'

rules:
  - id: layers
    type: layer_breach
    enabled: true
    severity: error
    config:
      allowedDirections:
        - 'presentation -> domain'
        - 'domain -> data'

  - id: no-cycles
    type: circular_dependency
    enabled: true
    severity: error

  - id: no-dart-mirrors
    type: pattern_ban
    enabled: true
    severity: error
    config:
      patterns:
        - '^dart:mirrors$'
      message: 'dart:mirrors is not supported in Flutter apps.'

settings:
  failOn: error
  maxViolationsPerRule: 100
  ignorePatterns:
    - '**/*.g.dart'
    - '**/*.pb.dart'
    - '**/*.freezed.dart'
    - '**/*.generated.dart'
    - '**/test/**'
    - '**/build/**'
`

const MIXED = `# .driftlog.yaml
# Driftlog architectural drift detection -- mixed TS + Dart starter.
# Docs: https://driftlog.dev/docs/rules

version: '1'

layers:
  - name: ui
    patterns:
      - 'src/components/**'
      - 'src/pages/**'
      - 'lib/presentation/**'
      - 'lib/screens/**'
  - name: domain
    patterns:
      - 'src/domain/**'
      - 'src/services/**'
      - 'lib/domain/**'
  - name: data
    patterns:
      - 'src/db/**'
      - 'src/api/**'
      - 'lib/data/**'

rules:
  - id: layers
    type: layer_breach
    enabled: true
    severity: error
    config:
      allowedDirections:
        - 'ui -> domain'
        - 'domain -> data'

  - id: no-cycles
    type: circular_dependency
    enabled: true
    severity: error

  - id: no-dart-mirrors
    type: pattern_ban
    enabled: true
    severity: error
    config:
      patterns:
        - '^dart:mirrors$'
      message: 'dart:mirrors is not supported in Flutter apps.'

settings:
  failOn: error
  maxViolationsPerRule: 100
  ignorePatterns:
    - '**/*.test.ts'
    - '**/*.spec.ts'
    - '**/*.g.dart'
    - '**/*.freezed.dart'
    - '**/node_modules/**'
    - '**/dist/**'
    - '**/build/**'
`

export function readTemplate(name: TemplateName): string {
  switch (name) {
    case 'typescript':
      return TYPESCRIPT
    case 'javascript':
      return JAVASCRIPT
    case 'dart':
      return DART
    case 'mixed':
      return MIXED
  }
}

/**
 * Detect the dominant language(s) in a repo by sampling file extensions.
 * Walks the cwd one level deep, then samples up to 100 deeper files.
 */
export async function detectLanguage(cwd: string): Promise<TemplateName> {
  const shallow = await fg(['*.{ts,tsx,js,jsx,dart}', '*/*.{ts,tsx,js,jsx,dart}'], {
    cwd,
    dot: false,
    onlyFiles: true,
    ignore: ['node_modules/**', 'dist/**', 'build/**'],
  })

  let deep: string[] = []
  if (shallow.length < 50) {
    deep = await fg(['**/*.{ts,tsx,js,jsx,dart}'], {
      cwd,
      dot: false,
      onlyFiles: true,
      ignore: ['**/node_modules/**', '**/dist/**', '**/build/**'],
      deep: 5,
    })
    deep = deep.slice(0, 100)
  }

  const sample = new Set([...shallow, ...deep])
  let ts = 0
  let js = 0
  let dart = 0
  for (const path of sample) {
    if (path.endsWith('.ts') || path.endsWith('.tsx')) ts++
    else if (path.endsWith('.js') || path.endsWith('.jsx')) js++
    else if (path.endsWith('.dart')) dart++
  }

  if (ts > 0 && dart > 0) return 'mixed'
  if (dart > 0) return 'dart'
  if (ts > 0) return 'typescript'
  if (js > 0) return 'javascript'
  return 'typescript'
}
