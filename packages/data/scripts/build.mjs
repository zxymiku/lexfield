/**
 * LexField vocabulary ETL.
 *
 * Membership (complete official outlines, not "frequently tested" subsets):
 *   - hehonghui/en_dict  CET4_edited.txt (4,615 words) + CET6_edited.txt (2,218 words)
 *   - ismartcoding/endict vocabulary/cet4.json + cet6.json (2016 syllabus word arrays)
 *   - skywind3000/ECDICT rows tagged cet4 / cet6
 *
 * Definitions: ECDICT (MIT) - all POS senses, English definitions, phonetics,
 * word-form exchanges, BNC/contemporary frequency ranks.
 *
 * Output: dist/lexfield-vocab.json (minified) + dist/report.json (counts & gaps).
 */
import { createWriteStream, existsSync, mkdirSync, statSync } from 'node:fs'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { parse } from 'csv-parse'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.resolve(__dirname, '..')
const CACHE_DIR = path.join(DATA_DIR, '.cache')
const DIST_DIR = path.join(DATA_DIR, 'dist')

const SOURCES = {
  cet4Outline:
    'https://raw.githubusercontent.com/hehonghui/en_dict/master/CET4_edited.txt',
  cet6Outline:
    'https://raw.githubusercontent.com/hehonghui/en_dict/master/CET6_edited.txt',
  endictCet4:
    'https://raw.githubusercontent.com/ismartcoding/endict/master/vocabulary/cet4.json',
  endictCet6:
    'https://raw.githubusercontent.com/ismartcoding/endict/master/vocabulary/cet6.json',
  ecdict: 'https://raw.githubusercontent.com/skywind3000/ECDICT/master/ecdict.csv',
}

// ---------------------------------------------------------------------------
// download with cache
// ---------------------------------------------------------------------------

