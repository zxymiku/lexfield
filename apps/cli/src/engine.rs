//! Session engine for the CLI: queue building, question generation and grade
//! persistence, sharing FSRS semantics with the TS core (fsrs-rs memory model
//! + the same learning-step logic as the web/Android ports).

use crate::store::{Card, CardState, ReviewLog, Store, DAY_MS, MINUTE_MS, Tier};
use crate::vocab::{Sense, Vocab, VocabEntry};
use fsrs::{FSRS, MemoryState};
use rand::seq::SliceRandom;
use rand::Rng;

pub struct Engine {
    pub fsrs: FSRS,
}

/// learning steps in minutes (identical to ts-fsrs defaults)
pub const LEARNING_STEPS: [i64; 2] = [1, 10];
pub const RELEARNING_STEPS: [i64; 1] = [10];

impl Default for Engine {
    fn default() -> Self {
        Self { fsrs: FSRS::default() }
    }
}

#[derive(Clone)]
pub enum Item {
    New(usize),               // vocab index
    Due(usize, Card),
    Learning(usize, Card),
}

impl Item {
    pub fn entry<'a>(&self, vocab: &'a Vocab) -> &'a VocabEntry {
        let idx = match self {
            Item::New(i) | Item::Due(i, _) | Item::Learning(i, _) => *i,
        };
        &vocab.all()[idx]
    }
    pub fn kind(&self) -> &'static str {
        match self {
            Item::New(_) => "new",
            Item::Due(_, _) => "due",
            Item::Learning(_, _) => "learning",
        }
    }
}

pub fn build_queue(
    mode: &str,
    store: &Store,
    vocab: &Vocab,
    now: i64,
) -> Vec<Item> {
    let settings = store.get_settings();
    let cards = store.all_cards();
    let mut seen = std::collections::HashSet::new();
    let mut learning = Vec::new();
    let mut due = Vec::new();
    for c in cards.iter().filter(|c| c.s.is_none() && !c.suspended) {
        seen.insert(c.w.clone());
        let Some(idx) = vocab.index_of(&c.w) else { continue };
        if (c.state == CardState::Learning || c.state == CardState::Relearning) && c.due <= now {
            learning.push(Item::Learning(idx, c.clone()));
        } else if c.state == CardState::Review && c.due <= now {
            due.push(Item::Due(idx, c.clone()));
        }
    }
    learning.sort_by_key(|i| match i {
        Item::Learning(_, c) => c.due,
        _ => 0,
    });
    let mut items: Vec<Item> = learning;

    let new_allowed = if mode == "review" {
        0
    } else {
        let introduced = crate::store::count_new_today(store, now);
        settings.daily_new.saturating_sub(introduced) as usize
    };

    let mut new_queue: Vec<Item> = if new_allowed > 0 {
        let mut pool: Vec<&VocabEntry> = vocab_scope_entries(vocab, &settings)
            .into_iter()
            .filter(|e| !seen.contains(&e.w))
            .collect();
        pool.sort_by_key(|e| e.f.unwrap_or(u32::MAX));
        pool.into_iter().take(new_allowed).map(|e| Item::New(vocab.index_of(&e.w).unwrap())).collect()
    } else {
        Vec::new()
    };

    match mode {
        "learn" => {
            items.extend(new_queue.drain(..));
            items
        }
        "review" => {
            due.sort_by_key(|i| match i {
                Item::Due(_, c) => c.due,
                _ => 0,
            });
            items.extend(due);
            items
        }
        _ => {
            // mix: interleave by mix_ratio with rng, due first
            let mut rng = rand::thread_rng();
            due.sort_by_key(|i| match i {
                Item::Due(_, c) => c.due,
                _ => 0,
            });
            let mut due = std::collections::VecDeque::from(due);
            let mut new_q = std::collections::VecDeque::from(new_queue);
            let mut progress = 0usize;
            while !due.is_empty() || !new_q.is_empty() {
                let take_new = !new_q.is_empty()
                    && (due.is_empty() || (progress > 0 && rng.gen::<f64>() < settings.mix_ratio));
                if take_new {
                    items.push(new_q.pop_front().unwrap());
                } else if let Some(d) = due.pop_front() {
                    items.push(d);
                } else {
                    items.push(new_q.pop_front().unwrap());
                }
                progress += 1;
            }
            items
        }
    }
}

