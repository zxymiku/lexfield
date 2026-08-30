# LexField Desktop(Windows EXE)

Tauri 2 桌面端:**完整复用 Web 版界面**(`apps/web/src`,经 `@app/*` 别名引用),仅把存储层替换为 SQLite(tauri-plugin-sql)。

## 结构

```
apps/desktop/
├── src/main.tsx           # 注入 TauriStorage 后挂载 Web 版 <App/>
├── src/storage/tauri.ts   # StorageAdapter 的 SQLite 实现(与 Web IndexedDB 同构)
└── src-tauri/             # Rust 壳(tauri 2 + sql 插件,NSIS 安装包)
```

## 本地开发

```bash
pnpm install
pnpm --filter @lexfield/desktop tauri dev     # 需要 Rust + WebView2
```

## 构建

```bash
pnpm --filter @lexfield/desktop build          # 前端产物 dist/
pnpm --filter @lexfield/desktop tauri build    # NSIS 安装包
```

CI(`.github/workflows/release.yml`,手动触发)在 windows runner 上完成同样步骤并发布安装包;数据存于 `%APPDATA%/com.lexfield.desktop/lexfield.db`。
