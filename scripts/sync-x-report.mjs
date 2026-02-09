import fs from 'fs';
import path from 'path';

const srcDir = '/Users/dtjgp/Library/CloudStorage/OneDrive-PolitecnicodiTorino/Obsidian/PoliTO/X 日报';
const outDir = 'data/x';

if (!fs.existsSync(srcDir)) {
  console.error(`X report folder not found: ${srcDir}`);
  process.exit(1);
}

const files = fs.readdirSync(srcDir)
  .filter((f) => /^X日报_\d{4}-\d{2}-\d{2}\.md$/.test(f))
  .sort();

if (!files.length) {
  console.error('No X report file found.');
  process.exit(1);
}

const latest = files[files.length - 1];
const content = fs.readFileSync(path.join(srcDir, latest), 'utf-8');

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'latest.md'), content);
fs.writeFileSync(path.join(outDir, latest), content);

console.log(`Synced X report: ${latest} -> ${outDir}/latest.md`);
