import { describe, it, expect, vi } from 'vitest';
import { dropConnection } from './dropConnection';
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
});
