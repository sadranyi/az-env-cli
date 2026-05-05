import Table from 'cli-table3';
import chalk from 'chalk';
import { AzureSetting } from './azure-export.js';
import type { SettingsDiff, DiffEntry, DiffEntryKind } from './azure-diff.js';

export function previewSettings(settings: AzureSetting[]): void {
  const table = new Table({
    head: [chalk.cyan('Name'), chalk.cyan('Value'), chalk.cyan('Slot'), chalk.cyan('Type')],
    colWidths: [30, 60, 6, 10],
    wordWrap: true,
  });

  let plain = 0;
  let vault = 0;
  for (const s of settings) {
    const isVault = s.value.startsWith('@Microsoft.KeyVault');
    if (isVault) vault++;
    else plain++;
    const type = isVault ? chalk.magenta('vault') : chalk.green('plain');
    const value = isVault ? chalk.magenta(s.value) : s.value;
    table.push([s.name, value, s.slotSetting ? chalk.yellow('yes') : chalk.dim('no'), type]);
  }

  console.log(table.toString());
  console.log(
    chalk.dim(
      `  ${settings.length} setting(s) — ${plain} plain, ${vault} via Key Vault\n`,
    ),
  );
}

const KIND_GLYPH: Record<DiffEntryKind, string> = {
  added: '+',
  removed: '-',
  changed: '~',
  unchanged: '=',
};

function colorForKind(kind: DiffEntryKind): (s: string) => string {
  switch (kind) {
    case 'added':
      return chalk.green;
    case 'removed':
      return chalk.red;
    case 'changed':
      return chalk.yellow;
    case 'unchanged':
      return chalk.dim;
  }
}

function renderValue(entry: DiffEntry): string {
  if (entry.kind === 'added') return chalk.green(entry.localValue ?? '');
  if (entry.kind === 'removed') return chalk.red(entry.azureValue ?? '');
  if (entry.kind === 'changed') {
    return `${chalk.dim(entry.azureValue ?? '')}\n${chalk.yellow('→ ' + (entry.localValue ?? ''))}`;
  }
  return chalk.dim(entry.localValue ?? entry.azureValue ?? '');
}

export function renderSticky(entry: DiffEntry): string {
  if (entry.kind === 'removed') {
    return entry.azureSticky ? chalk.dim('(sticky)') : chalk.dim('-');
  }
  const local = entry.localSticky ? 'yes' : 'no';
  if (!entry.stickyChanged) {
    return entry.localSticky ? chalk.yellow(local) : chalk.dim(local);
  }
  const old = entry.azureSticky ? 'yes' : 'no';
  const newValue = entry.localSticky ? 'yes' : 'no';
  const arrow = `${old}→${newValue}`;
  return chalk.yellow(arrow);
}

export function previewDiff(diff: SettingsDiff): void {
  const counts: Record<DiffEntryKind, number> = {
    added: 0,
    removed: 0,
    changed: 0,
    unchanged: 0,
  };
  let stickyChanges = 0;

  const table = new Table({
    head: [
      chalk.cyan(' '),
      chalk.cyan('Name'),
      chalk.cyan('Value'),
      chalk.cyan('Sticky'),
    ],
    colWidths: [3, 30, 60, 12],
    wordWrap: true,
  });

  for (const e of diff.entries) {
    counts[e.kind]++;
    if (e.stickyChanged) stickyChanges++;
    const c = colorForKind(e.kind);
    table.push([c(KIND_GLYPH[e.kind]), e.name, renderValue(e), renderSticky(e)]);
  }

  console.log(table.toString());

  const parts: string[] = [];
  if (counts.added) parts.push(chalk.green(`+${counts.added} added`));
  if (counts.changed) parts.push(chalk.yellow(`~${counts.changed} changed`));
  if (counts.removed) parts.push(chalk.red(`-${counts.removed} removed`));
  if (counts.unchanged) parts.push(chalk.dim(`=${counts.unchanged} unchanged`));
  if (stickyChanges) parts.push(chalk.yellow(`${stickyChanges} sticky change(s)`));

  if (parts.length === 0) {
    console.log(chalk.dim('  no changes\n'));
  } else {
    console.log('  ' + parts.join('  ') + '\n');
  }
}
