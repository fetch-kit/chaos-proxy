import { describe, it, expect, vi } from 'vitest';
import { dropConnection } from '../../src/middlewares/dropConnection';
import type { Context } from 'koa';

describe('dropConnection middleware', () => {
  function createMockCtx(socketDestroy: () => void): Context {
    return {
      res: { socket: { destroy: socketDestroy }, end: vi.fn() },
      method: 'GET',
      set: vi.fn(),
    } as unknown as Context;
  }
  it('destroys socket with given probability', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1);
    const destroy = vi.fn();
    const ctx = createMockCtx(destroy);
    const mw = dropConnection({ prob: 0.2 });
    await mw(ctx, async () => {});
    expect(destroy).toHaveBeenCalled();
    vi.restoreAllMocks();
  });
  it('calls next if not dropping', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.9);
    const destroy2 = vi.fn();
    const ctx = createMockCtx(destroy2);
    const next2 = vi.fn();
    const mw = dropConnection({ prob: 0.2 });
    await mw(ctx, next2);
    expect(next2).toHaveBeenCalled();
    vi.restoreAllMocks();
  });
  it('ends response if no socket', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1);
    const end = vi.fn();
    const ctx = {
      res: { end },
      method: 'GET',
      set: vi.fn(),
    } as unknown as Context;
    const mw = dropConnection({ prob: 1 });
    await mw(ctx, async () => {});
    expect(end).toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it('is deterministic for the same seed', async () => {
    const runSeq = async () => {
      const mw = dropConnection({ prob: 0.5, seed: 777 });
      const out: boolean[] = [];
      for (let i = 0; i < 8; i++) {
        const destroy = vi.fn();
        const ctx = createMockCtx(destroy);
        await mw(ctx, async () => {});
        out.push(destroy.mock.calls.length > 0);
      }
      return out;
    };

    const a = await runSeq();
    const b = await runSeq();
    expect(a).toEqual(b);
  });

  it('changes sequence with different seeds', async () => {
    const runSeq = async (seed: number) => {
      const mw = dropConnection({ prob: 0.5, seed });
      const out: boolean[] = [];
      for (let i = 0; i < 8; i++) {
        const destroy = vi.fn();
        const ctx = createMockCtx(destroy);
        await mw(ctx, async () => {});
        out.push(destroy.mock.calls.length > 0);
      }
      return out;
    };

    const a = await runSeq(11);
    const b = await runSeq(12);
    expect(a).not.toEqual(b);
  });
});
