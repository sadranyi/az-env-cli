import { describe, it, expect } from 'vitest';
import { renderSticky } from '../src/preview.js';
import type { DiffEntry } from '../src/azure-diff.js';

const stripAnsi = (s: string): string =>
  // eslint-disable-next-line no-control-regex
  s.replace(/\x1B\[[0-9;]*m/g, '');

const entry = (over: Partial<DiffEntry> & Pick<DiffEntry, 'kind' | 'name'>): DiffEntry => ({
  stickyChanged: false,
  ...over,
});

describe('renderSticky', () => {
  it('renders yes→no when sticky is being removed', () => {
    const out = stripAnsi(
      renderSticky(
        entry({
          kind: 'unchanged',
          name: 'A',
          azureSticky: true,
          localSticky: false,
          stickyChanged: true,
        }),
      ),
    );
    expect(out).toBe('yes→no');
  });

  it('renders no→yes when sticky is being added', () => {
    const out = stripAnsi(
      renderSticky(
        entry({
          kind: 'unchanged',
          name: 'A',
          azureSticky: false,
          localSticky: true,
          stickyChanged: true,
        }),
      ),
    );
    expect(out).toBe('no→yes');
  });

  it('renders plain "yes" when local is sticky and unchanged', () => {
    const out = stripAnsi(
      renderSticky(
        entry({
          kind: 'unchanged',
          name: 'A',
          azureSticky: true,
          localSticky: true,
          stickyChanged: false,
        }),
      ),
    );
    expect(out).toBe('yes');
  });

  it('renders plain "no" when neither side is sticky', () => {
    const out = stripAnsi(
      renderSticky(
        entry({
          kind: 'unchanged',
          name: 'A',
          azureSticky: false,
          localSticky: false,
          stickyChanged: false,
        }),
      ),
    );
    expect(out).toBe('no');
  });

  it('renders "(sticky)" for removed entries that were sticky on Azure', () => {
    const out = stripAnsi(
      renderSticky(
        entry({
          kind: 'removed',
          name: 'A',
          azureSticky: true,
          stickyChanged: false,
        }),
      ),
    );
    expect(out).toBe('(sticky)');
  });

  it('renders "-" for removed entries that were not sticky', () => {
    const out = stripAnsi(
      renderSticky(
        entry({
          kind: 'removed',
          name: 'A',
          azureSticky: false,
          stickyChanged: false,
        }),
      ),
    );
    expect(out).toBe('-');
  });
});
