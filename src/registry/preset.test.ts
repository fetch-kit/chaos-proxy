import { describe, it, expect } from 'vitest';
import { registerPreset, resolvePreset } from './preset';
import type { RequestHandler } from 'express';

describe('preset registry', () => {
  it('registers and resolves a preset', () => {
    const mw1 = ((req, res, next) => next()) as RequestHandler;
    const mw2 = ((req, res, next) => next()) as RequestHandler;
    registerPreset('testPreset', [mw1, mw2]);
    const result = resolvePreset('testPreset');
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(2);
    expect(result[0]).toBe(mw1);
    expect(result[1]).toBe(mw2);
  });

  it('throws for unknown preset', () => {
    expect(() => resolvePreset('notRegistered')).toThrow(/Unknown preset/);
  });

  it('overwrites existing preset', () => {
    const mwA = ((req, res, next) => next()) as RequestHandler;
    registerPreset('dupPreset', [mwA]);
    const mwB = ((req, res, next) => next()) as RequestHandler;
    registerPreset('dupPreset', [mwB]);
    const result = resolvePreset('dupPreset');
    expect(result.length).toBe(1);
    expect(result[0]).toBe(mwB);
  });
});
