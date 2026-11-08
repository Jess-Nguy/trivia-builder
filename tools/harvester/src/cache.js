import fs from 'node:fs';
import path from 'node:path';

/** Read `<dir>/<name>.json`, or undefined when missing or older than maxAgeMs. */
export function readCache(dir, name, maxAgeMs = Infinity) {
  const file = path.join(dir, `${name}.json`);
  if (!fs.existsSync(file)) return undefined;
  if (Date.now() - fs.statSync(file).mtimeMs > maxAgeMs) return undefined;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function writeCache(dir, name, value) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify(value));
}
