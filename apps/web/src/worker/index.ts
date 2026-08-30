/**
 * LexField sync API on Cloudflare Workers.
 *
 * - /api/*  : auth (register/login, PBKDF2-SHA256) + sync push/pull (D1, LWW merge)
 * - else    : static SPA assets (Workers static assets binding)
 *
 * Schema is created lazily on first API call (CREATE TABLE IF NOT EXISTS),
 * so deployments work without a separate migration step.
 */
import type { Env } from './env'

interface CardRecordLike {
  w: string
  s: number | null
  updatedAt: number
}
interface LogRecordLike {
  at: number
}
interface SettingsLike {
  updatedAt?: number
}

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 180 // 180 days

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    pass_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS cards (
    user_id INTEGER NOT NULL,
    card_key TEXT NOT NULL,
    data TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, card_key)
  )`,
  `CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    data TEXT NOT NULL,
    at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_logs_user_at ON logs (user_id, at)`,
  `CREATE TABLE IF NOT EXISTS user_settings (
    user_id INTEGER PRIMARY KEY,
    data TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
]

let schemaReady = false
async function ensureSchema(db: Env['DB']): Promise<void> {
  if (schemaReady) return
  await db.batch(SCHEMA.map((q) => db.prepare(q)))
  schemaReady = true
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const json = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })

function withCors(res: Response): Response {
  // Tauri/desktop/CLI clients call this API cross-origin; token auth guards writes
  res.headers.set('access-control-allow-origin', '*')
  res.headers.set('access-control-allow-headers', 'authorization, content-type')
  res.headers.set('access-control-allow-methods', 'GET, POST, OPTIONS')
  return res
}

const hex = (buf: ArrayBuffer): string =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')

async function pbkdf2(password: string, saltHex: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, [
    'deriveBits',
  ])
  const salt = new Uint8Array(saltHex.match(/.{2}/g)!.map((h) => parseInt(h, 16)))
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100_000 },
    key,
    256,
  )
  return hex(bits)
}

const newToken = (): string => hex(crypto.getRandomValues(new Uint8Array(32)).buffer)

async function authUser(req: Request, db: Env['DB']): Promise<number | null> {
  const header = req.headers.get('authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!token) return null
  const row = await db
    .prepare('SELECT user_id, expires_at FROM sessions WHERE token = ?')
    .bind(token)
    .first<{ user_id: number; expires_at: number }>()
  if (!row || row.expires_at < Date.now()) return null
  return row.user_id
}

// ---------------------------------------------------------------------------
// routes
// ---------------------------------------------------------------------------

async function handleAuthRegister(req: Request, db: Env['DB']): Promise<Response> {
  const { username, password } = (await req.json()) as { username?: string; password?: string }
  if (!username || !password || password.length < 6) {
    return json({ error: '用户名必填,密码至少 6 位' }, 400)
  }
  await ensureSchema(db)
  const exists = await db.prepare('SELECT id FROM users WHERE username = ?').bind(username).first()
  if (exists) return json({ error: '用户名已存在' }, 409)
  const salt = hex(crypto.getRandomValues(new Uint8Array(16)).buffer)
  const hash = await pbkdf2(password, salt)
  const res = await db
    .prepare('INSERT INTO users (username, pass_hash, salt, created_at) VALUES (?, ?, ?, ?)')
    .bind(username, hash, salt, Date.now())
    .run()
  const user = await db.prepare('SELECT id FROM users WHERE username = ?').bind(username).first<{ id: number }>()
  const token = newToken()
  await db
    .prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)')
    .bind(token, user!.id, Date.now() + SESSION_TTL_MS)
    .run()
  return json({ token, user: username })
}

async function handleAuthLogin(req: Request, db: Env['DB']): Promise<Response> {
  const { username, password } = (await req.json()) as { username?: string; password?: string }
  if (!username || !password) return json({ error: '缺少用户名或密码' }, 400)
  await ensureSchema(db)
  const user = await db
    .prepare('SELECT id, pass_hash, salt FROM users WHERE username = ?')
    .bind(username)
    .first<{ id: number; pass_hash: string; salt: string }>()
  if (!user) return json({ error: '用户名或密码错误' }, 401)
  const hash = await pbkdf2(password, user.salt)
  if (hash !== user.pass_hash) return json({ error: '用户名或密码错误' }, 401)
  const token = newToken()
  await db
    .prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)')
    .bind(token, user.id, Date.now() + SESSION_TTL_MS)
    .run()
  return json({ token, user: username })
}

