// Gerador compacto de QR Code (SVG) para TOTP sem dependências externas.
// Suporta modo byte (UTF-8), correção de erro L e versões 1 a 6 (até 134 bytes).

const VERSIONS = [
  null,
  [19, 7, 1],
  [34, 10, 1],
  [55, 15, 1],
  [80, 20, 1],
  [108, 26, 1],
  [136, 18, 2],
];

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
for (let i = 0, x = 1; i < 255; i++) {
  EXP[i] = x;
  EXP[i + 255] = x;
  LOG[x] = i;
  x <<= 1;
  if (x & 256) x ^= 0x11d;
}
const gfMul = (a, b) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

function rsGenerator(ecCount) {
  let g = [1];
  for (let i = 0; i < ecCount; i++) {
    const next = new Array(g.length + 1).fill(0);
    for (let j = 0; j < g.length; j++) {
      next[j] ^= g[j];
      next[j + 1] ^= gfMul(g[j], EXP[i]);
    }
    g = next;
  }
  return g;
}

function rsRemainder(data, ecCount) {
  const gen = rsGenerator(ecCount);
  const rem = new Uint8Array(ecCount);
  for (const byte of data) {
    const factor = byte ^ rem[0];
    rem.copyWithin(0, 1);
    rem[ecCount - 1] = 0;
    if (factor) for (let i = 0; i < ecCount; i++) rem[i] ^= gfMul(gen[i + 1], factor);
  }
  return rem;
}

function encodeCodewords(bytes, dataCap, ecPerBlock, blocks) {
  const bits = [];
  const push = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1); };
  push(0b0100, 4);
  push(bytes.length, 8);
  for (const b of bytes) push(b, 8);
  for (let i = 0; i < 4 && bits.length < dataCap * 8; i++) bits.push(0);
  while (bits.length % 8 !== 0) bits.push(0);
  const data = [];
  for (let i = 0; i < bits.length; i += 8) {
    let v = 0;
    for (let j = 0; j < 8; j++) v = (v << 1) | bits[i + j];
    data.push(v);
  }
  for (let p = 0; data.length < dataCap; p++) data.push(p % 2 === 0 ? 0xec : 0x11);

  const blockSize = dataCap / blocks;
  const dBlocks = [];
  const eBlocks = [];
  for (let b = 0; b < blocks; b++) {
    const slice = data.slice(b * blockSize, (b + 1) * blockSize);
    dBlocks.push(slice);
    eBlocks.push(rsRemainder(slice, ecPerBlock));
  }
  const out = [];
  for (let i = 0; i < blockSize; i++) for (let b = 0; b < blocks; b++) out.push(dBlocks[b][i]);
  for (let i = 0; i < ecPerBlock; i++) for (let b = 0; b < blocks; b++) out.push(eBlocks[b][i]);
  return out;
}

export function qrSvg(text, { margin = 2 } = {}) {
  const bytes = Buffer.from(String(text), 'utf8');
  const ver = VERSIONS.findIndex((v) => v && bytes.length <= v[0] - 2);
  if (ver < 1) throw new Error('QR payload excede o tamanho suportado.');
  const [dataCap, ecPerBlock, blocks] = VERSIONS[ver];
  const codewords = encodeCodewords(bytes, dataCap, ecPerBlock, blocks);
  const size = 17 + 4 * ver;
  const mod = Array.from({ length: size }, () => new Int8Array(size).fill(-1));
  const res = Array.from({ length: size }, () => new Uint8Array(size));

  const set = (r, c, v, reserve = true) => {
    if (r < 0 || c < 0 || r >= size || c >= size) return;
    mod[r][c] = v;
    if (reserve) res[r][c] = 1;
  };
  const finder = (tr, tc) => {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const inside = r >= 0 && r <= 6 && c >= 0 && c <= 6;
        const dark = inside && (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4));
        set(tr + r, tc + c, dark ? 1 : 0);
      }
    }
  };
  finder(0, 0);
  finder(0, size - 7);
  finder(size - 7, 0);

  for (let i = 8; i < size - 8; i++) {
    set(6, i, i % 2 === 0 ? 1 : 0);
    set(i, 6, i % 2 === 0 ? 1 : 0);
  }
  if (ver >= 2) {
    const ar = size - 7;
    for (let r = -2; r <= 2; r++) {
      for (let c = -2; c <= 2; c++) {
        set(ar + r, ar + c, Math.max(Math.abs(r), Math.abs(c)) === 1 ? 0 : 1);
      }
    }
  }
  set(size - 8, 8, 1);

  // Reserva área de formato antes de preencher os dados
  for (let i = 0; i < 9; i++) { if (i !== 6) { res[8][i] = 1; res[i][8] = 1; } }
  for (let i = 0; i < 8; i++) { res[8][size - 1 - i] = 1; if (i < 7) res[size - 1 - i][8] = 1; }

  const bitAt = (idx) => {
    const byteIdx = idx >> 3;
    return byteIdx < codewords.length ? (codewords[byteIdx] >> (7 - (idx & 7))) & 1 : 0;
  };
  let idx = 0;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col--;
    const up = ((size - 1 - col) >> 1) % 2 === 0;
    for (let step = 0; step < size; step++) {
      const r = up ? size - 1 - step : step;
      for (let dc = 0; dc < 2; dc++) {
        const c = col - dc;
        if (!res[r][c]) mod[r][c] = bitAt(idx++) ^ ((r + c) % 2 === 0 ? 1 : 0);
      }
    }
  }

  // Formato: ECC L (01) + Mask 0 (000) => 0x77c4
  const fmt = 0x77c4;
  const f = (b) => (fmt >> b) & 1;
  for (let i = 0; i < 6; i++) set(8, i, f(14 - i));
  set(8, 7, f(8));
  set(8, 8, f(7));
  set(7, 8, f(6));
  for (let i = 0; i < 6; i++) set(5 - i, 8, f(5 - i));
  for (let i = 0; i < 7; i++) set(size - 1 - i, 8, f(14 - i));
  for (let i = 0; i < 8; i++) set(8, size - 8 + i, f(7 - i));

  let path = '';
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (mod[r][c] === 1) path += `M${c + margin},${r + margin}h1v1h-1z`;
    }
  }
  const dim = size + margin * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}" width="180" height="180" shape-rendering="crispEdges" role="img" aria-label="QR Code para aplicativo autenticador"><rect width="100%" height="100%" fill="#fff"/><path fill="#0a1a3d" d="${path}"/></svg>`;
}
