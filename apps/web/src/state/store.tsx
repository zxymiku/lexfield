import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  countNewWordsToday,
  JsonVocab,
  SessionRunner,
  State,
  DEFAULT_SETTINGS,
  type Settings,
  type StorageAdapter,
  type VocabEntry,
  type VocabFile,
} from '@lexfield/core'
import { IndexedDbStorage } from '../storage/idb'
import type { VocabFile as VocabFileJson } from '@lexfield/core'
import vocabData from '@lexfield/data/vocab'

export const vocabFile = vocabData as VocabFileJson
export const vocab = new JsonVocab(vocabFile)

/** platform hook: desktop swaps in its SQLite adapter before mounting */
type StorageFactory = () => StorageAdapter
let storageFactory: StorageFactory = () => new IndexedDbStorage()
export function setStorageFactory(factory: StorageFactory) {
  storageFactory = factory
}

export interface Counts {
  due: number
  learning: number
  newRemaining: number
  newIntroducedToday: number
  reviewedToday: number
  /** words already in the study system (word-level card exists) */
  totalSeen: number
}

interface AppStoreValue {
  ready: boolean
  storage: StorageAdapter
  runner: SessionRunner
  settings: Settings
  counts: Counts
  updateSettings: (patch: Partial<Settings>) => Promise<void>
  refresh: () => Promise<void>
}

const AppStoreContext = createContext<AppStoreValue | undefined>(undefined)

const DAY = 86_400_000

export function computeCounts(
  cards: Awaited<ReturnType<StorageAdapter['allCards']>>,
  logs: Awaited<ReturnType<StorageAdapter['allLogs']>>,
  settings: Settings,
  now = Date.now(),
): Counts {
  const startOfDay = new Date(now)
  startOfDay.setHours(0, 0, 0, 0)
  let due = 0
  let learning = 0
  const seen = new Set<string>()
  for (const c of cards) {
    if (c.deleted || c.suspended || c.s !== null) continue
    seen.add(c.w)
    const st = c.fsrs.state
    const dueMs = c.fsrs.due instanceof Date ? c.fsrs.due.getTime() : Number(c.fsrs.due)
    if (st === State.Review && dueMs <= now) due++
    else if ((st === State.Learning || st === State.Relearning) && dueMs <= now) learning++
  }
  const newIntroducedToday = countNewWordsToday(logs, now)
  const remainingByLimit = Math.max(0, settings.dailyNew - newIntroducedToday)
  const totalAvailable = [...vocab.all()].filter(
    (e: VocabEntry) => !seen.has(e.w) && (e.lv & settings.levelFilter) !== 0,
  ).length
  return {
    due,
    learning,
    newRemaining: Math.min(remainingByLimit, totalAvailable),
    newIntroducedToday,
    reviewedToday: logs.filter((l) => l.at >= startOfDay.getTime()).length,
    totalSeen: seen.size,
  }
}

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [storage] = useState<StorageAdapter>(storageFactory)
  const [runner] = useState<SessionRunner>(() => new SessionRunner(storage, vocab, DEFAULT_SETTINGS))
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [booted, setBooted] = useState(false)
  const [counts, setCounts] = useState<Counts>({
    due: 0,
    learning: 0,
    newRemaining: 0,
    newIntroducedToday: 0,
    reviewedToday: 0,
    totalSeen: 0,
  })

  const refresh = useCallback(async () => {
    const s = await storage.getSettings()
    const [cards, logs] = await Promise.all([storage.allCards(), storage.allLogs()])
    setSettings(s)
    setCounts(computeCounts(cards, logs, s))
    setBooted(true)
  }, [storage])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const updateSettings = useCallback(
    async (patch: Partial<Settings>) => {
      const current = await storage.getSettings()
      const next = { ...current, ...patch }
      await storage.putSettings(next)
      setSettings(next)
    },
    [storage],
  )

  const value = useMemo<AppStoreValue>(
    () => ({
      ready: booted,
      storage,
      runner,
      settings,
      counts,
      updateSettings,
      refresh,
    }),
    [booted, storage, runner, settings, counts, updateSettings, refresh],
  )

  return <AppStoreContext.Provider value={value}>{children}</AppStoreContext.Provider>
}

export function useAppStore(): AppStoreValue {
  const ctx = useContext(AppStoreContext)
  if (!ctx) throw new Error('useAppStore outside provider')
  return ctx
}

export function startOfToday(now = Date.now()): number {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export { DAY }