async function download(url, name) {
  const file = path.join(CACHE_DIR, name)
  if (existsSync(file) && statSync(file).size > 0) {
    console.log(`[cache] ${name} (${(statSync(file).size / 1e6).toFixed(1)} MB)`)
    return file
  }
  console.log(`[fetch] ${url}`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`)
  await pipeline(Readable.fromWeb(res.body), createWriteStream(file))
  console.log(`[saved] ${name} (${(statSync(file).size / 1e6).toFixed(1)} MB)`)
  return file
}

// ---------------------------------------------------------------------------
// outline list parsers
// ---------------------------------------------------------------------------

const POS_RE =
  /(?:^|\s)((?:n|v|vt|vi|vi&vt|adj|adv|art|prep|pron|conj|aux|num|int|abbr|pl)\.)/

/**
 * `abandon [əˈbændən] vt.丢弃；放弃，抛弃` -> { word, phonetic, gloss }
 * `abandon  vt.放弃,遗弃;n.放任,狂热` -> { word, phonetic: '', gloss }
 * Returns null for headers / section letters / unparseable lines.
 */
function parseOutlineLine(rawLine) {
  const line = rawLine.replace(/^\uFEFF/, '').trim()
  if (!line || /^[A-Z]$/.test(line)) return null
  if (/^(大学|共 |\(|（)/.test(line)) return null

  let rest = line
  let phonetic = ''
  const bracket = rest.match(/\[([^\]]+)\]/)
  if (bracket) {
    phonetic = bracket[1].trim()
    rest = (rest.slice(0, bracket.index) + ' ' + rest.slice(bracket.index + bracket[0].length)).trim()
  }
  // word = everything before the first POS token boundary
  const m = rest.match(POS_RE)
  if (!m) return null
  const word = rest.slice(0, m.index).trim()
  if (!word || !/^[A-Za-z][A-Za-z'\-\. ]*$/.test(word)) return null
  return { word, phonetic, gloss: rest.slice(m.index).trim() }
}

/**
 * CET6_edited.txt truncates words longer than 13 chars (fixed table column
 * width). Repair the observed cases; rerun reveals any stragglers via report.
 */
const TRUNCATION_REPAIRS = {
  administratio: 'administration',
  characteristi: 'characteristic',
  classificatio: 'classification',
  correspondenc: 'correspondence',
  identificatio: 'identification',
}

async function readOutline(file) {
  const text = await import('node:fs/promises').then((fs) => fs.readFile(file, 'utf8'))
  const words = new Map()
  for (const line of text.split(/\r?\n/)) {
    const parsed = parseOutlineLine(line)
    if (parsed && !words.has(parsed.word)) words.set(parsed.word, parsed)
  }
  for (const [bad, good] of Object.entries(TRUNCATION_REPAIRS)) {
    const rec = words.get(bad)
    if (rec && !words.has(good)) {
      words.set(good, { ...rec, word: good })
      words.delete(bad)
    }
  }
  return words
}

async function readWordArray(file) {
  const text = await import('node:fs/promises').then((fs) => fs.readFile(file, 'utf8'))
  const arr = JSON.parse(text)
  return arr.filter((w) => typeof w === 'string' && w.length > 0)
}

// ---------------------------------------------------------------------------
// ECDICT field decoding
// ---------------------------------------------------------------------------

/** `p:abandoned/d:abandoned/i:abandoning/3:abandons/s:abandons/0:abandon/1:abandon` */
function parseExchange(exchange) {
  if (!exchange) return undefined
  const map = {}
  for (const part of exchange.split('/')) {
    const idx = part.indexOf(':')
    if (idx < 1) continue
    const key = part.slice(0, idx)
    const val = part.slice(idx + 1).trim()
    if (!val) continue
    // p past, d past-participle, i -ing, 3 third-person, s plural, r comparative, t superlative
    if ('pdi3srt'.includes(key) && val.length <= 40) map[key] = val
  }
  return Object.keys(map).length ? map : undefined
}

/** ECDICT stores literal `\n` (backslash + n) inside fields, not real newlines. */
const FIELD_LINES = /\\n/

/** `n. 罩；风帽\nv. 覆盖` -> [{pos:'n.', cn:'罩；风帽'}, ...] - ALL senses, never truncated */
function parseSenses(translation) {
  if (!translation) return []
  return translation
    .split(FIELD_LINES)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const m = line.match(/^([a-z&]{1,6})\.\s*(.+)$/)
      if (m && /^(n|v|vt|vi|adj|adv|art|prep|pron|conj|aux|num|int|abbr|pl)$/i.test(m[1])) {
        return { pos: m[1].toLowerCase() + '.', cn: m[2].trim() }
      }
      return { pos: '', cn: line }
    })
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main() {
  mkdirSync(CACHE_DIR, { recursive: true })
  mkdirSync(DIST_DIR, { recursive: true })

  const [cet4File, cet6File, endict4File, endict6File, ecdictFile] = await Promise.all([
    download(SOURCES.cet4Outline, 'CET4_edited.txt'),
    download(SOURCES.cet6Outline, 'CET6_edited.txt'),
    download(SOURCES.endictCet4, 'endict-cet4.json'),
    download(SOURCES.endictCet6, 'endict-cet6.json'),
    download(SOURCES.ecdict, 'ecdict.csv'),
  ])

  // membership assembly -------------------------------------------------------
  const lvByWord = new Map() // word -> 1|2|3 (bit: 1=cet4, 2=cet6)
  const bump = (word, bit) => {
    const prev = lvByWord.get(word) ?? 0
    lvByWord.set(word, prev | bit)
  }

  const cet4Outline = await readOutline(cet4File)
  const cet6Outline = await readOutline(cet6File)
  const endict4 = await readWordArray(endict4File)
  const endict6 = await readWordArray(endict6File)

  for (const w of cet4Outline.keys()) bump(w, 1)
  for (const w of endict4) bump(w, 1)
  for (const w of cet6Outline.keys()) bump(w, 2)
  for (const w of endict6) bump(w, 2)
  console.log(`[membership] outline+endict union: ${lvByWord.size} words`)

  // single streaming pass over ECDICT:
  //  - rows tagged cet4/cet6 join the membership
  //  - every membership word captures its dictionary fields
  const dict = new Map() // word -> ecdict row fields
  const dictLower = new Map() // lowercase -> canonical word (proper-noun case mismatch)
  let scanned = 0
  const parser = parse({
    columns: true,
    relax_column_count: true,
    skip_empty_lines: true,
    trim: true,
  })
  const { createReadStream } = await import('node:fs')
  const csvStream = createReadStream(ecdictFile, { encoding: 'utf8' })
  csvStream.pipe(parser)

  for await (const row of parser.iterator ? parser.iterator() : parser) {
    scanned++
    if (scanned % 100000 === 0) console.log(`[ecdict] scanned ${scanned}`)
    const word = row.word
    if (!word) continue
    const tag = row.tag || ''
    const isCet4Tag = /(^|\s)cet4(\s|$)/.test(tag)
    const isCet6Tag = /(^|\s)cet6(\s|$)/.test(tag)
    // ECDICT canonicalizes proper nouns capitalized (North/America/Demo);
    // match membership case-insensitively so those rows get captured.
    const known = lvByWord.has(word) || lvByWord.has(word.toLowerCase())
    if (!isCet4Tag && !isCet6Tag && !known) continue
    if (isCet4Tag) bump(word, 1)
    if (isCet6Tag) bump(word, 2)
    if (!dict.has(word)) {
      dict.set(word, {
        word,
        phonetic: row.phonetic || '',
        translation: row.translation || '',
        definition: row.definition || '',
        exchange: row.exchange || '',
        bnc: Number(row.bnc) || 0,
        frq: Number(row.frq) || 0,
        collins: Number(row.collins) || 0,
      })
      dictLower.set(word.toLowerCase(), word)
    }
  }
  console.log(`[ecdict] scanned ${scanned} rows total, captured ${dict.size} candidate entries`)
  console.log(`[membership] final union: ${lvByWord.size} words`)

  const supplement = await import('node:fs/promises').then((fs) =>
    fs.readFile(path.join(DATA_DIR, 'supplement.json'), 'utf8').then(JSON.parse),
  )

  // emit ----------------------------------------------------------------------
  const byWord = new Map() // final displayed word -> entry (case-collision merge)
  const missingDict = []
  const emitGlossFallback = (word, lv) => {
    const outlineRec = cet4Outline.get(word) ?? cet6Outline.get(word)
    if (outlineRec?.gloss) {
      byWord.set(word, {
        w: word,
        lv,
        s: parseSenses(outlineRec.gloss),
        ...(outlineRec.phonetic ? { p: outlineRec.phonetic.replace(/ә/g, 'ə') } : {}),
      })
      return true
    }
    return false
  }
  const emitSupplement = (word, lv) => {
    const rec = supplement[word]
    if (!rec) return false
    byWord.set(word, {
      w: word,
      lv,
      s: rec.s.map((x) => ({ pos: x.pos ?? '', cn: x.cn })),
      ...(rec.p ? { p: rec.p } : {}),
    })
    return true
  }
  for (const [word, lv] of lvByWord) {
    const d = dict.get(word) ?? dict.get(dictLower.get(word.toLowerCase()) ?? '')
    if (!d) {
      // no ECDICT row at all - outline gloss first, then hand-curated supplement
      if (!emitGlossFallback(word, lv) && !emitSupplement(word, lv)) missingDict.push(word)
      continue
    }
    const senses = parseSenses(d.translation)
    const enDefs = d.definition
      ? d.definition.split(FIELD_LINES).map((s) => s.trim()).filter(Boolean).slice(0, 6)
      : []
    if (senses.length === 0 && enDefs.length === 0) {
      if (!emitGlossFallback(word, lv) && !emitSupplement(word, lv)) missingDict.push(word)
      continue
    }
    const display = d.word || word
    const existing = byWord.get(display)
    if (existing) {
      existing.lv |= lv
      continue
    }
    const outlineRec = cet4Outline.get(word) ?? cet6Outline.get(word)
    const entry = {
      w: display,
      lv,
      s: senses,
    }
    const phonetic = (d.phonetic || outlineRec?.phonetic || '').replace(/ә/g, 'ə')
    if (phonetic) entry.p = phonetic
    if (enDefs.length) entry.en = enDefs
    const ex = parseExchange(d.exchange)
    if (ex) entry.x = ex
    if (d.frq) entry.f = d.frq
    if (d.bnc) entry.b = d.bnc
    if (d.collins) entry.c = d.collins
    byWord.set(display, entry)
  }

  const entries = [...byWord.values()]
  entries.sort((a, b) => {
    const fa = a.f ?? 999999
    const fb = b.f ?? 999999
    if (fa !== fb) return fa - fb
    return a.w.localeCompare(b.w)
  })

  const byLv = { cet4: 0, cet6: 0, both: 0 }
  for (const e of entries) {
    if (e.lv === 1) byLv.cet4++
    else if (e.lv === 2) byLv.cet6++
    else byLv.both++
  }

  const vocab = { v: 1, n: entries.length, words: entries }
  const report = {
    generatedAt: new Date().toISOString(),
    sources: SOURCES,
    counts: {
      entries: entries.length,
      cet4Only: byLv.cet4,
      cet6Only: byLv.cet6,
      both: byLv.both,
      cet4Total: byLv.cet4 + byLv.both,
      cet6Total: byLv.cet6 + byLv.both,
      missingFromEcdict: missingDict.length,
    },
    missingFromEcdict: missingDict.slice(0, 100),
  }

  await import('node:fs/promises').then(async (fs) => {
    await fs.writeFile(path.join(DIST_DIR, 'lexfield-vocab.json'), JSON.stringify(vocab))
    await fs.writeFile(path.join(DIST_DIR, 'report.json'), JSON.stringify(report, null, 2))
  })

  console.log('---- report ----')
  console.log(JSON.stringify(report.counts, null, 2))
  const size = statSync(path.join(DIST_DIR, 'lexfield-vocab.json')).size
  console.log(`[out] lexfield-vocab.json (${(size / 1e6).toFixed(2)} MB)`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
