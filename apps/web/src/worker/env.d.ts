// Minimal Cloudflare Workers type surface used by the sync API.
// Kept local so the app doesn't need the full workers-types package
// (which conflicts with DOM lib in the SPA tsconfig).

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement
  first<T = unknown>(): Promise<T | null>
  run(): Promise<{ success: boolean; meta: { changes: number } }>
  all<T = unknown>(): Promise<{ results: T[] }>
}

interface D1Database {
  prepare(query: string): D1PreparedStatement
  batch(
    statements: D1PreparedStatement[],
  ): Promise<Array<{ success: boolean; meta: { changes: number } }>>
}

export interface Env {
  DB: D1Database
  ASSETS: { fetch(request: Request): Promise<Response> }
}
