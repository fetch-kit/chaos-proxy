import { describe, it, expect, vi } from 'vitest';
import { fail } from './fail';
import type { Context } from 'koa';

describe('fail middleware', () => {
  function createMockCtx(): Context {
    return {
      status: undefined,
      body: undefined,
      set: vi.fn(),
      method: 'GET',
    } as unknown as Context;
  }
  it('responds with status and body', async () => {
    const ctx = createMockCtx();
    const mw = fail({ status: 418, body: 'fail!' });
    await mw(ctx, async () => {});
    expect(ctx.status).toBe(418);
    expect(ctx.body).toBe('fail!');
  });
  it('defaults to 503 and default body', async () => {
    const ctx = createMockCtx();
    const mw2 = fail({});
    await mw2(ctx, async () => {});
    expect(ctx.status).toBe(503);
    expect(ctx.body).toBe('Failed by chaos-proxy');
  });
});
