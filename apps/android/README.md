# LexField Android

Kotlin + Jetpack Compose 原生实现(独立于 Web 界面,共享同一套 FSRS-6 语义)。

## 结构

```
app/src/main/java/com/lexfield/app/
├── fsrs/Fsrs.kt          # FSRS-6 移植(21 默认权重与 ts-fsrs 一致;遗忘曲线/间隔/稳定性公式)
├── data/Vocab.kt         # 词库 assets 加载(org.json,零第三方依赖)+ Settings(含小组件换词周期)
├── data/Store.kt         # SQLite 存储(卡片/日志/元数据,updatedAt LWW 字段齐备)
├── session/Engine.kt     # 队列(学新/复习/混合)+ 出题引擎(自评/单选/多选)+ 评分落地
├── net/SyncApi.kt        # HttpURLConnection 同步客户端(对接 Cloudflare Worker)
├── widget/WordWidget.kt  # Glance 桌面小组件:困难分级/曾答错词池,每小时或每天确定性换词
└── ui/                   # Compose Material3,Endfield 暗色(炭黑 + 信号黄 + 验证绿)
```

## 桌面小组件

- 词池:**困难分级**或**曾答错**(复习中按"忘记"过,lapses ≥ 1)的单词;词池为空时回退到学习中的词,再回退到全词库
- 换词:设置里选 **每小时一换**(系统 `updatePeriodMillis=1h` 刷新)或 **每天一换**(按日期种子,同一天稳定显示同一个词);点击组件打开 App
- 词的选取用 `now / 周期` 作随机种子,确定性换词,系统多次刷新也不会同一周期内跳词

## 构建与发布

本仓库不含 Gradle Wrapper 二进制;CI(`.github/workflows/release.yml`,手动触发)通过
`gradle-actions/setup-gradle` 安装 Gradle 8.10.2 后执行 `gradle assembleDebug assembleRelease`:

- `app-debug.apk`:debug 签名,可直接安装
- `app-release-unsigned.apk`:未签名,需自行签名后安装

本地构建需要 JDK 17 + Android SDK(compileSdk 35):

```bash
cd apps/android
gradle assembleDebug
```
