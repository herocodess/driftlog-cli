export const EXIT_OK = 0
export const EXIT_VIOLATIONS = 1
export const EXIT_USAGE = 2

export type ExitCode = typeof EXIT_OK | typeof EXIT_VIOLATIONS | typeof EXIT_USAGE