fn vocab_scope_entries<'a>(vocab: &'a Vocab, settings: &crate::store::AppSettings) -> Vec<&'a VocabEntry> {
    vocab.all().iter().filter(|e| (e.lv & settings.level_filter) != 0).collect()
}

// ---------------------------------------------------------------------------
// questions
// ---------------------------------------------------------------------------

pub enum Question {
    SelfGrade(usize, Vec<(usize, Sense)>),
    Choice(usize, usize, Vec<ChoiceOption>),
    Multi(usize, Vec<usize>, Vec<ChoiceOption>),
}

#[derive(Clone)]
pub struct ChoiceOption {
    pub text: String,
    pub correct: bool,
    pub sense_idx: usize,
}

pub fn generate_question(item: &Item, store: &Store, vocab: &Vocab) -> Question {
    let entry = item.entry(vocab);
    let mut rng = rand::thread_rng();
    let (self_w, choice_w, multi_w) = (0.4, 0.4, 0.2);
    let total = self_w + choice_w + multi_w;
    let mut roll: f64 = rng.gen::<f64>() * total;
    let kind = if { roll -= self_w; roll < 0.0 } {
        0
    } else if { roll -= choice_w; roll < 0.0 } {
        1
    } else {
        2
    };
    match kind {
        0 => {
            let idxes: Vec<usize> = (0..entry.s.len()).collect();
            Question::SelfGrade(
                vocab.index_of(&entry.w).unwrap(),
                idxes.into_iter().map(|i| (i, entry.s[i].clone())).collect(),
            )
        }
        1 => {
            let target = rng.gen_range(0..entry.s.len());
            Question::Choice(
                vocab.index_of(&entry.w).unwrap(),
                target,
                sample_options(entry, &[target], 1, 4, vocab, &mut rng),
            )
        }
        _ => {
            let k = 1usize.max(2.min(entry.s.len()));
            let mut idxes: Vec<usize> = (0..entry.s.len()).collect();
            idxes.shuffle(&mut rng);
            idxes.truncate(k);
            Question::Multi(
                vocab.index_of(&entry.w).unwrap(),
                idxes.clone(),
                sample_options(entry, &idxes, k, 6, vocab, &mut rng),
            )
        }
    }
}

fn sample_options(
    entry: &VocabEntry,
    correct_idxes: &[usize],
    correct_count: usize,
    total_options: usize,
    vocab: &Vocab,
    rng: &mut impl Rng,
) -> Vec<ChoiceOption> {
    let correct_texts: std::collections::HashSet<String> = correct_idxes
        .iter()
        .map(|&i| entry.sense_text(i))
        .collect();
    let target_pos = entry.s[correct_idxes[0]].pos.clone();

    let mut pool: Vec<(usize, usize)> = Vec::new(); // (vocab idx, sense idx)
    for (vi, e) in vocab.all().iter().enumerate() {
        if e.w == entry.w {
            continue;
        }
        for si in 0..e.s.len() {
            if correct_texts.contains(&e.sense_text(si)) {
                continue;
            }
            pool.push((vi, si));
        }
    }
    pool.shuffle(rng);

    let mut options: Vec<ChoiceOption> = correct_idxes
        .iter()
        .map(|&i| ChoiceOption {
            text: entry.sense_text(i),
            correct: true,
            sense_idx: i,
        })
        .collect();
    for &(vi, si) in pool.iter() {
        if options.len() >= total_options.max(correct_count) {
            break;
        }
        let e = &vocab.all()[vi];
        // prefer same-POS distractors on tie (50% keep)
        if !e.s[si].pos.is_empty() && e.s[si].pos == target_pos && !rng.gen_bool(0.5) {
            // keep it anyway - preference only
        }
        options.push(ChoiceOption {
            text: e.sense_text(si),
            correct: false,
            sense_idx: si,
        });
    }
    // ensure distractor count
    options.truncate((correct_count + (total_options - correct_count)).max(options.len().min(total_options)));
    options.shuffle(rng);
    options
}

