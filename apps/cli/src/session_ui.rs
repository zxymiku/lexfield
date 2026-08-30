//! interactive terminal session: word card, reveal, grading, choice/multi.

use crate::engine::{self, Question};
use crate::store::Store;
use crate::vocab::Vocab;
use crossterm::event::{read, Event, KeyCode, KeyEvent};
use std::io::{self, Write};

pub fn run_session(
    mode: &str,
    store: &Store,
    vocab: &Vocab,
    now_fn: fn() -> i64,
) -> anyhow::Result<()> {
    let items = engine::build_queue(mode, store, vocab, now_fn());
    if items.is_empty() {
        println!("当前没有任务。");
        return Ok(());
    }
    println!("共 {} 项 · 空格 显示释义/继续 · 1-4 评分 · q 退出\n", items.len());
    let mut correct = 0usize;
    let mut done = 0usize;
    'items: for (n, item) in items.iter().enumerate() {
        let entry = item.entry(vocab);
        println!("┌─ {:02}/{} [{}]", n + 1, items.len(), item.kind().to_uppercase());
        println!("│  {}", entry.w);
        if let Some(p) = &entry.p {
            println!("│  /{}/", p);
        }
        let question = engine::generate_question(item, store, vocab);
            match &question {
            Question::SelfGrade(senses) => {
                println!("│  回想词义…");
                loop {
                    match read_key()? {
                        Key::Quit => {
                            break 'items;
                        }
                        Key::Other => {
                            for (_i, s) in senses {
                                let pos = if s.pos.is_empty() { String::new() } else { format!("{} ", s.pos) };
                                println!("│    ▸ {}{}", pos, s.cn);
                            }
                            break;
                        }
                    }
                }
                let rating = prompt_grade()?;
                match rating {
                    Some(r) => {
                        engine::grade(
                            &engine::Engine::default(),
                            store,
                            &entry.w,
                            None,
                            r,
                            "self",
                            vec![],
                            now_fn(),
                        );
                        if r >= 3 {
                            correct += 1;
                        }
                        done += 1;
                        after_feedback(store, &entry.w, now_fn());
                    }
                    None => break 'items,
                }
            }
            Question::Choice(vi, _, options) => {
                let entry = &vocab.all()[*vi];
                println!("│  选出正确释义:");
                for (i, o) in options.iter().enumerate() {
                    println!("│    {}. {}", char::from(b'A' + i as u8), o.text);
                }
                match prompt_choice(options.len())? {
                    Some(sel) => {
                        let (rating, senses) = engine::grade_answer(&question, &[sel]);
                        let is_correct = options[sel].correct;
                        println!("│  {}", if is_correct { "✓ 正确" } else { "✗ 错误" });
                        engine::grade(
                            &engine::Engine::default(),
                            store,
                            &entry.w,
                            None,
                            rating,
                            "choice",
                            senses.clone(),
                            now_fn(),
                        );
                        for s in senses {
                            engine::grade(
                                &engine::Engine::default(),
                                store,
                                &entry.w,
                                Some(s),
                                rating,
                                "choice",
                                vec![s],
                                now_fn(),
                            );
                        }
                        if is_correct {
                            correct += 1;
                        }
                        done += 1;
                        after_feedback(store, &entry.w, now_fn());
                    }
                    None => break 'items,
                }
            }
            Question::Multi(vi, _, options) => {
                let entry = &vocab.all()[*vi];
                println!("│  选出全部正确释义(多选,空格分隔,回车提交):");
                for (i, o) in options.iter().enumerate() {
                    println!("│    {}. {}", char::from(b'A' + i as u8), o.text);
                }
                match prompt_multi(options.len())? {
                    Some(sel) if !sel.is_empty() => {
                        let (rating, senses) = engine::grade_answer(&question, &sel);
                        let opts = match &question {
                            Question::Multi(_, _, o) => o,
                            _ => unreachable!(),
                        };
                        let hits = sel.iter().filter(|&&s| opts[s].correct).count();
                        let full = hits == opts.iter().filter(|o| o.correct).count()
                            && hits == sel.len();
                        println!(
                            "│  {}",
                            if full {
                                "✓ 全部正确"
                            } else if hits > 0 {
                                "△ 部分正确"
                            } else {
                                "✗ 全部错误"
                            }
                        );
                        engine::grade(
                            &engine::Engine::default(),
                            store,
                            &entry.w,
                            None,
                            rating,
                            "multi",
                            senses.clone(),
                            now_fn(),
                        );
                        for s in senses {
                            engine::grade(
                                &engine::Engine::default(),
                                store,
                                &entry.w,
                                Some(s),
                                rating,
                                "multi",
                                vec![s],
                                now_fn(),
                            );
                        }
                        if rating >= 3 {
                            correct += 1;
                        }
                        done += 1;
                        after_feedback(store, &entry.w, now_fn());
                    }
                    _ => break 'items,
                }
            }
        }
        println!("└─\n");
    }
    println!("本组战果:{} / {} 正确", correct, done);
    Ok(())
}

