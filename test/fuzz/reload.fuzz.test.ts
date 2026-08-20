import fc from 'fast-check';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { startServer, type ChaosProxyServer } from '../../src/server';

const FUZZ_PORT = 13_777;
let server: ChaosProxyServer;
let consoleLog: ReturnType<typeof vi.spyOn>;

beforeAll(() => {
  consoleLog = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  server = startServer({ target: 'https://example.test', port: FUZZ_PORT });
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  consoleLog.mockRestore();
});

describe('reload state-machine fuzzing', () => {
  it('advances the runtime version only for arbitrary valid reloads', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.boolean(), { minLength: 1, maxLength: 50 }),
        async (validReloads) => {
          let expectedVersion = server.getRuntimeVersion();

          for (const valid of validReloads) {
            const result = await server.reloadConfig(
              valid
                ? { target: `https://v${expectedVersion}.example.test`, port: FUZZ_PORT }
                : { port: FUZZ_PORT },
            );
            if (valid) expectedVersion++;

            expect(result.ok).toBe(valid);
            expect(result.version).toBe(expectedVersion);
            expect(server.getRuntimeVersion()).toBe(expectedVersion);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it('admits exactly one writer for arbitrary overlapping reload pairs', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.tuple(fc.string({ minLength: 1, maxLength: 20 }), fc.string({ minLength: 1, maxLength: 20 })),
        async ([firstTarget, secondTarget]) => {
          const oldVersion = server.getRuntimeVersion();
          const first = server.reloadConfig({
            target: `https://${encodeURIComponent(firstTarget)}.example.test`,
            port: FUZZ_PORT,
          });
          const second = server.reloadConfig({
            target: `https://${encodeURIComponent(secondTarget)}.example.test`,
            port: FUZZ_PORT,
          });

          const [firstResult, secondResult] = await Promise.all([first, second]);

          expect(firstResult.ok).toBe(true);
          expect(firstResult.version).toBe(oldVersion + 1);
          expect(secondResult).toMatchObject({
            ok: false,
            statusCode: 409,
            version: oldVersion,
          });
          expect(server.getRuntimeVersion()).toBe(oldVersion + 1);
        },
      ),
      { numRuns: 200 },
    );
  });
});
