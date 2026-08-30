// one-off generator: multi-size ICO for the Tauri NSIS bundle (run via node tools/make-ico.cjs)
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

function crc32(buf) {
  let c
  const table = []
  for (let n = 0; n < 256; n++) {
    c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : c >>> 1
    table[n] = c >>> 0
  }
  let crc = 0xffffffff
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}

function png(size) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  const ink = [25, 25, 25, 255]
  const yellow = [255, 250, 0, 255]
  const paper = [242, 242, 240, 255]
  const green = [0, 255, 162, 255]
  const rows = []
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 4)
    row[0] = 0 // filter none
    for (let x = 0; x < size; x++) {
      let px = paper
      const m = size / 64
      if (x >= 8 * m && x < 56 * m && y >= 8 * m && y < 56 * m) px = ink
      if (x >= 14 * m && x < 24 * m && y >= 14 * m && y < 40 * m) px = yellow
      if (x >= 14 * m && x < 40 * m && y >= 40 * m && y < 50 * m) px = yellow
      if (x >= 44 * m && x < 48 * m && y >= 14 * m && y < 40 * m) px = green
      for (let k = 0; k < 4; k++) row[1 + x * 4 + k] = px[k]
    }
    rows.push(row)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function ico(sizes) {
  const pngs = sizes.map(png)
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2) // type icon
  header.writeUInt16LE(sizes.length, 4)
  const entries = []
  let offset = 6 + 16 * sizes.length
  sizes.forEach((s, i) => {
    const e = Buffer.alloc(16)
    e[0] = s >= 256 ? 0 : s
    e[1] = s >= 256 ? 0 : s
    e.writeUInt16LE(1, 4)
    e.writeUInt16LE(32, 6)
    e.writeUInt32LE(pngs[i].length, 8)
    e.writeUInt32LE(offset, 12)
    offset += pngs[i].length
    entries.push(e)
  })
  return Buffer.concat([header, ...entries, ...pngs])
}

const out = process.argv[2]
fs.mkdirSync(path.dirname(out), { recursive: true })
fs.writeFileSync(out, ico([16, 32, 48, 256]))
console.log('written', out, fs.statSync(out).size, 'bytes')
