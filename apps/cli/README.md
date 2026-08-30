# LexField CLI

终端版四六级词汇记忆,单文件 Rust 可执行程序(`lexfield.exe`),内置全量词库(编译期嵌入)。

- **调度核心**:官方 `fsrs` crate(fsrs-rs,Anki 同款 FSRS-6)+ 与 Web/Android 一致的学习步骤与负载均衡
- **存储**:`~/.config/lexfield/lexfield.db`(Windows: `%APPDATA%\lexfield`),SQLite,列结构与 Web/Android 同构 → 导出/导入/云同步互通
- **交互**:原始模式单键评分(1-4),多选用字母组合

## 常用命令

```bash
lexfield mix                  # 混合模式(推荐日常)
lexfield learn                # 学习新词
lexfield review               # 复习到期
lexfield stats                # 统计 + 14 天到期预测
lexfield search abandon       # 查词(全部释义)
lexfield tier abandon hard    # 设置单词分级 easy/medium/hard
lexfield tier abandon hard --sense 1   # 只给第 2 个义项定级
lexfield suspend/reset abandon
lexfield config --retention 0.92 --daily-new 20
lexfield export out.json / lexfield import out.json
lexfield sync login https://your-worker user -p pass
lexfield sync run
```
