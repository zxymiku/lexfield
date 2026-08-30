import type { VocabEntry, VocabFile } from './types'

export interface VocabProvider {
  all(): Iterable<VocabEntry>
  byWord(w: string): VocabEntry | undefined
}

export class JsonVocab implements VocabProvider {
  private index: Map<string, VocabEntry>
  constructor(file: VocabFile) {
    this.index = new Map(file.words.map((e) => [e.w, e]))
  }
  all(): Iterable<VocabEntry> {
    return this.index.values()
  }
  byWord(w: string): VocabEntry | undefined {
    return this.index.get(w)
  }
}

export interface SenseIndexItem {
  w: string
  i: number
  pos: string
  cn: string
  f: number
}

/** flat pool of every sense of every word - used to sample distractors */
export function buildSensePool(vocab: VocabProvider): SenseIndexItem[] {
  const pool: SenseIndexItem[] = []
  for (const e of vocab.all()) {
    e.s.forEach((s, i) => {
      pool.push({ w: e.w, i, pos: s.pos, cn: s.cn, f: e.f ?? Number.MAX_SAFE_INTEGER })
    })
  }
  return pool
}
