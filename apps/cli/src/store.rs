use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;



pub const DAY_MS: i64 = 86_400_000;
pub const MINUTE_MS: i64 = 60_000;

#[derive(Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Debug)]
#[serde(rename_all = "lowercase")]
pub enum Tier {
    Easy,
    Medium,
    Hard,
}

impl Tier {
    pub fn parse(s: &str) -> Option<Tier> {
        match s.to_ascii_lowercase().as_str() {
            "easy" | "简单" | "e" => Some(Tier::Easy),
            "hard" | "困难" | "h" => Some(Tier::Hard),
            "medium" | "中等" | "m" => Some(Tier::Medium),
            _ => None,
        }
    }
    pub fn label(&self) -> &'static str {
        match self {
            Tier::Easy => "简单",
            Tier::Medium => "中等",
            Tier::Hard => "困难",
        }
    }
}

#[derive(Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Debug)]
pub enum CardState {
    New,
    Learning,
    Review,
    Relearning,
}

/// scheduling unit: word (sense = None) or a single sense (sense = Some(i))
#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct Card {
    pub w: String,
    pub s: Option<usize>,
    pub state: CardState,
    pub due: i64,
    pub stability: f64,
    pub difficulty: f64,
    pub step: usize,
    pub reps: u32,
    pub lapses: u32,
    #[serde(default)]
    pub last_review: Option<i64>,
    #[serde(default = "default_tier")]
    pub tier: Tier,
    #[serde(default)]
    pub suspended: bool,
    pub updated_at: i64,
}

fn default_tier() -> Tier {
    Tier::Medium
}

impl Card {
    pub fn new(w: &str, s: Option<usize>, now: i64) -> Self {
        Self {
            w: w.into(),
            s,
            state: CardState::New,
            due: now,
            stability: 0.0,
            difficulty: 0.0,
            step: 0,
            reps: 0,
            lapses: 0,
            last_review: None,
            tier: Tier::Medium,
            suspended: false,
            updated_at: now,
        }
    }
    pub fn key(&self) -> String {
        match self.s {
            None => format!("w:{}", self.w),
            Some(i) => format!("s:{}:{}", self.w, i),
        }
    }
}

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct ReviewLog {
    pub w: String,
    pub s: Option<usize>,
    pub at: i64,
    pub rating: u8,
    pub q: String,
    pub senses: Vec<usize>,
}

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct AppSettings {
    #[serde(default = "default_retention")]
    pub base_retention: f64,
    #[serde(default = "default_delta")]
    pub tier_retention_delta: f64,
    #[serde(default = "default_daily_new")]
    pub daily_new: u32,
    #[serde(default = "default_mix_ratio")]
    pub mix_ratio: f64,
    #[serde(default = "default_level")]
    pub level_filter: i32,
    #[serde(default)]
    pub sync_url: String,
    #[serde(default)]
    pub sync_token: String,
    #[serde(default)]
    pub sync_user: String,
}

fn default_retention() -> f64 { 0.90 }
fn default_delta() -> f64 { 0.05 }
fn default_daily_new() -> u32 { 15 }
fn default_mix_ratio() -> f64 { 0.25 }
fn default_level() -> i32 { 3 }

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            base_retention: default_retention(),
            tier_retention_delta: default_delta(),
            daily_new: default_daily_new(),
            mix_ratio: default_mix_ratio(),
            level_filter: default_level(),
            sync_url: String::new(),
            sync_token: String::new(),
            sync_user: String::new(),
        }
    }
}

impl AppSettings {
    pub fn retention_for(&self, tier: Tier) -> f64 {
        let r = match tier {
            Tier::Easy => self.base_retention - self.tier_retention_delta,
            Tier::Hard => self.base_retention + self.tier_retention_delta,
            Tier::Medium => self.base_retention,
        };
        r.clamp(0.80, 0.97)
    }
}

pub struct Store {
    conn: Connection,
}

