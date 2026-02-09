import fs from 'fs';
import path from 'path';

const today = new Date();
const date = today.toISOString().slice(0, 10);

async function j(url) {
  const r = await fetch(url, { headers: { 'User-Agent': 'daily-brief-bot/0.1' } });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}

async function text(url) {
  const r = await fetch(url, { headers: { 'User-Agent': 'daily-brief-bot/0.1' } });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.text();
}

async function fetchHN(limit = 10) {
  const ids = await j('https://hacker-news.firebaseio.com/v0/topstories.json');
  const out = [];
  for (const id of ids.slice(0, limit)) {
    const item = await j(`https://hacker-news.firebaseio.com/v0/item/${id}.json`);
    out.push({
      title: item.title,
      link: item.url || `https://news.ycombinator.com/item?id=${item.id}`,
      score: item.score || 0,
    });
  }
  return out;
}

async function fetchGitHubTrendingProxy(limit = 10) {
  const since = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const q = encodeURIComponent(`created:>${since}`);
  const url = `https://api.github.com/search/repositories?q=${q}&sort=stars&order=desc&per_page=${limit}`;
  const res = await j(url);
  return (res.items || []).map((x) => ({
    title: x.full_name,
    link: x.html_url,
    score: x.stargazers_count,
    desc: x.description || '',
  }));
}

async function fetchProductHuntFeed(limit = 10) {
  // Public feed (best-effort). If blocked, returns empty list.
  try {
    const xml = await text('https://www.producthunt.com/feed');
    const items = [...xml.matchAll(/<item>[\s\S]*?<title>([\s\S]*?)<\/title>[\s\S]*?<link>([\s\S]*?)<\/link>/g)]
      .slice(0, limit)
      .map((m) => ({ title: m[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim(), link: m[2].trim() }));
    return items;
  } catch {
    return [];
  }
}

function fetchXFromLocalReport(limit = 10) {
  const xDir = '/Users/dtjgp/Library/CloudStorage/OneDrive-PolitecnicodiTorino/Obsidian/PoliTO/X 日报';
  if (!fs.existsSync(xDir)) return [];
  const files = fs.readdirSync(xDir).filter((f) => /^X日报_\d{4}-\d{2}-\d{2}\.md$/.test(f)).sort();
  if (!files.length) return [];
  const latest = files[files.length - 1];
  const content = fs.readFileSync(path.join(xDir, latest), 'utf-8');
  const lines = content.split('\n').map((l) => l.trim()).filter(Boolean);
  const picks = lines
    .filter((l) => /^\d+\.|^[-•]/.test(l) || l.includes('http'))
    .slice(0, limit)
    .map((l) => ({ title: l.replace(/^\d+\.\s*/, ''), link: '' }));
  return picks;
}

function mdSection(name, rows) {
  if (!rows.length) return `## ${name}\n\n_暂无数据_\n`;
  const body = rows.map((r, i) => `${i + 1}. [${r.title}](${r.link || '#'})${r.score ? `（${r.score}）` : ''}${r.desc ? ` - ${r.desc}` : ''}`).join('\n');
  return `## ${name}\n\n${body}\n`;
}

async function main() {
  const [hn, gh, ph] = await Promise.all([
    fetchHN(10),
    fetchGitHubTrendingProxy(10),
    fetchProductHuntFeed(10),
  ]);
  const x = fetchXFromLocalReport(10);

  const payload = { date, sources: { hackernews: hn, github: gh, producthunt: ph, x: x } };
  fs.writeFileSync(`data/${date}.json`, JSON.stringify(payload, null, 2));

  const md = `# Daily Brief - ${date}\n\n` +
    `> Sources: Hacker News / GitHub (trending proxy) / Product Hunt / X monitored stream\n\n` +
    mdSection('Hacker News', hn) + '\n' +
    mdSection('GitHub Trending (proxy)', gh) + '\n' +
    mdSection('Product Hunt', ph) + '\n' +
    mdSection('X (from local X report)', x) + '\n';

  fs.writeFileSync(`daily/${date}.md`, md);
  console.log(`Generated daily/${date}.md`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