/// auto-grade a choice/multi answer -> (rating 1-4, tested sense indexes)
pub fn grade_answer(q: &Question, selected: &[usize]) -> (u8, Vec<usize>) {
    match q {
        Question::SelfGrade(_, _) => unreachable!("self questions grade directly"),
        Question::Choice(_, target, _) => {
            let correct = selected.len() == 1 && q_options(q)[selected[0]].correct;
            (if correct { 3 } else { 1 }, vec![*target])
        }
        Question::Multi(_vi, targets, _) => {
            let opts = q_options(q);
            let correct_set: std::collections::HashSet<usize> =
                opts.iter().enumerate().filter(|(_, o)| o.correct).map(|(i, _)| i).collect();
            let hits = selected.iter().filter(|s| correct_set.contains(s)).count();
            let misses = selected.len() - hits;
            let rating = if hits == correct_set.len() && misses == 0 {
                3
            } else if hits > 0 {
                2
            } else {
                1
            };
            (rating, targets.clone())
        }
    }
}

fn q_options(q: &Question) -> &Vec<ChoiceOption> {
    match q {
        Question::Choice(_, _, o) | Question::Multi(_, _, o) => o,
        Question::SelfGrade(_, _) => unreachable!(),
    }
}

// ---------------------------------------------------------------------------
// grading persistence (fsrs-rs memory states + learning steps)
// ---------------------------------------------------------------------------

pub fn ensure_word_card(store: &Store, word: &str, now: i64) -> Card {
    let cards = store.all_cards();
    let key = format!("w:{}", word);
    if let Some(c) = cards.into_iter().find(|c| c.key() == key) {
        return c;
    }
    let card = Card::new(word, None, now);
    store.put_card(&card).expect("write card");
    card
}

fn ensure_sense_card(store: &Store, word: &str, sense: usize, now: i64) -> Card {
    let cards = store.all_cards();
    let key = format!("s:{}:{}", word, sense);
    if let Some(c) = cards.into_iter().find(|c| c.key() == key) {
        return c;
    }
    let card = Card::new(word, Some(sense), now);
    store.put_card(&card).expect("write card");
    card
}

pub fn grade(
    engine: &Engine,
    store: &Store,
    word: &str,
    sense: Option<usize>,
    rating: u8,
    question: &str,
    senses: Vec<usize>,
    now: i64,
) {
    let settings = store.get_settings();
    let mut card = match sense {
        None => ensure_word_card(store, word, now),
        Some(i) => ensure_sense_card(store, word, i, now),
    };
    let retention = settings.retention_for(card.tier);
    apply_rating(&engine.fsrs, &mut card, rating, retention, now);
    store.put_card(&card).expect("write card");
    store
        .add_log(&ReviewLog {
            w: word.into(),
            s: sense,
            at: now,
            rating,
            q: question.into(),
            senses,
        })
        .expect("write log");
}

fn apply_rating(fsrs: &FSRS, card: &mut Card, rating: u8, retention: f64, now: i64) {
    card.reps += 1;
    card.last_review = Some(now);
    card.updated_at = now;

    let prev_memory: Option<MemoryState> = if card.stability > 0.0 && card.state != CardState::New {
        Some(MemoryState { stability: card.stability as f32, difficulty: card.difficulty as f32 })
    } else {
        None
    };

    let states = fsrs
        .next_states(prev_memory, retention as f32, 0)
        .expect("fsrs next_states");
    let chosen = match rating {
        1 => &states.again,
        2 => &states.hard,
        4 => &states.easy,
        _ => &states.good,
    };
    let interval_days = chosen.interval as i64;

    match card.state {
        CardState::New => {
            card.stability = chosen.memory.stability as f64;
            card.difficulty = chosen.memory.difficulty as f64;
            match rating {
                4 => graduate(card, now),
                1 | 2 => enter_step(card, CardState::Learning, 0, now),
                _ => enter_step(card, CardState::Learning, 1, now),
            }
        }
        CardState::Learning | CardState::Relearning => {
            card.stability = chosen.memory.stability as f64;
            match rating {
                4 => graduate(card, now),
                1 => enter_step(card, card.state, 0, now),
                2 if card.step > 0 => enter_step(card, card.state, card.step - 1, now),
                _ => {
                    let steps = if card.state == CardState::Learning { LEARNING_STEPS.len() } else { RELEARNING_STEPS.len() };
                    if card.step >= steps - 1 {
                        graduate(card, now)
                    } else {
                        enter_step(card, card.state, card.step + 1, now)
                    }
                }
            }
        }
        CardState::Review => {
            if rating == 1 {
                card.lapses += 1;
                card.stability = chosen.memory.stability as f64;
                enter_step(card, CardState::Relearning, 0, now);
            } else {
                card.stability = chosen.memory.stability as f64;
                card.state = CardState::Review;
                card.step = 0;
                card.due = now + interval_days.max(1) * DAY_MS;
            }
        }
    }
}

