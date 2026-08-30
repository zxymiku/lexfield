import type {
  CardRecord,
  ReviewLogRecord,
  Settings,
} from '@lexfield/core'
import { deserializeCard, DEFAULT_SETTINGS, cardKeyOf, type StorageAdapter } from '@lexfield/core'

const DB_NAME = 'lexfield'
const DB_VERSION = 1

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('cards')) {
        db.createObjectStore('cards', { keyPath: 'key' })
      }
      if (!db.objectStoreNames.contains('logs')) {
        db.createObjectStore('logs', { keyPath: 'id', autoIncrement: true })
      }
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'key' })
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function tx<T>(db: IDBDatabase, store: string, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode)
    const s = t.objectStore(store)
    let request: IDBRequest<T> | void
    try {
      request = run(s)
    } catch (err) {
      reject(err)
      return
    }
    t.oncomplete = () => resolve(request && 'result' in request ? request.result : undefined)
    t.onerror = () => reject(t.error)
    t.onabort = () => reject(t.error)
  })
}

/** structuredClone in IDB keeps Dates intact; JSON-sourced records get revived */
function revive(c: CardRecord): CardRecord & { key: string } {
  return { key: cardKeyOf(c), ...c, fsrs: deserializeCard(c.fsrs) }
}

function revivePlain(c: CardRecord): CardRecord {
  return { ...c, fsrs: deserializeCard(c.fsrs) }
}

export class IndexedDbStorage implements StorageAdapter {
  readonly kind = 'indexeddb'
  private db: Promise<IDBDatabase>
  private settingsCache: Settings | undefined

  constructor() {
    this.db = open()
  }

  async getSettings(): Promise<Settings> {
    if (this.settingsCache) return this.settingsCache
    const db = await this.db
    const row = await tx<{ key: string; value: Settings }>(db, 'settings', 'readonly', (s) =>
      s.get('settings'),
    )
    this.settingsCache = { ...DEFAULT_SETTINGS, ...(row?.value ?? {}) }
    return this.settingsCache
  }

  async putSettings(s: Settings): Promise<void> {
    this.settingsCache = s
    const db = await this.db
    await tx(db, 'settings', 'readwrite', (store) => store.put({ key: 'settings', value: s }))
  }

  async allCards(): Promise<CardRecord[]> {
    const db = await this.db
    const rows = (await tx(db, 'cards', 'readonly', (s) => s.getAll())) as unknown as
      | (CardRecord & { key: string })[]
      | undefined
    return (rows ?? []).map(({ key: _key, ...c }) => revivePlain(c))
  }

  async putCard(c: CardRecord): Promise<void> {
    const db = await this.db
    await tx(db, 'cards', 'readwrite', (s) => s.put(revive(c)))
  }

  async putCards(cards: CardRecord[]): Promise<void> {
    if (cards.length === 0) return
    const db = await this.db
    await tx(db, 'cards', 'readwrite', (s) => {
      for (const c of cards) s.put(revive(c))
    })
  }

  async addLog(l: ReviewLogRecord): Promise<void> {
    const db = await this.db
    await tx(db, 'logs', 'readwrite', (s) => s.add(l))
  }

  async allLogs(): Promise<ReviewLogRecord[]> {
    const db = await this.db
    const rows = (await tx(db, 'logs', 'readonly', (s) => s.getAll())) as unknown as
      | ReviewLogRecord[]
      | undefined
    return rows ?? []
  }

  async getMeta<T>(key: string): Promise<T | undefined> {
    const db = await this.db
    const row = await tx<{ key: string; value: T }>(db, 'meta', 'readonly', (s) => s.get(key))
    return row?.value
  }

  async putMeta(key: string, value: unknown): Promise<void> {
    const db = await this.db
    await tx(db, 'meta', 'readwrite', (s) => s.put({ key, value }))
  }
}
