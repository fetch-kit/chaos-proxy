import { describe, it, expect, vi } from 'vitest';
import { emitVerbose } from '../src/logging/verbose';

describe('CLI verbose event', () => {
  it('emits verbose.config.loaded event with config_path', () => {
    const consoleSpy = vi.spyOn(console, 'log');

    emitVerbose(true, 'verbose.config.loaded', {
      config_path: 'test-chaos.yaml',
    });

    expect(consoleSpy).toHaveBeenCalled();
    const output = consoleSpy.mock.calls[0][0];
    expect(output).toContain('event=verbose.config.loaded');
    expect(output).toContain('config_path=test-chaos.yaml');

    consoleSpy.mockRestore();
  });

  it('does not emit verbose event when verbose=false', () => {
    const consoleSpy = vi.spyOn(console, 'log');
    const consoleErrorSpy = vi.spyOn(console, 'error');

    emitVerbose(false, 'verbose.config.loaded', {
      config_path: 'test-chaos.yaml',
    });

    expect(consoleSpy).not.toHaveBeenCalled();
    expect(consoleErrorSpy).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it('emits verbose error events to console.error when level=ERROR', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error');

    emitVerbose(true, 'verbose.error', {
      req_id: 'rq_test123',
      class: 'upstream_request_error',
      status: 502,
      message: 'connection refused',
    }, 'ERROR');

    expect(consoleErrorSpy).toHaveBeenCalled();
    const output = consoleErrorSpy.mock.calls[0][0];
    expect(output).toContain('event=verbose.error');
    expect(output).toContain('class=upstream_request_error');

    consoleErrorSpy.mockRestore();
  });
});