fn enter_step(card: &mut Card, state: CardState, step: usize, now: i64) {
    card.state = state;
    card.step = step;
    let minutes = if state == CardState::Relearning {
        RELEARNING_STEPS[step.min(RELEARNING_STEPS.len() - 1)]
    } else {
        LEARNING_STEPS[step.min(LEARNING_STEPS.len() - 1)]
    };
    card.due = now + minutes * MINUTE_MS;
}

fn graduate(card: &mut Card, now: i64) {
    card.state = CardState::Review;
    card.step = 0;
    // short first interval scaled from stability via fsrs interval of state=1d elapsed
    let days = (card.stability.round() as i64).clamp(1, 36500);
    card.due = now + days * DAY_MS;
}

/// adjust proposed due day to the least loaded neighbor day (load balance)
pub fn balance_day(store: &Store, proposed_due: i64, now: i64) -> (i64, bool) {
    let today = now / DAY_MS;
    let day = proposed_due / DAY_MS;
    if day - today < 1 {
        return (proposed_due, false);
    }
    let mut hist: std::collections::HashMap<i64, i64> = std::collections::HashMap::new();
    for c in store.all_cards().into_iter().filter(|c| c.s.is_none() && !c.suspended && c.state == CardState::Review) {
        *hist.entry(c.due / DAY_MS).or_insert(0) += 1;
    }
    let mut best_day = day;
    let mut best = hist.get(&day).copied().unwrap_or(0);
    for offset in [-1i64, 1, 2] {
        let probe = day + offset;
        if probe < today + 1 {
            continue;
        }
        let count = hist.get(&probe).copied().unwrap_or(0);
        if count < best {
            best = count;
            best_day = probe;
        }
    }
    let time_of_day = proposed_due - day * DAY_MS;
    (best_day * DAY_MS + time_of_day, best_day != day)
}

pub fn set_tier_all(store: &Store, word: &str, tier: Tier, now: i64) {
    for mut c in store.all_cards().into_iter().filter(|c| c.w == word) {
        c.tier = tier;
        c.updated_at = now;
        store.put_card(&c).expect("write card");
    }
}

pub fn set_sense_tier(store: &Store, word: &str, sense: usize, tier: Tier, now: i64) {
    let mut c = ensure_sense_card(store, word, sense, now);
    c.tier = tier;
    c.updated_at = now;
    store.put_card(&c).expect("write card");
}

pub fn set_suspended(store: &Store, word: &str, suspended: bool, now: i64) {
    let mut c = ensure_word_card(store, word, now);
    c.suspended = suspended;
    c.updated_at = now;
    store.put_card(&c).expect("write card");
}

pub fn reset_card(store: &Store, word: &str, now: i64) {
    let mut c = ensure_word_card(store, word, now);
    c.state = CardState::New;
    c.stability = 0.0;
    c.difficulty = 0.0;
    c.step = 0;
    c.reps = 0;
    c.lapses = 0;
    c.last_review = None;
    c.due = now;
    c.updated_at = now;
    store.put_card(&c).expect("write card");
}
