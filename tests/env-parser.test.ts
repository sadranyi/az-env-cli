import { describe, it, expect } from 'vitest';
import { parseEnvContent } from '../src/env-parser.js';

describe('parseEnvContent', () => {
  it('parses a simple KEY=value line', () => {
    const [e] = parseEnvContent('FOO=bar');
    expect(e).toMatchObject({ name: 'FOO', value: 'bar', isSecret: false, slotSetting: false });
  });

  it('strips double and single quotes', () => {
    expect(parseEnvContent('A="hello world"')[0].value).toBe('hello world');
    expect(parseEnvContent("B='hello world'")[0].value).toBe('hello world');
  });

  it('does NOT strip mismatched quotes', () => {
    expect(parseEnvContent(`A="hello'`)[0].value).toBe(`"hello'`);
  });

  it('strips inline comments outside quotes', () => {
    expect(parseEnvContent('FOO=bar # a note')[0].value).toBe('bar');
  });

  it('keeps # inside quoted values', () => {
    expect(parseEnvContent('URL="https://x.com/#fragment"')[0].value).toBe(
      'https://x.com/#fragment',
    );
  });

  it('handles export prefix', () => {
    expect(parseEnvContent('export FOO=bar')[0].name).toBe('FOO');
  });

  it('skips empty lines and pure-comment lines', () => {
    expect(parseEnvContent('\n# comment\n\nFOO=bar\n').length).toBe(1);
  });

  it('detects @secret marker', () => {
    const [e] = parseEnvContent('PWD=changeme # @secret');
    expect(e.isSecret).toBe(true);
    expect(e.vaultRef).toBeUndefined();
  });

  it('detects @slot marker', () => {
    const [e] = parseEnvContent('CLIENT_ID=abc # @slot');
    expect(e.slotSetting).toBe(true);
  });

  it('combines @secret and @slot in the same comment', () => {
    const [e] = parseEnvContent('TOKEN=x # @secret @slot');
    expect(e.isSecret).toBe(true);
    expect(e.slotSetting).toBe(true);
  });

  it('parses parameterized @secret(vault=,name=)', () => {
    const [e] = parseEnvContent('DB_PWD=changeme # @secret(vault=v1,name=DB-PWD)');
    expect(e.isSecret).toBe(true);
    expect(e.vaultRef).toEqual({ vault: 'v1', secretName: 'DB-PWD' });
  });

  it('keeps the first = sign and treats the rest as value', () => {
    expect(parseEnvContent('CONN=k=v;a=b')[0].value).toBe('k=v;a=b');
  });

  it('records 1-based line number', () => {
    const lines = '\n\nFOO=bar';
    expect(parseEnvContent(lines)[0].rawLine).toBe(3);
  });

  it('preserves order across multiple entries', () => {
    const out = parseEnvContent('A=1\nB=2\nC=3');
    expect(out.map((e) => e.name)).toEqual(['A', 'B', 'C']);
  });

  it('does not treat a key without = as an entry', () => {
    expect(parseEnvContent('JUSTAKEY')).toEqual([]);
  });
});
