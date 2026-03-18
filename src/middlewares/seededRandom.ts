export type RandomSeed = number | string;

function stringToUint32(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function toUint32(seed: RandomSeed): number {
  if (typeof seed === 'number') {
    const n = Number.isFinite(seed) ? Math.floor(seed) : 0;
    return n >>> 0;
  }
  return stringToUint32(seed);
}

export function createRandom(seed?: RandomSeed): () => number {
  if (seed === undefined) return Math.random;

  let state = toUint32(seed);
  if (state === 0) {
    state = 0x6d2b79f5;
  }

  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
