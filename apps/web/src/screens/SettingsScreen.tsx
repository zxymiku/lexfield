import { useRef, useState } from 'react'
import {
  DEFAULT_SETTINGS,
  exportData,
  importData,
  syncOnce,
  SyncClient,
  SyncError,
  TIERS,
  type Mode,
  type Settings,
  type Tier,
} from '@lexfield/core'
import {
  ArkButton,
  ArkDialog,
  ArkPanel,
  ArkSection,
  ArkSelect,
  ArkSliderRow,
  ArkSwitchRow,
  notify,
} from '@lexfield/ui'
import { useAppStore } from '../state/store'

export function SettingsScreen() {
  const { storage, settings, updateSettings, refresh } = useAppStore()
  const [confirmReset, setConfirmReset] = useState(false)
  const [syncUser, setSyncUser] = useState(settings.syncUser ?? '')
  const [syncPass, setSyncPass] = useState('')
  const [syncUrl, setSyncUrl] = useState(settings.syncUrl ?? '')
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const patch = (p: Partial<Settings>) => void updateSettings(p)

  const doExport = async () => {
    const payload = await exportData(storage)
    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `lexfield-export-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
    notify().success('已导出学习数据')
  }

  const doImport = async (file: File) => {
    try {
      const payload = JSON.parse(await file.text())
      const res = await importData(storage, payload, { mode: 'merge' })
      await refresh()
      notify().success(`导入完成:卡片 ${res.cards} · 日志 ${res.logs}`)
    } catch (err) {
      notify().error(`导入失败:${(err as Error).message}`)
    }
  }

  const doReset = async () => {
    const cards = await storage.allCards()
    await storage.putCards(cards.map((c) => ({ ...c, deleted: true, updatedAt: Date.now() })))
    await updateSettings({ ...DEFAULT_SETTINGS })
    await refresh()
    setConfirmReset(false)
    notify().success('已清空本地学习数据')
  }

  const auth = async (mode: 'login' | 'register') => {
    if (!syncUrl || !syncUser || !syncPass) {
      notify().error('请填写服务器地址、用户名与密码')
      return
    }
    setBusy(true)
    try {
      const client = new SyncClient(syncUrl)
      const res =
        mode === 'login'
          ? await client.login(syncUser, syncPass)
          : await client.register(syncUser, syncPass)
      client.setToken(res.token)
      await updateSettings({ syncUrl, syncUser, syncToken: res.token })
      notify().success(mode === 'login' ? '登录成功' : '注册成功,已自动登录')
    } catch (err) {
      notify().error(err instanceof SyncError ? err.message : `请求失败:${(err as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  const doSync = async () => {
    if (!settings.syncUrl || !settings.syncToken) {
      notify().error('请先登录同步服务')
      return
    }
    setBusy(true)
    try {
      const client = new SyncClient(settings.syncUrl, settings.syncToken)
      const res = await syncOnce(client, storage)
      await refresh()
      notify().success(`同步完成:推送 ${res.pushed} · 拉取 ${res.pulled}`)
    } catch (err) {
      notify().error(err instanceof SyncError ? err.message : `同步失败:${(err as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  const doLogout = async () => {
    await updateSettings({ syncToken: undefined })
    notify().info('已退出登录(仅清除本机凭据)')
  }

  return (
    <div className="screen">
      <ArkSection index="05" en="CALIBRATION" ghost="05">
        参数校准
      </ArkSection>

      <div className="settings">
        <ArkPanel code="SCHED / 调度" title="FSRS 调度参数" tone="paper">
          <ArkSliderRow
            label="目标记忆率(中等难度基准)"
            value={settings.baseRetention}
            min={0.8}
            max={0.97}
            step={0.01}
            format={(v) => `${Math.round(v * 100)}%`}
            onChange={(v) => patch({ baseRetention: v })}
          />
          <ArkSliderRow
            label="分级记忆率偏移(困难 +Δ / 简单 −Δ)"
            value={settings.tierRetentionDelta}
            min={0}
            max={0.1}
            step={0.01}
            format={(v) => `±${Math.round(v * 100)}%`}
            onChange={(v) => patch({ tierRetentionDelta: v })}
          />
          <ArkSliderRow
            label="每日新词上限"
            value={settings.dailyNew}
            min={0}
            max={60}
            step={1}
            onChange={(v) => patch({ dailyNew: v })}
          />
          <ArkSliderRow
            label="每日总评分上限(0 = 不限)"
            value={settings.dailyLimit}
            min={0}
            max={300}
            step={10}
            onChange={(v) => patch({ dailyLimit: v })}
          />
          <ArkSelect
            label="默认模式"
            value={settings.mode}
            onChange={(v) => patch({ mode: v as Mode })}
            options={[
              { label: '混合(推荐)', value: 'mix' },
              { label: '学习新词', value: 'learn' },
              { label: '复习到期', value: 'review' },
            ]}
          />
          <ArkSliderRow
            label="混合模式新词占比"
            value={settings.mixRatio}
            min={0}
            max={1}
            step={0.05}
            format={(v) => `${Math.round(v * 100)}%`}
            onChange={(v) => patch({ mixRatio: v })}
          />
          <ArkSelect
            label="学习范围"
            value={String(settings.levelFilter)}
            onChange={(v) => patch({ levelFilter: Number(v) as Settings['levelFilter'] })}
            options={[
              { label: '四级 + 六级', value: '3' },
              { label: '仅四级', value: '1' },
              { label: '仅六级', value: '2' },
            ]}
          />
          <ArkSelect
            label="新词顺序"
            value={settings.newOrder}
            onChange={(v) => patch({ newOrder: v as Settings['newOrder'] })}
            options={[
              { label: '词频(常用优先)', value: 'frequency' },
              { label: '字母序', value: 'alphabetical' },
              { label: '词表序', value: 'file' },
            ]}
          />
        </ArkPanel>

        <ArkPanel code="TIER / 分级" title="分级权重与上限" tone="paper">
          <p className="dimtext">
            困难词权重更高 → 出现更频繁;配合更高目标记忆率,间隔更短。
          </p>
          {TIERS.map((tier) => (
            <ArkSliderRow
              key={tier}
              label={`权重 · ${tierName(tier)}`}
              value={settings.tierWeights[tier]}
              min={0}
              max={6}
              step={0.5}
              onChange={(v) => patch({ tierWeights: { ...settings.tierWeights, [tier]: v } })}
            />
          ))}
          {TIERS.map((tier) => (
            <ArkSliderRow
              key={`${tier}-cap`}
              label={`每日出现上限 · ${tierName(tier)}(0 = 不限)`}
              value={settings.tierDailyCaps[tier]}
              min={0}
              max={100}
              step={5}
              onChange={(v) => patch({ tierDailyCaps: { ...settings.tierDailyCaps, [tier]: v } })}
            />
          ))}
        </ArkPanel>

        <ArkPanel code="QUEST / 出题" title="出题引擎" tone="paper">
          <ArkSliderRow
            label="自评卡权重"
            value={settings.questionWeights.self}
            min={0}
            max={1}
            step={0.1}
            onChange={(v) => patch({ questionWeights: { ...settings.questionWeights, self: v } })}
          />
          <ArkSliderRow
            label="单选题权重"
            value={settings.questionWeights.choice}
            min={0}
            max={1}
            step={0.1}
            onChange={(v) => patch({ questionWeights: { ...settings.questionWeights, choice: v } })}
          />
          <ArkSliderRow
            label="多选题权重"
            value={settings.questionWeights.multi}
            min={0}
            max={1}
            step={0.1}
            onChange={(v) => patch({ questionWeights: { ...settings.questionWeights, multi: v } })}
          />
          <ArkSliderRow
            label="每次展示义项数(0 = 全部)"
            value={settings.sensesPerShow}
            min={0}
            max={4}
            step={1}
            onChange={(v) => patch({ sensesPerShow: v })}
          />
          <ArkSliderRow
            label="单选选项数"
            value={settings.choiceOptions}
            min={3}
            max={6}
            step={1}
            onChange={(v) => patch({ choiceOptions: v })}
          />
          <ArkSliderRow
            label="多选选项数"
            value={settings.multiOptions}
            min={4}
            max={8}
            step={1}
            onChange={(v) => patch({ multiOptions: v })}
          />
        </ArkPanel>

        <ArkPanel code="SYNC / 云同步" title="跨设备同步(可选)" tone="paper">
          <label className="ark-field">
            <span className="ark-field__label">服务器地址</span>
            <input
              className="ark-input"
              placeholder="https://lexfield-api.example.workers.dev"
              value={syncUrl}
              onChange={(e) => setSyncUrl(e.target.value)}
            />
          </label>
          <label className="ark-field">
            <span className="ark-field__label">用户名</span>
            <input
              className="ark-input"
              value={syncUser}
              onChange={(e) => setSyncUser(e.target.value)}
              autoComplete="username"
            />
          </label>
          <label className="ark-field">
            <span className="ark-field__label">密码</span>
            <input
              className="ark-input"
              type="password"
              value={syncPass}
              onChange={(e) => setSyncPass(e.target.value)}
              autoComplete="current-password"
            />
          </label>
          <div className="settings__row">
            <ArkButton size="sm" disabled={busy} onClick={() => void auth('login')}>
              登录
            </ArkButton>
            <ArkButton size="sm" disabled={busy} onClick={() => void auth('register')}>
              注册
            </ArkButton>
            <ArkButton size="sm" variant="signal" disabled={busy} onClick={() => void doSync()}>
              立即同步
            </ArkButton>
            {settings.syncToken ? (
              <ArkButton size="sm" variant="ghost" onClick={() => void doLogout()}>
                退出登录
              </ArkButton>
            ) : null}
          </div>
          <p className="dimtext">
            {settings.syncToken ? '已登录 · ' : '未登录 · '}
            学习进度本地优先,云同步按 updatedAt 合并,多端可共用账号。
          </p>
        </ArkPanel>

        <ArkPanel code="DATA / 数据" title="导出 / 导入 / 重置" tone="paper">
          <div className="settings__row">
            <ArkButton size="sm" onClick={() => void doExport()}>
              导出 JSON
            </ArkButton>
            <ArkButton size="sm" onClick={() => fileRef.current?.click()}>
              导入 JSON
            </ArkButton>
            <input
              ref={fileRef}
              type="file"
              accept="application/json"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void doImport(f)
                e.target.value = ''
              }}
            />
            <ArkButton size="sm" variant="inverse" onClick={() => setConfirmReset(true)}>
              重置全部数据
            </ArkButton>
          </div>
          <p className="dimtext">导出内容:卡片状态(含义项级)+ 全部评分日志 + 设置。</p>
        </ArkPanel>
      </div>

      <ArkDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title="重置全部学习数据?"
        description="所有卡片(含义项级)与评分日志将被标记删除,设置恢复默认。此操作不可撤销——建议先导出备份。"
      >
        <div className="settings__row">
          <ArkButton onClick={() => setConfirmReset(false)}>取消</ArkButton>
          <ArkButton variant="signal" onClick={() => void doReset()}>
            确认重置
          </ArkButton>
        </div>
      </ArkDialog>
    </div>
  )
}

function tierName(t: Tier): string {
  return t === 'easy' ? '简单' : t === 'hard' ? '困难' : '中等'
}
