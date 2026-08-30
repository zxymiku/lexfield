import type { CardRecord, ReviewLogRecord, Settings } from './types'
import { cardKeyOf, deserializeCard } from './fsrs'
import type { StorageAdapter } from './storage'

export const EXPORT_VERSION = 1

export interface ExportPayload {
  version: typeof EXPORT_VERSION
  app: 'lexfield'
  exportedAt: number
  settings: Settings
  cards: CardRecord[]
  logs: ReviewLogRecord[]
}

export async function exportData(storage: StorageAdapter): Promise<ExportPayload> {
  const [settings, cards, logs] = await Promise.all([
    storage.getSettings(),
    storage.allCards(),
    storage.allLogs(),
  ])
  return {
    version: EXPORT_VERSION,
    app: 'lexfield',
    exportedAt: Date.now(),
    settings,
    cards,
    logs,
  }
}

export interface ImportOptions {
  /** merge: last-write-wins by updatedAt; replace: wipe local first */
  mode: 'merge' | 'replace'
}

export async function importData(
  storage: StorageAdapter,
  payload: ExportPayload,
  options: ImportOptions = { mode: 'merge' },
): Promise<{ cards: number; logs: number }> {
  if (payload.app !== 'lexfield' || payload.version !== EXPORT_VERSION) {
    throw new Error('unsupported export payload')
  }
  if (options.mode === 'replace') {
    const existing = await storage.allCards()
    await storage.putCards(
      existing.map((c) => ({ ...c, deleted: true, updatedAt: Date.now() })),
    )
  }
  await storage.putSettings(payload.settings)
  const local = await storage.allCards()
  const localKeys = new Map(local.map((c) => [cardKeyOf(c), c]))
  for (const raw of payload.cards) {
    // JSON round-trips turn Date fields into ISO strings - revive them
    const c: CardRecord = { ...raw, fsrs: deserializeCard(raw.fsrs) }
    const existing = localKeys.get(cardKeyOf(c))
    if (!existing || c.updatedAt > existing.updatedAt) {
      localKeys.set(cardKeyOf(c), c)
    }
  }
  const mergedCards = [...localKeys.values()]
  await storage.putCards(mergedCards)
  for (const l of payload.logs) {
    await storage.addLog(l)
  }
  return { cards: payload.cards.length, logs: payload.logs.length }
}
