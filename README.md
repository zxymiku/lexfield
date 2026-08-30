# LexField

四六级**全量**词汇记忆系统 —— Web / Android / Windows EXE / CLI 四端,Endfield 风格界面,FSRS-6 记忆算法。

> CET-4 & CET-6 **complete** outline vocabulary (8,728 words, all POS senses) with FSRS-6 scheduling, per-word & per-sense difficulty tiers, single/multi-choice questions, and Endfield-style UI.

## 功能总览

- **记忆算法**:FSRS-6(Anki 同款官方实现)——连续答对自动降频延后,答错自动加频;参数可个性化
- **手动分级**:单词与每个汉语义项可单独标 简单/中等/困难,不同分级有不同的目标记忆率、出现权重与每日上限(越困难出现越频繁)
- **出题引擎**:自评卡 / 单选 / 多选,义项随机拆分,干扰项按词性 + 词频邻近度自动采样
- **三种模式**:学习新词 / 复习到期 / 混合(到期优先 + 新词按比例),每日上限与负载均衡
- **多端**:Web(PWA 离线可用)/ Android / Windows / CLI,进度本地优先 + 可选云同步 + 导出导入

## 目录结构

```
├── apps/
│   ├── web/        # Web 版(Vite SPA + 同步 API Worker,部署 Cloudflare Workers)
│   ├── android/    # Android 版(Kotlin + Jetpack Compose)
│   ├── desktop/    # Windows EXE(Tauri 2,复用 Web 界面)
│   └── cli/        # CLI(Rust,fsrs-rs)
├── packages/
│   ├── core/       # 领域核心:FSRS 封装 / 出题引擎 / 队列 / 存储契约 / 同步客户端
│   ├── ui/         # Endfield 设计系统(data-ark-theme=endfield, depth=maximal)
│   └── data/       # 词库 ETL + 全量词库 JSON(8,728 词)
└── .github/workflows/release.yml   # 手动触发:编译 Android/EXE/CLI 并发布 Release
```

## 快速开始(Web 版)

```bash
corepack enable          # 启用 pnpm(或 npm i -g pnpm)
pnpm install
pnpm web:dev             # http://localhost:5173
pnpm web:build           # 产物在 apps/web/dist
```

## Cloudflare 部署(Web 版自动部署)

Web 版 = SPA(静态资产)+ 同步 API(同一个 Worker),推送到 GitHub 后由 **Workers Builds** 自动构建部署:

1. **Fork/推送本仓库到你的 GitHub**(已由 `gh` CLI 创建时跳过)。
2. Cloudflare Dashboard → **Workers & Pages → Create → Import a repository**,选择本仓库:
   - **Production branch**:`main`
   - **Build command**:`corepack enable && pnpm install --frozen-lockfile && pnpm --filter @lexfield/web build`
   - **Deploy command**:`npx wrangler deploy -c apps/web/wrangler.jsonc`
   - **Root directory**:留空(仓库根)
   - ⚠️ Worker 名称需与 `apps/web/wrangler.jsonc` 里的 `name` 一致(默认 `lexfield`)
3. 创建 D1 数据库:Dashboard → Storage & Databases → D1 → Create(名字 `lexfield`),把生成的 `database_id` 填入 `apps/web/wrangler.jsonc` 的 `REPLACE_WITH_YOUR_D1_DATABASE_ID`。
   - 数据库 schema 会在第一次调用 API 时自动创建,无需手动迁移。
4. 之后每次 push 到 `main` 都会自动重新部署;PR 分支会产生预览版本。

> 不需要云同步时,`database_id` 可不填——静态 SPA 仍正常工作,只是同步 API 返回错误。

## Android / Windows EXE / CLI(手动 Release)

`.github/workflows/release.yml` 为**手动触发**(workflow_dispatch):

1. GitHub 仓库页 → Actions → **Release (Android / EXE / CLI)** → Run workflow
2. 输入版本标签(如 `v0.1.0`)与构建范围后运行:
   - **`auto`(默认)**:对比上个 release tag 以来的变更,**只重新编译有改动的产物**——例如只改了 Android 就只出 APK,其余不重复编译
   - 也可强制指定 `android` / `desktop` / `cli` / `all`
3. 编译完成后自动发布 GitHub Release 并上传产物;Release 说明由 GitHub 自动生成(commit 列表 + 贡献者)

### Actions 计费优化(私有仓库按分钟计费:Linux 1x / Windows 2x)

- 变更检测跑在最便宜的 Linux 运行器上,命中不了的产物整条流水线直接跳过
- EXE 与 CLI 合并在**同一个** Windows 任务里,共享 Rust 工具链与构建缓存,省掉一整次 2x 运行器开销
- 所有任务设 `timeout-minutes` 上限,防止异常挂起持续计费;中间 artifact 只保留 1 天(Release 中已有正式产物)
- Rust/Gradle/pnpm 缓存跨运行复用:Windows 冷构建约 20 分钟,命中缓存后约 5–8 分钟
- 提示:仓库转为 **public** 后 GitHub Actions 完全免费(注意词库数据的协议注意事项)

## 记忆算法(FSRS-6)

- 官方实现:GUI 端 `ts-fsrs`,CLI 端 `fsrs-rs`,Android 端为按规范移植的 Kotlin 实现(单测对照 ts-fsrs 测试向量)
- 连续答对 → 稳定性指数增长 → 间隔变长 → **出现频率自动下降**;答错 → 稳定性骤降 → 短间隔重排
- 手动分级(简单/中等/困难)→ 目标记忆率 0.85/0.90/0.95 → 困难词间隔更短、抽样权重更高
- 到期日负载均衡:长间隔在 ±1~2 天窗口内落到最空闲的一天
- 全量评分日志已持久化,后续可用 `@open-spaced-repetition/binding` / fsrs-rs 优化器个性化参数

## 词库数据

成员 = 官方四级大纲(4,615 词)∪ 官方六级大纲 ∪ ECDICT cet4/cet6 标签,共 **8,728 词**;全部词性义项、英英释义、音标、词形变化、词频来自 [ECDICT](https://github.com/skywind3000/ECDICT)(MIT)。

> ⚠️ 官方大纲词表来源仓库未声明开源协议,词库数据仅供个人学习研究使用,请勿商用。详见 `packages/data/README.md`。

## 开发命令

```bash
pnpm data:build                        # 重建词库 ETL(平时无需,产物已入库)
pnpm --filter @lexfield/core test      # 核心算法测试(vitest)
pnpm --filter @lexfield/ui typecheck
pnpm web:build
pnpm --filter @lexfield/web deploy     # 手动部署到 Cloudflare(可选)
```
