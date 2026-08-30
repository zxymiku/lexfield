use serde::Deserialize;

/// one Chinese meaning of a word
#[derive(Clone, Deserialize)]
pub struct Sense {
    #[serde(default)]
    pub pos: String,
    pub cn: String,
}

#[derive(Clone, Deserialize)]
pub struct VocabEntry {
    pub w: String,
    /// bit flags: 1 = CET-4, 2 = CET-6, 3 = both
    pub lv: i32,
    pub s: Vec<Sense>,
    #[serde(default)]
    pub p: Option<String>,
    #[serde(default)]
    pub f: Option<u32>,
}

#[derive(Deserialize)]
pub struct VocabFile {
    pub words: Vec<VocabEntry>,
}

pub struct Vocab {
    entries: Vec<VocabEntry>,
    index: std::collections::HashMap<String, usize>,
}

impl Vocab {
    /// bundled at build time from the shared data pipeline output
    pub fn embedded() -> Self {
        const RAW: &str = include_str!("../../../packages/data/dist/lexfield-vocab.json");
        Self::parse(RAW).expect("bundled vocabulary must parse")
    }

    pub fn parse(raw: &str) -> Result<Self, serde_json::Error> {
        let file: VocabFile = serde_json::from_str(raw)?;
        let index = file.words.iter().enumerate().map(|(i, e)| (e.w.clone(), i)).collect();
        Ok(Self { entries: file.words, index })
    }

    pub fn len(&self) -> usize {
        self.entries.len()
    }

    pub fn all(&self) -> &[VocabEntry] {
        &self.entries
    }

    pub fn index_of(&self, w: &str) -> Option<usize> {
        self.index.get(w).copied()
    }
}

impl VocabEntry {
    pub fn sense_text(&self, i: usize) -> String {
        match self.s.get(i) {
            Some(s) if !s.pos.is_empty() => format!("{} {}", s.pos, s.cn),
            Some(s) => s.cn.clone(),
            None => String::new(),
        }
    }

    pub fn level_label(&self) -> &'static str {
        match self.lv {
            1 => "CET-4",
            2 => "CET-6",
            _ => "CET-4·6",
        }
    }
}
