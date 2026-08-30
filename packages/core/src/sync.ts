import type { CardRecord, ReviewLogRecord, Settings } from './types'
import { cardKeyOf } from './fsrs'

export interface AuthResponse {
  token: string
  user: string
}

export interface PushPayload {
  cards: CardRecord[]
  logs: ReviewLogRecord[]
  settings?: Settings
}

export interface PullResponse {
  serverTime: number
  cards: CardRecord[]
  settings?: Settings
}

export interface PushResponse {
  serverTime: number
  accepted: number
}

export class SyncError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message)
  }
}

export class SyncClient {
  constructor(
    private baseUrl: string,
    private token?: string,
    private fetchImpl: typeof fetch = fetch,
  ) {}

  setToken(token: string | undefined) {
    this.token = token
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    let res: Response
    try {
      res = await this.fetchImpl(this.baseUrl + path, {
        ...init,
        headers: {
          'content-type': 'application/json',
          ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
          ...init?.headers,
        },
      })
    } catch (err) {
      throw new SyncError(`network error: ${(err as Error).message}`)
    }
    if (!res.ok) {
      let detail = ''
      try {
        detail = (await res.text()).slice(0, 200)
      } catch {
        /* ignore */
      }
      throw new SyncError(`HTTP ${res.status} ${detail}`, res.status)
    }
    return (await res.json()) as T
  }

  register(username: string, password: string) {
    return this.request<AuthResponse>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    })
  }

  login(username: string, password: string) {
    return this.request<AuthResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    })
  }

  push(payload: PushPayload) {
    return this.request<PushResponse>('/api/sync/push', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  }

  pull(since: number) {
    return this.request<PullResponse>(`/api/sync/pull?since=${since}`)
  }
}

/** last-write-wins merge of pulled cards into the local map; returns updated list */
export function mergePulledCards(
  local: CardRecord[],
  incoming: CardRecord[],
): { merged: CardRecord[]; applied: number } {
  const byKey = new Map(local.map((c) => [cardKeyOf(c), c]))
  let applied = 0
  for (const c of incoming) {
    const key = cardKeyOf(c)
    const existing = byKey.get(key)
    if (!existing || c.updatedAt > existing.updatedAt) {
      byKey.set(key, c)
      applied++
    }
  }
  return { merged: [...byKey.values()], applied }
}

/** full two-way sync pass: push local changes since lastSync, pull everything after it */
export async function syncOnce(
  client: SyncClient,
  storage: import('./storage').StorageAdapter,
  now = Date.now(),
): Promise<{ pushed: number; pulled: number; serverTime: number }> {
  const lastSync = (await storage.getMeta<number>('lastSyncAt')) ?? 0
  const [cards, logs] = await Promise.all([storage.allCards(), storage.allLogs()])
  const sinceCards = cards.filter((c) => c.updatedAt > lastSync)
  const sinceLogs = logs.filter((l) => l.at > lastSync)
  const settings = await storage.getSettings()

  const pushRes = await client.push({
    cards: sinceCards,
    logs: sinceLogs,
    settings: settings.syncToken ? settings : undefined,
  })

  const pullRes = await client.pull(lastSync)
  if (pullRes.cards.length > 0) {
    const { merged, applied } = mergePulledCards(cards, pullRes.cards)
    if (applied > 0) await storage.putCards(merged)
  }
  const serverTime = Math.max(pushRes.serverTime, pullRes.serverTime)
  await storage.putMeta('lastSyncAt', serverTime)
  return {
    pushed: sinceCards.length + sinceLogs.length,
    pulled: pullRes.cards.length,
    serverTime,
  }
}
