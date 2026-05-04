import Table from 'cli-table3';
import chalk from 'chalk';
import { AzureSetting } from './azure-export.js';

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
