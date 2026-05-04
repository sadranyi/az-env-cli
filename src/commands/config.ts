import { Command } from 'commander';
import chalk from 'chalk';
import { configPath, readScope, setKey, ConfigScope, AzEnvConfig } from '../config.js';

function pickScope(opts: { system?: boolean; global?: boolean }): ConfigScope {
  if (opts.system) return 'system';
  if (opts.global) return 'global';
  return 'local';
}

function readDotted(cfg: AzEnvConfig, dotted: string): unknown {
  return dotted.split('.').reduce<unknown>((o, k) => {
    if (o && typeof o === 'object' && !Array.isArray(o)) {
      return (o as Record<string, unknown>)[k];
    }
    return undefined;
  }, cfg);
}

export function registerConfig(program: Command): void {
  const cmd = program
    .command('config')
    .description('Get or set config values (git-style: --system, --global, default --local).')
    .option('--system', 'apply to system scope')
    .option('--global', 'apply to user scope (~/.azenvrc)')
    .option('--local', 'apply to project scope (./.azenvrc)', false)
    .option('-l, --list', 'list all config values per scope')
    .argument('[key]', 'dotted key (e.g. resource.group)')
    .argument('[value]', 'value to set; omit to read')
    .action(
      (
        key: string | undefined,
        value: string | undefined,
        opts: { system?: boolean; global?: boolean; list?: boolean },
      ) => {
        const scope = pickScope(opts);

        if (opts.list) {
          for (const s of ['system', 'global', 'local'] as const) {
            console.log(chalk.cyan(`[${s}] ${configPath(s)}`));
            const cfg = readScope(s);
            if (Object.keys(cfg).length === 0) console.log(chalk.dim('  (empty)'));
            else console.log(JSON.stringify(cfg, null, 2));
            console.log();
          }
          return;
        }

        if (!key) {
          cmd.help();
          return;
        }

        if (value === undefined) {
          const v = readDotted(readScope(scope), key);
          if (v === undefined) process.exit(1);
          console.log(typeof v === 'string' ? v : JSON.stringify(v));
          return;
        }

        setKey(scope, key, value);
        console.log(chalk.green(`set [${scope}] ${key} = ${value}`));
      },
    );
}