interface PushBody {
  cards?: CardRecordLike[]
  logs?: LogRecordLike[]
  settings?: SettingsLike | null
}

function cardKeyOf(c: { w: string; s: number | null }): string {
  return c.s === null ? `w:${c.w}` : `s:${c.w}:${c.s}`
}

async function handleSyncPush(req: Request, db: Env['DB'], userId: number): Promise<Response> {
  const body = (await req.json()) as PushBody
  await ensureSchema(db)
  const now = Date.now()
  let accepted = 0
  const stmts: ReturnType<Env['DB']['prepare']>[] = []

  for (const c of body.cards ?? []) {
    if (!c || typeof c.w !== 'string') continue
    stmts.push(
      db
        .prepare(
          `INSERT INTO cards (user_id, card_key, data, updated_at) VALUES (?, ?, ?, ?)
           ON CONFLICT (user_id, card_key) DO UPDATE SET
             data = CASE WHEN excluded.updated_at > cards.updated_at THEN excluded.data ELSE cards.data END,
             updated_at = MAX(excluded.updated_at, cards.updated_at)`,
        )
        .bind(userId, cardKeyOf(c), JSON.stringify(c), c.updatedAt ?? now),
    )
    accepted++
  }

  // individual inserts in chunks - avoids json_each/bind compatibility pitfalls
  const logs = body.logs ?? []
  for (let i = 0; i < logs.length; i += 40) {
    const chunk = logs.slice(i, i + 40)
    for (const l of chunk) {
      stmts.push(
        db.prepare('INSERT INTO logs (user_id, data, at) VALUES (?, ?, ?)').bind(userId, JSON.stringify(l), l.at ?? now),
      )
    }
    accepted += chunk.length
  }

  if (body.settings && typeof body.settings === 'object') {
    stmts.push(
      db
        .prepare(
          `INSERT INTO user_settings (user_id, data, updated_at) VALUES (?, ?, ?)
           ON CONFLICT (user_id) DO UPDATE SET
             data = CASE WHEN excluded.updated_at > user_settings.updated_at THEN excluded.data ELSE user_settings.data END,
             updated_at = MAX(excluded.updated_at, user_settings.updated_at)`,
        )
        .bind(userId, JSON.stringify(body.settings), now),
    )
  }

  if (stmts.length > 0) await db.batch(stmts)
  return json({ serverTime: now, accepted })
}

async function handleSyncPull(req: Request, db: Env['DB'], userId: number): Promise<Response> {
  await ensureSchema(db)
  const url = new URL(req.url)
  const since = Number(url.searchParams.get('since') ?? 0) || 0
  const now = Date.now()

  const cardRows = await db
    .prepare('SELECT data FROM cards WHERE user_id = ? AND updated_at > ?')
    .bind(userId, since)
    .all<{ data: string }>()

  const settingsRow = await db
    .prepare('SELECT data FROM user_settings WHERE user_id = ? AND updated_at > ?')
    .bind(userId, since)
    .first<{ data: string }>()

  return json({
    serverTime: now,
    cards: cardRows.results.map((r) => JSON.parse(r.data)),
    settings: settingsRow ? JSON.parse(settingsRow.data) : undefined,
  })
}

// ---------------------------------------------------------------------------
// worker entry
// ---------------------------------------------------------------------------

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url)

    if (request.method === 'OPTIONS') {
      return withCors(new Response(null, { status: 204 }))
    }

    if (pathname.startsWith('/api/')) {
      try {
        let res: Response
        if (pathname === '/api/auth/register' && request.method === 'POST') {
          res = await handleAuthRegister(request, env.DB)
        } else if (pathname === '/api/auth/login' && request.method === 'POST') {
          res = await handleAuthLogin(request, env.DB)
        } else if (pathname === '/api/sync/push' && request.method === 'POST') {
          const userId = await authUser(request, env.DB)
          if (!userId) res = json({ error: '未登录或会话过期' }, 401)
          else res = await handleSyncPush(request, env.DB, userId)
        } else if (pathname === '/api/sync/pull' && request.method === 'GET') {
          const userId = await authUser(request, env.DB)
          if (!userId) res = json({ error: '未登录或会话过期' }, 401)
          else res = await handleSyncPull(request, env.DB, userId)
        } else if (pathname === '/api/health') {
          res = json({ ok: true, time: Date.now() })
        } else {
          res = json({ error: 'not found' }, 404)
        }
        return withCors(res)
      } catch (err) {
        return withCors(json({ error: `服务内部错误:${(err as Error).message}` }, 500))
      }
    }

    return env.ASSETS.fetch(request)
  },
}