impl Store {
    pub fn open() -> anyhow::Result<Self> {
        let dir = dirs::config_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("lexfield");
        std::fs::create_dir_all(&dir)?;
        let conn = Connection::open(dir.join("lexfield.db"))?;
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS cards (key TEXT PRIMARY KEY, updated_at INTEGER NOT NULL, json TEXT NOT NULL);
             CREATE TABLE IF NOT EXISTS logs (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, json TEXT NOT NULL);
             CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL);
             CREATE TABLE IF NOT EXISTS settings (k TEXT PRIMARY KEY, v TEXT NOT NULL);",
        )?;
        Ok(Self { conn })
    }

    pub fn all_cards(&self) -> Vec<Card> {
        let mut stmt = self
            .conn
            .prepare("SELECT json FROM cards")
            .expect("cards table");
        let rows = stmt
            .query_map([], |r| r.get::<_, String>(0))
            .expect("query cards");
        rows.filter_map(|r| r.ok())
            .filter_map(|j| serde_json::from_str(&j).ok())
            .collect()
    }

    pub fn put_card(&self, card: &Card) -> anyhow::Result<()> {
        self.conn.execute(
            "INSERT INTO cards (key, updated_at, json) VALUES (?1, ?2, ?3)
             ON CONFLICT (key) DO UPDATE SET updated_at = excluded.updated_at, json = excluded.json",
            rusqlite::params![card.key(), card.updated_at, serde_json::to_string(card)?],
        )?;
        Ok(())
    }

    pub fn add_log(&self, log: &ReviewLog) -> anyhow::Result<()> {
        self.conn.execute(
            "INSERT INTO logs (at, json) VALUES (?1, ?2)",
            rusqlite::params![log.at, serde_json::to_string(log)?],
        )?;
        Ok(())
    }

    pub fn all_logs(&self) -> Vec<serde_json::Value> {
        let mut stmt = self.conn.prepare("SELECT json FROM logs ORDER BY at").expect("logs table");
        let rows = stmt.query_map([], |r| r.get::<_, String>(0)).expect("query logs");
        rows.filter_map(|r| r.ok())
            .filter_map(|j| serde_json::from_str(&j).ok())
            .collect()
    }

    pub fn get_meta(&self, key: &str) -> Option<i64> {
        self.conn
            .query_row("SELECT v FROM meta WHERE k = ?1", [key], |r| r.get::<_, String>(0))
            .ok()
            .and_then(|v| v.parse().ok())
    }

    pub fn put_meta(&self, key: &str, value: i64) -> anyhow::Result<()> {
        self.conn.execute(
            "INSERT INTO meta (k, v) VALUES (?1, ?2) ON CONFLICT (k) DO UPDATE SET v = excluded.v",
            rusqlite::params![key, value.to_string()],
        )?;
        Ok(())
    }

    pub fn get_settings(&self) -> AppSettings {
        self.conn
            .query_row("SELECT v FROM settings WHERE k = 'settings'", [], |r| {
                r.get::<_, String>(0)
            })
            .ok()
            .and_then(|v| serde_json::from_str(&v).ok())
            .unwrap_or_default()
    }

    pub fn put_settings(&self, s: &AppSettings) -> anyhow::Result<()> {
        self.conn.execute(
            "INSERT INTO settings (k, v) VALUES ('settings', ?1) ON CONFLICT (k) DO UPDATE SET v = excluded.v",
            rusqlite::params![serde_json::to_string(s)?],
        )?;
        Ok(())
    }

}

pub fn start_of_day(now: i64) -> i64 {
    let secs = now / 1000;
    let days = secs.div_euclid(86_400);
    days * 86_400 * 1000
        + 8 * 3_600 * 1000 // UTC+8 approximation; queue precision only needs day granularity
}

pub fn count_new_today(store: &Store, now: i64) -> u32 {
    let start = start_of_day(now);
    let mut words = std::collections::HashSet::new();
    for l in store.all_logs() {
        let is_word_level = l.get("s").map(|v| v.is_null()).unwrap_or(true);
        if is_word_level {
            if let Some(at) = l.get("at").and_then(|v| v.as_i64()) {
                if at >= start {
                    if let Some(w) = l.get("w").and_then(|v| v.as_str()) {
                        words.insert(w.to_string());
                    }
                }
            }
        }
    }
    words.len() as u32
}
