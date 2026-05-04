import figlet from 'figlet';
import gradient from 'gradient-string';
import chalk from 'chalk';

export function renderBanner(): void {
  const text = figlet.textSync('AZ ENV CLI', { font: 'ANSI Shadow' });
  const azureGradient = gradient(['#0078d4', '#50e6ff', '#ffffff']);
  console.log(azureGradient.multiline(text));
  console.log(chalk.dim('         .env  →  Azure App Settings, safely.\n'));
}
