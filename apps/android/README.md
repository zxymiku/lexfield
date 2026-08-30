# LexField Android

Kotlin + Jetpack Compose 原生实现(独立于 Web 界面,共享同一套 FSRS-6 语义)。

## 结构

```
app/src/main/java/com/lexfield/app/
├── fsrs/Fsrs.kt          # FSRS-6 移植(21 默认权重与 ts-fsrs 一致;遗忘曲线/间隔/稳定性公式)
├── data/Vocab.kt         # 词库 assets 加载(org.json,零第三方依赖)+ Settings
├── data/Store.kt         # SQLite 存储(卡片/日志/元数据,updatedAt LWW 字段齐备)
├── session/Engine.kt     # 队列(学新/复习/混合)+ 出题引擎(自评/单选/多选)+ 评分落地
├── net/SyncApi.kt        # HttpURLConnection 同步客户端(对接 Cloudflare Worker)
└── ui/                   # Compose Material3,Endfield 暗色(炭黑 + 信号黄 + 验证绿)
```

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
