/**
 * The cultures that name the world's features, each with its own sounds, see names.js makeRoot:
 * weighted syllable onsets, nuclei and codas, syllable shapes ("C" an onset, "V" a nucleus, "F" a
 * coda), how many syllables a root has, and signature pieces about a third of its roots start or
 * end with, so that its names sound related, and forbidden letter pairs that read badly in its
 * sounds, which no root contains. Letters stay within Latin-1, the font's subset.
 */
export const CULTURES = [
  {
    name: "aleni",
    onsets: { l: 3, n: 2, m: 2, v: 2, s: 1, th: 1, r: 2 },
    nuclei: { a: 4, e: 3, i: 3, o: 2, ae: 1, ia: 1 },
    codas: { n: 3, l: 2, r: 1, s: 1 },
    shapes: { CV: 5, V: 1, CVF: 2 },
    syllables: [2, 3],
    forbidden: ["rr", "ss", "lr", "rl", "nm", "lw", "rw", "nw", "sw"],
    signatures: [
      { text: "iel", at: "end" },
      { text: "wen", at: "end" },
      { text: "ae", at: "start" },
    ],
  },
  {
    name: "krodh",
    onsets: { k: 3, kr: 2, g: 2, gr: 1, d: 2, dr: 1, t: 2, b: 1, z: 1 },
    nuclei: { a: 3, o: 3, u: 3, e: 1, y: 1 },
    codas: { k: 2, rd: 1, rn: 1, sk: 1, g: 1, dh: 1, r: 2 },
    shapes: { CVF: 5, CV: 2 },
    syllables: [1, 2],
    forbidden: ["kk", "gk", "kg", "hg", "hk", "kd", "hd", "gg", "dd"],
    signatures: [
      { text: "gor", at: "end" },
      { text: "ak", at: "end" },
      { text: "kh", at: "start" },
    ],
  },
  {
    name: "skald",
    onsets: { h: 2, s: 2, sk: 1, v: 2, t: 2, b: 1, f: 1, j: 1, st: 1 },
    nuclei: { a: 3, e: 2, i: 2, o: 2, ø: 1, au: 1 },
    codas: { ld: 1, rn: 1, n: 2, r: 2, g: 1, ss: 1 },
    shapes: { CVF: 4, CV: 3 },
    syllables: [2, 2],
    forbidden: ["dt", "df", "gf", "rf", "sf", "gj", "dj", "db", "gt", "gd"],
    signatures: [
      { text: "heim", at: "end" },
      { text: "vik", at: "end" },
      { text: "dal", at: "end" },
    ],
  },
  {
    name: "kasumi",
    onsets: { k: 2, t: 2, s: 2, m: 2, n: 2, h: 2, y: 1, r: 2 },
    nuclei: { a: 4, i: 3, o: 3, u: 2, e: 2 },
    codas: { n: 1 },
    shapes: { CV: 6, CVF: 1 },
    syllables: [2, 4],
    forbidden: ["nm", "nh", "nr", "nn"],
    signatures: [
      { text: "ka", at: "end" },
      { text: "ro", at: "end" },
      { text: "shi", at: "start" },
    ],
  },
  {
    name: "zahir",
    onsets: { z: 1, s: 2, sh: 2, q: 1, kh: 1, r: 2, m: 2, n: 1, b: 1, d: 1 },
    nuclei: { a: 5, i: 2, u: 2, aa: 1 },
    codas: { r: 2, m: 1, n: 1, d: 1, sh: 1, z: 1 },
    shapes: { CVF: 3, CV: 3, V: 1 },
    syllables: [2, 3],
    forbidden: ["zz", "zq", "hq", "nq", "dq", "rq", "lq", "hz", "mk", "hk"],
    signatures: [
      { text: "al", at: "start" },
      { text: "ir", at: "end" },
      { text: "un", at: "end" },
    ],
  },
  {
    name: "valcor",
    onsets: { v: 2, c: 2, t: 2, m: 2, l: 2, p: 1, s: 2, r: 1 },
    nuclei: { a: 3, e: 2, i: 2, o: 2, u: 1 },
    codas: { s: 2, n: 2, r: 1, l: 1, x: 1 },
    shapes: { CV: 4, CVF: 3 },
    syllables: [2, 3],
    forbidden: ["rr", "ll", "lr", "xp", "xm", "xt", "xl", "xv", "xc", "xs"],
    signatures: [
      { text: "ia", at: "end" },
      { text: "um", at: "end" },
      { text: "or", at: "end" },
    ],
  },
];
