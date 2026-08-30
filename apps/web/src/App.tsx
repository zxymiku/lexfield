import { useCallback, useEffect, useState } from 'react'
import {
  ArkShell,
  ArkToaster,
  IconLearn,
  IconLibrary,
  IconMix,
  IconReview,
  IconSettings,
  IconStats,
  IconToday,
} from '@lexfield/ui'
import { AppStoreProvider, useAppStore } from './state/store'
import { TodayScreen } from './screens/TodayScreen'
import { SessionScreen } from './screens/SessionScreen'
import { LibraryScreen } from './screens/LibraryScreen'
import { StatsScreen } from './screens/StatsScreen'
import { SettingsScreen } from './screens/SettingsScreen'

type Screen = 'today' | 'learn' | 'review' | 'mix' | 'library' | 'stats' | 'settings'

function hashOf(): Screen {
  const h = window.location.hash.replace(/^#\/?/, '') as Screen
  const valid: Screen[] = ['today', 'learn', 'review', 'mix', 'library', 'stats', 'settings']
  return valid.includes(h) ? h : 'today'
}

function Inner() {
  const { ready, counts } = useAppStore()
  const [screen, setScreen] = useState<Screen>(hashOf)

  useEffect(() => {
    const onHash = () => setScreen(hashOf())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const navigate = useCallback((id: string) => {
    window.location.hash = `/${id}`
    setScreen(id as Screen)
  }, [])

  const today = new Date().toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  })

  return (
    <ArkShell
      brand="LEXFIELD"
      code="VOCABULARY OPS / CET-4·6"
      online={counts.due + counts.learning === 0}
      onlineLabel={counts.due + counts.learning === 0 ? 'CLEARED' : 'TASKS OPEN'}
      nav={[
        { id: 'today', label: '今日', en: 'TODAY', icon: <IconToday /> },
        { id: 'learn', label: '学习新词', en: 'LEARN', icon: <IconLearn /> },
        {
          id: 'review',
          label: '复习到期',
          en: 'REVIEW',
          icon: <IconReview />,
          badge: counts.due + counts.learning || undefined,
        },
        { id: 'mix', label: '混合模式', en: 'MIX', icon: <IconMix /> },
        { id: 'library', label: '词库档案', en: 'LIB', icon: <IconLibrary /> },
        { id: 'stats', label: '记忆遥测', en: 'STATS', icon: <IconStats /> },
        { id: 'settings', label: '参数校准', en: 'SETUP', icon: <IconSettings /> },
      ]}
      activeId={screen}
      onNavigate={navigate}
      statusItems={[
        { label: 'DATE', value: today },
        { label: 'DUE', value: String(counts.due + counts.learning) },
        { label: 'NEW', value: String(counts.newRemaining) },
        { label: 'SEEN', value: String(counts.totalSeen) },
      ]}
    >
      {!ready ? (
        <div className="screen">
          <p className="ark-eyebrow">BOOT / 系统启动中</p>
        </div>
      ) : screen === 'today' ? (
        <TodayScreen onNavigate={navigate} />
      ) : screen === 'learn' ? (
        <SessionScreen mode="learn" onExit={() => navigate('today')} />
      ) : screen === 'review' ? (
        <SessionScreen mode="review" onExit={() => navigate('today')} />
      ) : screen === 'mix' ? (
        <SessionScreen mode="mix" onExit={() => navigate('today')} />
      ) : screen === 'library' ? (
        <LibraryScreen />
      ) : screen === 'stats' ? (
        <StatsScreen />
      ) : (
        <SettingsScreen />
      )}
    </ArkShell>
  )
}

export default function App() {
  return (
    <AppStoreProvider>
      <Inner />
      <ArkToaster />
    </AppStoreProvider>
  )
}