fn after_feedback(store: &Store, word: &str, now: i64) {
    // day-level intervals get load-balanced onto the lightest neighbor day
    let cards = store.all_cards();
    if let Some(mut card) = cards.into_iter().find(|c| c.w == word && c.s.is_none()) {
        if card.state == crate::store::CardState::Review {
            let (balanced, changed) = engine::balance_day(store, card.due, now);
            if changed {
                card.due = balanced;
                store.put_card(&card).expect("write card");
            }
        }
    }
    println!("│  (已按 FSRS 更新调度)");
}

enum Key {
    Other,
    Quit,
}

fn read_key() -> anyhow::Result<Key> {
    loop {
        if crossterm::event::poll(std::time::Duration::from_secs(1))? {
            if let Event::Key(KeyEvent { code, modifiers, .. }) = read()? {
                return Ok(match code {
                    KeyCode::Char('q') | KeyCode::Esc => Key::Quit,
                    _ => {
                        let _ = modifiers;
                        Key::Other
                    }
                });
            }
        } else {
            return Ok(Key::Other);
        }
    }
}

fn enable_raw() -> std::io::Result<()> {
    crossterm::terminal::enable_raw_mode()?;
    Ok(())
}

fn disable_raw() {
    let _ = crossterm::terminal::disable_raw_mode();
}

fn prompt_grade() -> anyhow::Result<Option<u8>> {
    enable_raw()?;
    println!("│  评分:[1]忘记 [2]困难 [3]记得 [4]简单 (q 退出)");
    io::stdout().flush().ok();
    let out = loop {
        match read()? {
            Event::Key(KeyEvent { code: KeyCode::Char(c @ '1'..='4'), .. }) => break Some(c as u8 - b'0'),
            Event::Key(KeyEvent { code: KeyCode::Char('q') | KeyCode::Esc, .. }) => break None,
            _ => continue,
        }
    };
    disable_raw();
    Ok(out)
}

fn prompt_choice(n: usize) -> anyhow::Result<Option<usize>> {
    enable_raw()?;
    print!("│  选择 A-{}: ", char::from(b'A' + n as u8 - 1));
    io::stdout().flush().ok();
    let out = loop {
        match read()? {
            Event::Key(KeyEvent { code: KeyCode::Char(c), .. }) => {
                if c == 'q' || c == 'Q' {
                    break None;
                }
                let idx = (c.to_ascii_uppercase() as u8).wrapping_sub(b'A') as usize;
                if idx < n {
                    break Some(idx);
                }
            }
            Event::Key(KeyEvent { code: KeyCode::Esc, .. }) => break None,
            _ => continue,
        }
    };
    disable_raw();
    Ok(out)
}

fn prompt_multi(n: usize) -> anyhow::Result<Option<Vec<usize>>> {
    disable_raw();
    print!("│  选择(如 A C D,回车提交): ");
    io::stdout().flush().ok();
    let mut line = String::new();
    io::stdin().read_line(&mut line)?;
    let sel: Vec<usize> = line
        .split_whitespace()
        .filter_map(|t| t.chars().next())
        .map(|c| (c.to_ascii_uppercase() as u8).wrapping_sub(b'A') as usize)
        .filter(|&i| i < n)
        .collect();
    if line.trim().eq_ignore_ascii_case("q") {
        return Ok(None);
    }
    Ok(Some(sel))
}
