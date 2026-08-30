import type { CardRecord, ReviewLogRecord, Settings } from '@lexfield/core'
import {
  cardKeyOf,
  deserializeCard,
  DEFAULT_SETTINGS,
  type StorageAdapter,
} from '@lexfield/core'
import Database from '@tauri-apps/plugin-sql'

/**
 * SQLite storage adapter via tauri-plugin-sql.
 * Schema mirrors the web IndexedDB layout (JSON columns keep record shapes identical).
 */
export class TauriStorage implements StorageAdapter {
  readonly kind = 'tauri-sqlite'
  private db: Database | null = null
  private ready: Promise<Database> | null = null
  private settingsCache: Settings | undefined

  private open(): Promise<Database> {
    if (!this.ready) {
      this.ready = (async () => {
        const db = await Database.load('sqlite:lexfield.db')
        await db.execute(`
          CREATE TABLE IF NOT EXISTS cards (
            key TEXT PRIMARY KEY,
            updated_at INTEGER NOT NULL,
            json TEXT NOT NULL
          )
        `)
        await db.execute(`
          CREATE TABLE IF NOT EXISTS logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            at INTEGER NOT NULL,
            json TEXT NOT NULL
          )
        `)
        await db.execute('CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL)')
        await db.execute(`CREATE TABLE IF NOT EXISTS settings (k TEXT PRIMARY KEY, v TEXT NOT NULL)`)
        return db
      })()
    }
    return this.ready
  }

  async getSettings(): Promise<Settings> {
    if (this.settingsCache) return this.settingsCache
    const db = await this.open()
    const rows = await db.select<{ v: string }[]>('SELECT v FROM settings WHERE k = ?', ['settings'])
    const merged: Settings = { ...DEFAULT_SETTINGS, ...JSON.parse(rows[0]?.v ?? '{}') }
    this.settingsCache = merged
    return merged
  }

  async putSettings(s: Settings): Promise<void> {
    this.settingsCache = s
    const db = await this.open()
    await db.execute(
      'INSERT INTO settings (k, v) VALUES (?, ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v',
      ['settings', JSON.stringify(s)],
    )
  }

  async allCards(): Promise<CardRecord[]> {
    const db = await this.open()
    const rows = await db.select<{ json: string }[]>('SELECT json FROM cards')
    return rows.map((r) => {
      const { key: _key, ...card } = JSON.parse(r.json)
      return { ...card, fsrs: deserializeCard(card.fsrs) } as CardRecord
    })
  }

  async putCard(c: CardRecord): Promise<void> {
    const db = await this.open()
    await db.execute(
      'INSERT INTO cards (key, updated_at, json) VALUES (?, ?, ?) ON CONFLICT (key) DO UPDATE SET updated_at = excluded.updated_at, json = excluded.json',
      [cardKeyOf(c), c.updatedAt, JSON.stringify(c)],
    )
  }

  async putCards(cards: CardRecord[]): Promise<void> {
    for (const c of cards) await this.putCard(c)
  }

  async addLog(l: ReviewLogRecord): Promise<void> {
    const db = await this.open()
    await db.execute('INSERT INTO logs (at, json) VALUES (?, ?)', [l.at, JSON.stringify(l)])
  }

  async allLogs(): Promise<ReviewLogRecord[]> {
    const db = await this.open()
    const rows = await db.select<{ json: string }[]>('SELECT json FROM logs ORDER BY at')
    return rows.map((r) => JSON.parse(r.json))
  }

  async getMeta<T>(key: string): Promise<T | undefined> {
    const db = await this.open()
    const rows = await db.select<{ v: string }[]>('SELECT v FROM meta WHERE k = ?', [key])
    return rows[0] ? (JSON.parse(rows[0].v) as T) : undefined
  }

  async putMeta(key: string, value: unknown): Promise<void> {
    const db = await this.open()
    await db.execute(
      'INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v',
      [key, JSON.stringify(value ?? null)],
    )
  }
}
