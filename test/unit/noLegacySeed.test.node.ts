// Confirms the stale Focus Insights seed mechanism (superseded by
// src/util/categoryClassMigration.ts) is fully removed — no dangling code
// path still references it, and the seed file itself is gone.
import fs from 'fs';
import path from 'path';

const SRC_ROOT = path.resolve(__dirname, '../../src');
const FORBIDDEN = ['categoryClassSeed', 'ensureClassSeed', 'class_seed_applied'];

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

describe('legacy Focus Insights seed is fully removed', () => {
  test('src/util/categoryClassSeed.json no longer exists', () => {
    expect(fs.existsSync(path.join(SRC_ROOT, 'util', 'categoryClassSeed.json'))).toBe(false);
  });

  test('no file under src/ references the retired seed mechanism', () => {
    const offenders: string[] = [];
    for (const file of walk(SRC_ROOT)) {
      const content = fs.readFileSync(file, 'utf-8');
      for (const term of FORBIDDEN) {
        if (content.includes(term)) {
          offenders.push(`${path.relative(SRC_ROOT, file)}: "${term}"`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
