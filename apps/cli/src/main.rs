mod engine;
mod session_ui;
mod store;
mod sync;
mod vocab;

use clap::{Parser, Subcommand, ValueEnum};
use store::{AppSettings, CardState, Store, DAY_MS};
use vocab::Vocab;

#[derive(Parser)]
#[command(name = "lexfield", version, about = "四六级全量词汇记忆 · FSRS-6 · 终端版")]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Clone, Copy, ValueEnum)]
enum Mode {
    Learn,
    Review,
    Mix,
}

impl Mode {
    fn as_str(&self) -> &'static str {
        match self {
            Mode::Learn => "learn",
            Mode::Review => "review",
            Mode::Mix => "mix",
        }
    }
}

#[derive(Subcommand)]
enum Commands {
    /// 学习新词
    Learn {
        #[arg(short, long, default_value_t = 0, help = "覆盖每日新词上限(0 = 用设置)")]
        n: u32,
    },
    /// 复习到期卡片
    Review,
    /// 混合模式(到期优先 + 新词按比例)
    Mix,
    /// 统计概览
    Stats,
    /// 搜索单词并查看全部释义
    Search { query: String },
    /// 设置单词(或 --sense 指定义项)分级
    Tier {
        word: String,
        level: String,
        #[arg(long)]
        sense: Option<usize>,
    },
    /// 挂起/恢复单词
    Suspend { word: String },
    /// 重置单词记忆状态
    Reset { word: String },
    /// 修改设置
    Config {
        #[arg(long)] retention: Option<f64>,
        #[arg(long)] daily_new: Option<u32>,
        #[arg(long)] mix_ratio: Option<f64>,
        #[arg(long, help = "学习范围: 1 四级 / 2 六级 / 3 全部")] level: Option<i32>,
    },
    /// 导出学习数据 JSON
    Export { #[arg(default_value = "lexfield-export.json")] path: String },
    /// 导入学习数据 JSON(按 updatedAt 合并)
    Import { path: String },
    /// 云同步(注册/登录/执行)
    Sync {
        #[command(subcommand)]
        action: SyncAction,
    },
}

#[derive(Subcommand)]
enum SyncAction {
    Register { url: String, user: String, #[arg(short = 'p')] password: String },
    Login { url: String, user: String, #[arg(short = 'p')] password: String },
    Run,
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

fn main() {
    let cli = Cli::parse();
    if let Err(e) = run(cli) {
        eprintln!("错误:{e:#}");
        std::process::exit(1);
    }
}

fn run(cli: Cli) -> anyhow::Result<()> {
    let store = Store::open()?;
    let vocab = Vocab::embedded();
    match cli.command {
        Commands::Learn { n } => {
            if n > 0 {
                let mut s: AppSettings = store.get_settings();
                s.daily_new = n;
                store.put_settings(&s)?;
            }
            session_ui::run_session("learn", &store, &vocab, now_ms)?;
        }
        Commands::Review => session_ui::run_session("review", &store, &vocab, now_ms)?,
        Commands::Mix => session_ui::run_session("mix", &store, &vocab, now_ms)?,
        Commands::Stats => stats(&store, &vocab)?,
        Commands::Search { query } => search(&store, &vocab, &query)?,
        Commands::Tier { word, level, sense } => {
            let tier = store::Tier::parse(&level).ok_or_else(|| anyhow::anyhow!("分级应为 easy/medium/hard"))?;
            let now = now_ms();
            engine::ensure_word_card(&store, &word, now);
            match sense {
                Some(i) => engine::set_sense_tier(&store, &word, i, tier, now),
                None => engine::set_tier_all(&store, &word, tier, now),
            }
            println!("已设置 {}{} 分级:{}", word, sense.map(|i| format!(" 义项{}", i + 1)).unwrap_or_default(), tier.label());
        }
        Commands::Suspend { word } => {
            let now = now_ms();
            engine::set_suspended(&store, &word, true, now);
            println!("已挂起 {word}(挂起的词不进入调度;再次执行以恢复)");
        }
        Commands::Reset { word } => {
            let now = now_ms();
            engine::reset_card(&store, &word, now);
            println!("已重置 {word} 的记忆状态");
        }
        Commands::Config { retention, daily_new, mix_ratio, level } => {
            let mut s = store.get_settings();
            if let Some(v) = retention {
                s.base_retention = v.clamp(0.80, 0.97);
            }
            if let Some(v) = daily_new {
                s.daily_new = v;
            }
            if let Some(v) = mix_ratio {
                s.mix_ratio = v.clamp(0.0, 1.0);
            }
            if let Some(v) = level {
                s.level_filter = v;
            }
            store.put_settings(&s)?;
            println!(
                "已保存:retention {:.0}% · dailyNew {} · mix {:.0}% · level {}",
                s.base_retention * 100.0,
                s.daily_new,
                s.mix_ratio * 100.0,
                s.level_filter
            );
        }
        Commands::Export { path } => {
            let payload = serde_json::json!({
                "version": 1,
                "app": "lexfield",
                "exportedAt": now_ms(),
                "settings": store.get_settings(),
                "cards": store.all_cards(),
                "logs": store.all_logs(),
            });
            std::fs::write(&path, serde_json::to_string(&payload)?)?;
            println!("已导出到 {path}");
        }
        Commands::Import { path } => {
            let raw = std::fs::read_to_string(&path)?;
            let payload: serde_json::Value = serde_json::from_str(&raw)?;
            if payload.get("app").and_then(|v| v.as_str()) != Some("lexfield") {
                anyhow::bail!("不是 LexField 导出文件");
            }
            let mut applied = 0usize;
            let local = store.all_cards();
            for raw_card in payload.get("cards").and_then(|v| v.as_array()).cloned().unwrap_or_default() {
                let mut card: store::Card = serde_json::from_value(raw_card)?;
                if let Some(existing) = local.iter().find(|c| c.key() == card.key()) {
                    if card.updated_at <= existing.updated_at {
                        continue;
                    }
                }
                store.put_card(&card)?;
                applied += 1;
            }
            for log in payload.get("logs").and_then(|v| v.as_array()).cloned().unwrap_or_default() {
                if let Some(at) = log.get("at").and_then(|v| v.as_i64()) {
                    let l: store::ReviewLog = serde_json::from_value(log)?;
                    store.add_log(&l)?;
                    let _ = at;
                }
            }
            println!("导入完成:更新 {applied} 张卡片");
        }
        Commands::Sync { action } => match action {
            SyncAction::Register { url, user, password } => {
                let (token, _) = sync::SyncClient::register(&url, &user, &password)?;
                let mut s = store.get_settings();
                s.sync_url = url;
                s.sync_user = user;
                s.sync_token = token;
                store.put_settings(&s)?;
                println!("注册成功,已保存凭据");
            }
            SyncAction::Login { url, user, password } => {
                let (token, _) = sync::SyncClient::login(&url, &user, &password)?;
                let mut s = store.get_settings();
                s.sync_url = url;
                s.sync_user = user;
                s.sync_token = token;
                store.put_settings(&s)?;
                println!("登录成功,已保存凭据");
            }
            SyncAction::Run => {
                let s = store.get_settings();
                if s.sync_url.is_empty() || s.sync_token.is_empty() {
                    anyhow::bail!("请先 lexfield sync login <url> <user> -p <password>");
                }
                let client = sync::SyncClient::new(&s.sync_url, &s.sync_token);
                let (pushed, pulled) = client.sync(&store)?;
                println!("同步完成:推送 {pushed} · 拉取 {pulled}");
            }
        },
    }
    Ok(())
}

fn stats(store: &Store, vocab: &Vocab) -> anyhow::Result<()> {
    let now = now_ms();
    let cards = store.all_cards();
    let mut new = 0u32;
    let mut learning = 0u32;
    let mut due = 0u32;
    let mut mature = 0u32;
    let mut seen = std::collections::HashSet::new();
    let mut forecast: std::collections::BTreeMap<i64, u32> = Default::default();
    for c in cards.iter().filter(|c| c.s.is_none() && !c.suspended) {
        seen.insert(c.w.clone());
        match c.state {
            CardState::New => new += 1,
            CardState::Learning | CardState::Relearning => learning += 1,
            CardState::Review => {
                if c.due <= now {
                    due += 1;
                }
                if c.stability >= 21.0 {
                    mature += 1;
                }
                let day = c.due / DAY_MS - now / DAY_MS;
                if (0..14).contains(&day) {
                    *forecast.entry(day).or_insert(0) += 1;
                }
            }
        }
    }
    println!("词库 {} 词 · 已入列 {}", vocab.len(), seen.len());
    println!("新词 {new} · 学习中 {learning} · 到期 {due} · 巩固(≥21天) {mature}");
    println!("未来 14 天到期:");
    for day in 0..14 {
        let count = forecast.get(&day).copied().unwrap_or(0);
        let bar = "█".repeat(count.min(40) as usize);
        println!("  {:>2}天后 {:>3} {bar}", day, count);
    }
    Ok(())
}

fn search(store: &Store, vocab: &Vocab, query: &str) -> anyhow::Result<()> {
    let q = query.to_lowercase();
    let hits: Vec<_> = vocab
        .all()
        .iter()
        .filter(|e| e.w.to_lowercase().contains(&q))
        .take(20)
        .collect();
    if hits.is_empty() {
        println!("未找到匹配的词。");
        return Ok(());
    }
    let cards = store.all_cards();
    for e in hits {
        let tier = cards
            .iter()
            .find(|c| c.w == e.w && c.s.is_none())
            .map(|c| c.tier.label())
            .unwrap_or("未学");
        println!("{} /{}/ [{}] · {}", e.w, e.p.as_deref().unwrap_or(""), e.level_label(), tier);
        for s in &e.s {
            let pos = if s.pos.is_empty() { String::new() } else { format!("{} ", s.pos) };
            println!("   ▸ {}{}", pos, s.cn);
        }
    }
    Ok(())
}
