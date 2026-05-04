import { readFileSync } from 'node:fs';

export interface ParsedEntry {
  name: string;
  value: string;
  isSecret: boolean;
  slotSetting: boolean;
  vaultRef?: { vault?: string; secretName?: string };
  rawLine: number;
}

const MARKER_RE = /@secret(?:\(([^)]*)\))?|@slot/g;

function parseMarkerArgs(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of s.split(',')) {
    const [k, v] = part.split('=').map((x) => x.trim());
    if (k && v) out[k] = v;
  }
  return out;
}

function stripQuotes(v: string): string {
  if (v.length >= 2) {
    const first = v[0];
    const last = v[v.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return v.slice(1, -1);
    }
  }
  return v;
}

function findCommentIndex(line: string): number {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '\\' && (inSingle || inDouble)) {
      i++;
      continue;
    }
    if (c === "'" && !inDouble) inSingle = !inSingle;
    else if (c === '"' && !inSingle) inDouble = !inDouble;
    else if (c === '#' && !inSingle && !inDouble) return i;
  }
  return -1;
}

export function parseEnvFile(path: string): ParsedEntry[] {
  const text = readFileSync(path, 'utf8');
  return parseEnvContent(text);
}

export function parseEnvContent(text: string): ParsedEntry[] {
  const out: ParsedEntry[] = [];
  const lines = text.split(/\r?\n/);

  lines.forEach((line, idx) => {
    if (!line.trim() || line.trim().startsWith('#')) return;

    let body = line;
    let comment = '';
    const hashIdx = findCommentIndex(line);
    if (hashIdx !== -1) {
      body = line.slice(0, hashIdx);
      comment = line.slice(hashIdx + 1);
    }

    const eq = body.indexOf('=');
    if (eq === -1) return;

    let name = body.slice(0, eq).trim();
    if (name.startsWith('export ')) name = name.slice(7).trim();
    if (!name) return;

    const value = stripQuotes(body.slice(eq + 1).trim());

    let isSecret = false;
    let slotSetting = false;
    let vaultRef: ParsedEntry['vaultRef'];

    for (const m of comment.matchAll(MARKER_RE)) {
      if (m[0].startsWith('@secret')) {
        isSecret = true;
        if (m[1]) {
          const args = parseMarkerArgs(m[1]);
          vaultRef = { vault: args.vault, secretName: args.name };
        }
      } else if (m[0] === '@slot') {
        slotSetting = true;
      }
    }

    out.push({ name, value, isSecret, slotSetting, vaultRef, rawLine: idx + 1 });
  });

  return out;
}
