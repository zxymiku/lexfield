//! Cloudflare Worker sync client (register/login/push/pull, LWW merge).

use crate::store::{Card, Store, DAY_MS};
use anyhow::Context;
use serde_json::{json, Value};

pub struct SyncClient {
    pub base_url: String,
    pub token: String,
}

impl SyncClient {
    pub fn new(base_url: &str, token: &str) -> Self {
        Self { base_url: base_url.trim_end_matches('/').into(), token: token.into() }
    }

    fn request(&self, path: &str, method: &str, body: Option<Value>) -> anyhow::Result<Value> {
        let url = format!("{}{}", self.base_url, path);
        let req = ureq::request(method, &url)
            .timeout(std::time::Duration::from_secs(30))
            .set("authorization", &format!("Bearer {}", self.token));
        let res = match body {
            Some(b) => req.set("content-type", "application/json").send_json(b)?,
            None => req.call()?,
        };
        let status = res.status();
        let text = res.into_string().context("读取响应失败")?;
        if !(200..300).contains(&status) {
            let msg = serde_json::from_str::<Value>(&text)
                .ok()
                .and_then(|v| v.get("error").and_then(|e| e.as_str().map(String::from)))
                .unwrap_or(text.chars().take(160).collect());
            anyhow::bail!("HTTP {status} {msg}");
        }
        Ok(serde_json::from_str(&text)?)
    }

    fn auth_call(base_url: &str, path: &str, user: &str, pass: &str) -> anyhow::Result<(String, String)> {
        let res = match ureq::post(&format!("{}{}", base_url.trim_end_matches('/'), path))
            .set("content-type", "application/json")
            .send_json(json!({ "username": user, "password": pass }))
        {
            Ok(r) => r,
            Err(ureq::Error::Status(_, r)) => r,
            Err(e) => anyhow::bail!("请求失败:{e}"),
        };
        let status = res.status();
        let text = res.into_string().context("读取响应失败")?;
        if !(200..300).contains(&status) {
            let msg = serde_json::from_str::<Value>(&text)
                .ok()
                .and_then(|v| v.get("error").and_then(|e| e.as_str().map(String::from)))
                .unwrap_or(text.chars().take(160).collect());
            anyhow::bail!("HTTP {status} {msg}");
        }
        let parsed: Value = serde_json::from_str(&text)?;
        Ok((
            parsed["token"].as_str().unwrap_or("").into(),
            parsed["user"].as_str().unwrap_or("").into(),
        ))
    }

    pub fn register(base_url: &str, user: &str, pass: &str) -> anyhow::Result<(String, String)> {
        Self::auth_call(base_url, "/api/auth/register", user, pass)
    }

    pub fn login(base_url: &str, user: &str, pass: &str) -> anyhow::Result<(String, String)> {
        Self::auth_call(base_url, "/api/auth/login", user, pass)
    }

    pub fn sync(&self, store: &Store) -> anyhow::Result<(usize, usize)> {
        let now = crate::store::start_of_day(std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as i64);
        let _ = now;
        let last_sync = store.get_meta("lastSyncAt").unwrap_or(0);

        let settings = store.get_settings();
        let mut settings_json = serde_json::to_value(&settings)?;
        if let Some(obj) = settings_json.as_object_mut() {
            obj.remove("syncToken");
            obj.remove("syncUrl");
        }

        let now_ms = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as i64;

        let cards: Vec<Value> = store
            .all_cards()
            .into_iter()
            .filter(|c| c.updated_at > last_sync)
            .filter_map(|c| serde_json::to_value(&c).ok())
            .collect();
        let logs: Vec<Value> = store
            .all_logs()
            .into_iter()
            .filter(|l| l.get("at").and_then(|v| v.as_i64()).unwrap_or(0) > last_sync)
            .collect();

        let push_body = json!({
            "cards": cards,
            "logs": logs,
            "settings": if settings.sync_token.is_empty() { Value::Null } else { settings_json },
        });
        let pushed = if cards.len() + logs.len() > 0 || !settings.sync_token.is_empty() {
            self.request("/api/sync/push", "POST", Some(push_body))?
                .get("accepted")
                .and_then(|v| v.as_u64())
                .unwrap_or(0) as usize
        } else {
            0
        };

        let pull = self.request(&format!("/api/sync/pull?since={last_sync}"), "GET", None)?;
        let pulled_cards = pull
            .get("cards")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();
        let mut applied = 0usize;
        for raw in &pulled_cards {
            let mut card: Card = serde_json::from_value(raw.clone())?;
            let existing = store.all_cards().into_iter().find(|c| c.key() == card.key());
            if existing.map(|e| card.updated_at > e.updated_at).unwrap_or(true) {
                // revive fsrs dates stored as strings by the server
                if let Some(due) = card_duedate(&raw) {
                    card.due = due;
                }
                store.put_card(&card)?;
                applied += 1;
            }
        }

        if let Some(server_settings) = pull.get("settings").cloned() {
            if !server_settings.is_null() {
                let mut merged: crate::store::AppSettings = serde_json::from_value(server_settings)?;
                merged.sync_url = settings.sync_url.clone();
                merged.sync_token = settings.sync_token.clone();
                merged.sync_user = settings.sync_user.clone();
                store.put_settings(&merged)?;
            }
        }

        let server_time = pull.get("serverTime").and_then(|v| v.as_i64()).unwrap_or(now_ms);
        store.put_meta("lastSyncAt", server_time)?;
        let _ = DAY_MS;
        Ok((pushed, applied))
    }
}

/// due may arrive as ISO string from the server - accept numeric or parse it
fn card_duedate(raw: &Value) -> Option<i64> {
    let due = raw.get("fsrs")?.get("due")?;
    if let Some(n) = due.as_i64() {
        return Some(n);
    }
    let s = due.as_str()?;
    // ISO 8601 -> epoch ms (server stores Date.toJSON output)
    let parsed = chrono_like_parse(s)?;
    Some(parsed)
}

/// minimal "YYYY-MM-DDTHH:MM:SS(.sss)Z" parser (no chrono dependency)
fn chrono_like_parse(s: &str) -> Option<i64> {
    let b = s.as_bytes();
    if b.len() < 19 {
        return None;
    }
    let num = |a: usize, z: usize| -> Option<i64> { s.get(a..z)?.parse::<i64>().ok() };
    let y = num(0, 4)?;
    let mo = num(5, 7)?;
    let d = num(8, 10)?;
    let h = num(11, 13)?;
    let mi = num(14, 16)?;
    let sec = num(17, 19)?;
    // days since epoch via civil-from-days algorithm (Howard Hinnant)
    let y_adj = if mo <= 2 { y - 1 } else { y };
    let era = y_adj.div_euclid(400);
    let yoe = y_adj - era * 400;
    let mp = (mo + 9).rem_euclid(12);
    let doy = (153 * mp + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    let days = era * 146_097 + doe - 719_468;
    Some((((days * 24 + h) * 60 + mi) * 60 + sec) * 1000)
}
