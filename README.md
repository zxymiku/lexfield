# LexField

四六级全量词汇记忆系统 —— 多端(Web / Android / Windows EXE / CLI),Endfield 风格界面,FSRS-6 记忆算法。

> CET-4 & CET-6 complete vocabulary trainer. Web / Android / Windows / CLI, Endfield-style UI, FSRS-6 scheduling.

## 状态

开发中,里程碑通过 PR 逐个交付。

## 技术栈

- **算法**:FSRS-6(`ts-fsrs` / `fsrs-rs` 官方实现)
- **Web**:React 18 + Vite + `@ark-ui/react` + Tailwind,部署 Cloudflare Workers
- **Android**:Kotlin + Jetpack Compose
- **桌面**:Tauri 2(Rust)
- **CLI**:Rust(clap + crossterm)
- **词库**:官方四六级大纲词表 ∪ ECDICT(MIT)全量释义
