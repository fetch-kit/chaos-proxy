import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('./config/loader.ts', () => ({
  loadConfig: vi.fn(() => ({ foo: 'bar' }))
}));
vi.mock('./server.ts', () => ({
  startServer: vi.fn()
}));
vi.mock('./registry/builtin.ts', () => ({
  registerBuiltins: vi.fn()
}));

describe('src/index.ts', () => {
  let originalArgv: string[];

  beforeEach(() => {
    originalArgv = process.argv;
  });

  afterEach(() => {
    process.argv = originalArgv;
    vi.resetModules();
  });

  it('registers builtins and starts server with default config', async () => {
    process.argv = ['node', 'index.js'];
    await vi.importActual('./index');
    const { loadConfig } = await vi.importMock('./config/loader.ts');
    const { startServer } = await vi.importMock('./server.ts');
    const { registerBuiltins } = await vi.importMock('./registry/builtin.ts');
    expect(registerBuiltins).toHaveBeenCalled();
    expect(loadConfig).toHaveBeenCalledWith('chaos.yaml');
    expect(startServer).toHaveBeenCalledWith({ foo: 'bar' }, { verbose: false });
  });

  it('handles --config and --verbose args', async () => {
    process.argv = ['node', 'index.js', '--config', 'custom.yaml', '--verbose'];
    await vi.importActual('./index');
    const { loadConfig } = await vi.importMock('./config/loader.ts');
    const { startServer } = await vi.importMock('./server.ts');
    expect(loadConfig).toHaveBeenCalledWith('custom.yaml');
    expect(startServer).toHaveBeenCalledWith({ foo: 'bar' }, { verbose: true });
  });

  it('handles missing config file error', async () => {
    const { loadConfig } = await vi.importMock('./config/loader.ts');
    (loadConfig as any).mockImplementation(() => { throw new Error('Config file not found'); });
    process.argv = ['node', 'index.js'];
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('process.exit called'); });
    await expect(async () => {
      await vi.importActual('./index');
    }).rejects.toThrow('process.exit called');
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });
});
