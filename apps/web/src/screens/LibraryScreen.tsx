import { useMemo, useState } from 'react'
import {
  State,
  cardKeyOf,
  formatSense,
  type CardRecord,
  type Tier,
  type VocabEntry,
} from '@lexfield/core'
import {
  ArkButton,
  ArkDialog,
  ArkSelect,
  ArkTierChip,
  ArkTip,
  IconSearch,
  ArkSection,
} from '@lexfield/ui'
import { useAppStore, vocab } from '../state/store'
import { WordCard, speak } from '../components/WordCard'

type StatusFilter = 'all' | 'new' | 'learning' | 'review'
const PAGE = 40

export function LibraryScreen() {
  const { storage, runner, refresh } = useAppStore()
  const [query, setQuery] = useState('')
  const [level, setLevel] = useState('0')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [sort, setSort] = useState('frequency')
  const [page, setPage] = useState(0)
  const [detail, setDetail] = useState<VocabEntry | null>(null)
  const [cards, setCards] = useState<CardRecord[]>([])

  useMemo(() => {
    void storage.allCards().then(setCards)
  }, [storage, detail])

  const cardByWord = useMemo(() => {
    const map = new Map<string, CardRecord>()
    for (const c of cards) {
      if (c.s === null && !c.deleted) map.set(c.w, c)
    }
    return map
  }, [cards])

  const statusOf = (w: string): StatusFilter => {
    const c = cardByWord.get(w)
    if (!c) return 'new'
    if (c.fsrs.state === State.Review) return 'review'
    if (c.fsrs.state === State.New) return 'new'
    return 'learning'
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    let list = [...vocab.all()] as VocabEntry[]
    if (q) list = list.filter((e) => e.w.toLowerCase().includes(q))
    if (level !== '0') {
      const lv = Number(level)
      list = list.filter((e) => (e.lv & lv) !== 0)
    }
    if (status !== 'all') list = list.filter((e) => statusOf(e.w) === status)
    if (sort === 'alphabetical') list.sort((a, b) => a.w.localeCompare(b.w, 'en'))
    else if (sort === 'zFrequency') list.sort((a, b) => (b.f ?? 0) - (a.f ?? 0))
    else list.sort((a, b) => (a.f ?? Number.MAX_SAFE_INTEGER) - (b.f ?? Number.MAX_SAFE_INTEGER))
    return list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, level, status, sort, cards])

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE))
  const pageItems = filtered.slice(page * PAGE, page * PAGE + PAGE)

  const detailCard = detail ? cardByWord.get(detail.w) : undefined
  const senseCards =
    detail && cards.filter((c) => c.w === detail.w && c.s !== null && !c.deleted)

  const setWordTier = async (tier: Tier) => {
    if (!detail) return
    await runner.ensureWordCard(detail.w)
    await runner.setWordTier(detail.w, tier)
    setCards(await storage.allCards())
  }

  const setSenseTier = async (senseIdx: number, tier: Tier) => {
    if (!detail) return
    await runner.ensureWordCard(detail.w)
    await runner.setTier({ w: detail.w, s: senseIdx }, tier)
    setCards(await storage.allCards())
  }

  return (
    <div className="screen">
      <ArkSection index="03" total="04" en="ARCHIVE" ghost="03">
        词库档案
      </ArkSection>

      <div className="libbar">
        <label className="libbar__search">
          <IconSearch width={16} height={16} />
          <input
            className="ark-input"
            placeholder="搜索单词…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setPage(0)
            }}
            aria-label="搜索单词"
          />
        </label>
        <ArkSelect
          label="级别"
          value={level}
          onChange={(v) => {
            setLevel(v)
            setPage(0)
          }}
          options={[
            { label: '全部', value: '0' },
            { label: 'CET-4', value: '1' },
            { label: 'CET-6', value: '2' },
            { label: 'CET-4+6', value: '3' },
          ]}
        />
        <ArkSelect
          label="状态"
          value={status}
          onChange={(v) => {
            setStatus(v as StatusFilter)
            setPage(0)
          }}
          options={[
            { label: '全部', value: 'all' },
            { label: '新词', value: 'new' },
            { label: '学习中', value: 'learning' },
            { label: '记忆中', value: 'review' },
          ]}
        />
        <ArkSelect
          label="排序"
          value={sort}
          onChange={(v) => {
            setSort(v)
            setPage(0)
          }}
          options={[
            { label: '词频(常用优先)', value: 'frequency' },
            { label: '词频(罕见优先)', value: 'zFrequency' },
            { label: '字母序', value: 'alphabetical' },
          ]}
        />
      </div>

      <p className="libbar__meta">
        <span className="ark-chip">
          <span className="ark-chip__label">MATCH</span>
          <span className="ark-chip__value ark-num">{filtered.length}</span>
        </span>
        <span className="ark-eyebrow">
          PAGE {page + 1} / {pages}
        </span>
      </p>

      <table className="ark-table">
        <thead>
          <tr>
            <th>WORD</th>
            <th>音标</th>
            <th>释义(全部义项首两条)</th>
            <th>FREQ</th>
            <th>分级</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {pageItems.map((e) => {
            const c = cardByWord.get(e.w)
            return (
              <tr key={e.w}>
                <td>
                  <button type="button" className="libword" onClick={() => setDetail(e)}>
                    {e.w}
                  </button>
                </td>
                <td className="dimtext">{e.p ?? '—'}</td>
                <td className="dimtext libword__senses">
                  {e.s.slice(0, 2).map((s, i) => (
                    <span key={i}>{formatSense(s)};</span>
                  ))}
                  {e.s.length > 2 ? ` +${e.s.length - 2}` : ''}
                </td>
                <td className="ark-num">{e.f ?? '—'}</td>
                <td>
                  <span className="ark-tier" data-tier={c?.tier ?? 'medium'}>
                    <i aria-hidden="true" />
                    {c?.tier === 'easy' ? '简单' : c?.tier === 'hard' ? '困难' : '中等'}
                  </span>
                </td>
                <td>
                  <ArkButton size="sm" variant="ghost" onClick={() => setDetail(e)}>
                    详情
                  </ArkButton>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <div className="pager">
        <ArkButton size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
          ← 上一页
        </ArkButton>
        <ArkButton
          size="sm"
          disabled={page >= pages - 1}
          onClick={() => setPage((p) => p + 1)}
        >
          下一页 →
        </ArkButton>
      </div>

      <ArkDialog
        open={detail !== null}
        onOpenChange={(o) => !o && setDetail(null)}
        title={detail?.w ?? ''}
        description={detail?.p}
      >
        {detail ? (
          <div className="libdetail">
            <WordCard entry={detail} tier={detailCard?.tier ?? 'medium'} onTier={(t) => void setWordTier(t)} />

            <h4 className="ark-eyebrow">SENSE TIERS · 义项分级(每个汉语意思可单独定级)</h4>
            <ul className="libdetail__senses">
              {detail.s.map((s, i) => {
                const sc = senseCards?.find((c) => c.s === i)
                return (
                  <li key={i}>
                    <span className="libdetail__sense">
                      {s.pos ? <em>{s.pos}</em> : null}
                      {s.cn}
                    </span>
                    <span className="libdetail__tiers" role="group" aria-label={`义项 ${i + 1} 分级`}>
                      {(['easy', 'medium', 'hard'] as const).map((t) => (
                        <ArkTierChip
                          key={t}
                          tier={t}
                          active={(sc?.tier ?? 'medium') === t}
                          onClick={() => void setSenseTier(i, t)}
                        />
                      ))}
                    </span>
                  </li>
                )
              })}
            </ul>

            <div className="libdetail__ops">
              <ArkTip label="暂停后不再进入调度队列">
                <ArkButton
                  size="sm"
                  onClick={async () => {
                    await runner.ensureWordCard(detail.w)
                    const c = cardByWord.get(detail.w)
                    await runner.setSuspended({ w: detail.w, s: null }, !c?.suspended)
                    setCards(await storage.allCards())
                  }}
                >
                  {cardByWord.get(detail.w)?.suspended ? '恢复 RESUME' : '挂起 SUSPEND'}
                </ArkButton>
              </ArkTip>
              <ArkTip label="清除该词的记忆状态,回到全新词">
                <ArkButton
                  size="sm"
                  variant="inverse"
                  onClick={async () => {
                    await runner.ensureWordCard(detail.w)
                    await runner.reset({ w: detail.w, s: null })
                    setCards(await storage.allCards())
                    void refresh()
                  }}
                >
                  重置 RESET
                </ArkButton>
              </ArkTip>
              <ArkTip label={cardByWord.get(detail.w) ? `调度键 ${cardKeyOf({ w: detail.w, s: null })}` : '尚未进入学习'}>
                <ArkButton size="sm" variant="ghost" onClick={() => speak(detail.w)}>
                  朗读 SAY
                </ArkButton>
              </ArkTip>
            </div>
          </div>
        ) : null}
      </ArkDialog>
    </div>
  )
}
