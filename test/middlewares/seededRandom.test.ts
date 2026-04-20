import { describe, it, expect } from 'vitest';
import { createRandom } from '../../src/middlewares/seededRandom';

describe('seededRandom', () => {
  it('is deterministic for the same string seed', () => {
    const a = createRandom('alpha-seed');
    const b = createRandom('alpha-seed');

    const seqA = [a(), a(), a(), a(), a()];
    const seqB = [b(), b(), b(), b(), b()];

    expect(seqA).toEqual(seqB);
  });

  it('changes sequence for different string seeds', () => {
    const a = createRandom('alpha-seed');
    const b = createRandom('beta-seed');

    const seqA = [a(), a(), a()];
    const seqB = [b(), b(), b()];

    expect(seqA).not.toEqual(seqB);
  });

  it('uses non-zero fallback state when numeric seed resolves to zero', () => {
    const fromZero = createRandom(0);
    const fromFallbackSeed = createRandom(0x6d2b79f5);

    const seqZero = [fromZero(), fromZero(), fromZero(), fromZero()];
    const seqFallback = [fromFallbackSeed(), fromFallbackSeed(), fromFallbackSeed(), fromFallbackSeed()];

    expect(seqZero).toEqual(seqFallback);
  });
});
