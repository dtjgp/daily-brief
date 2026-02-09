import fs from 'fs';
import path from 'path';

const today = new Date();
const date = today.toISOString().slice(0, 10);

async function j(url) {
  const r = await fetch(url, { headers: { 'User-Agent': 'daily-brief-bot/0.2' } });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}

async function text(url) {
  const r = await fetch(url, { headers: { 'User-Agent': 'daily-brief-bot/0.2' } });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.text();
}

const clean = (s = '') => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

function oneLiner(title, desc = '') {
  const t = clean(title);
  const d = clean(desc);

  // 1) If we have description, prefer specific compressed summary
  if (d) {
    const s = d
      .replace(/^\W+/, '')
      .split(/(?<=[.!?。！？])\s+/)[0]
      .slice(0, 120);
    if (s.length >= 18) return s;
  }

  // 2) Keyword-driven synthesis from title to avoid repetitive generic text
  const rules = [
    [/\b(ai|agent|llm|gpt|model|openai|claude|gemini)\b/i, '聚焦 AI/Agent 能力，核心看可复用性与真实落地场景。'],
    [/\b(security|vuln|hack|exploit|cve|malware)\b/i, '偏安全/攻防方向，重点关注风险面与可操作防护建议。'],
    [/\b(open source|github|repo|framework|sdk|cli|tool|library)\b/i, '偏开源工具链更新，适合评估是否纳入你的日常工作流。'],
    [/\b(video|image|audio|speech|vision)\b/i, '偏多模态与内容生成方向，适合关注生产效率与质量提升。'],
    [/\b(performance|latency|speed|efficient|optimization)\b/i, '核心在性能优化，建议关注速度、成本与精度三者平衡。'],
  ];
  for (const [re, line] of rules) {
    if (re.test(`${t} ${d}`)) return line;
  }

  // 3) Fallback: still specific to title
  return `这条主要讨论「${t.slice(0, 28)}${t.length > 28 ? '…' : ''}」，建议按与你当前课题相关度决定是否深读。`;
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
      summary: oneLiner(item.title),
    });
  }
  return out;
}

async function fetchGitHubTrending(limit = 10) {
  const html = await text('https://github.com/trending');
  const blocks = [...html.matchAll(/<article[\s\S]*?<\/article>/g)].slice(0, limit);
  return blocks.map((m) => {
    const b = m[0];
    const repoPath = clean((b.match(/<h2[\s\S]*?<a[^>]*href="([^"]+)"/i) || [])[1] || '');
    const title = repoPath.replace(/^\//, '');
    const desc = clean((b.match(/<p[^>]*>([\s\S]*?)<\/p>/i) || [])[1] || '');
    const starsRaw = clean((b.match(/<a[^>]*href="[^"]*stargazers"[^>]*>([\s\S]*?)<\/a>/i) || [])[1] || '');
    return {
      title,
      link: repoPath ? `https://github.com${repoPath}` : 'https://github.com/trending',
      score: starsRaw,
      desc,
      summary: oneLiner(title, desc),
    };
  }).filter((x) => x.title);
}

async function fetchProductHuntFeed(limit = 10) {
  try {
    const xml = await text('https://www.producthunt.com/feed');
    // Product Hunt feed is Atom, not RSS <item>
    const entries = [...xml.matchAll(/<entry>[\s\S]*?<title>([\s\S]*?)<\/title>[\s\S]*?<link[^>]*href="([^"]+)"[^>]*\/>[\s\S]*?(?:<content[^>]*>([\s\S]*?)<\/content>)?[\s\S]*?<\/entry>/g)]
      .slice(0, limit)
      .map((m) => {
        const title = clean(m[1].replace(/<!\[CDATA\[|\]\]>/g, ''));
        const link = clean(m[2]);
        const desc = clean((m[3] || '').replace(/<!\[CDATA\[|\]\]>/g, ''));
        return { title, link, desc, summary: oneLiner(title, desc) };
      });
    return entries;
  } catch {
    return [];
  }
}

function extractXItems(content, limit = 10) {
  const lines = content.split('\n').map((l) => l.trim()).filter(Boolean);
  return lines
    .filter((l) => (/^\d+\.|^[-•]/.test(l) || l.includes('http')) && l !== '---')
    .slice(0, limit)
    .map((l) => {
      const title = l.replace(/^\d+\.\s*/, '');
      return { title, link: '', summary: oneLiner(title) };
    });
}

function fetchXFromLocalReport(limit = 10) {
  // Priority 1: local Obsidian X report (when running on Jun's machine)
  const xDir = '/Users/dtjgp/Library/CloudStorage/OneDrive-PolitecnicodiTorino/Obsidian/PoliTO/X 日报';
  if (fs.existsSync(xDir)) {
    const files = fs.readdirSync(xDir).filter((f) => /^X日报_\d{4}-\d{2}-\d{2}\.md$/.test(f)).sort();
    if (files.length) {
      const latest = files[files.length - 1];
      const content = fs.readFileSync(path.join(xDir, latest), 'utf-8');
      return extractXItems(content, limit);
    }
  }

  // Priority 2: repo-synced fallback for GitHub Actions
  const fallback = 'data/x/latest.md';
  if (fs.existsSync(fallback)) {
    const content = fs.readFileSync(fallback, 'utf-8');
    return extractXItems(content, limit);
  }

  return [];
}

function mdSection(name, rows) {
  if (!rows.length) return `## ${name}\n\n_暂无数据_\n`;
  const body = rows.map((r, i) => {
    const meta = r.score ? `（${r.score}）` : '';
    return `${i + 1}. [${r.title}](${r.link || '#'})${meta}\n   - 一句话：${r.summary}`;
  }).join('\n');
  return `## ${name}\n\n${body}\n`;
}

function buildIndex() {
  const dir = 'daily';
  const files = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f)).sort().reverse()
    : [];

  const lines = [
    '# Daily Brief Archive',
    '',
    `Last updated: ${date}`,
    '',
    ...files.map((f) => `- [${f.replace('.md', '')}](../daily/${f})`),
    '',
  ];

  const htmlItems = files.map((f) => `<li><a href="../daily/${f}">${f.replace('.md', '')}</a></li>`).join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Daily Brief Archive</title></head><body><h1>Daily Brief Archive</h1><p>Last updated: ${date}</p><ul>${htmlItems}</ul></body></html>`;

  fs.mkdirSync('site', { recursive: true });
  fs.writeFileSync('site/index.md', lines.join('\n'));
  fs.writeFileSync('site/index.html', html);
}

async function main() {
  const [hn, gh, ph] = await Promise.all([
    fetchHN(10),
    fetchGitHubTrending(10),
    fetchProductHuntFeed(10),
  ]);
  const x = fetchXFromLocalReport(10);

  const payload = { date, sources: { hackernews: hn, githubTrending: gh, producthunt: ph, x } };
  fs.mkdirSync('data', { recursive: true });
  fs.mkdirSync('daily', { recursive: true });
  fs.writeFileSync(`data/${date}.json`, JSON.stringify(payload, null, 2));

  const md = `# Daily Brief - ${date}\n\n` +
    `> Sources: Hacker News / GitHub Trending / Product Hunt / X monitored stream\n\n` +
    mdSection('Hacker News', hn) + '\n' +
    mdSection('GitHub Trending', gh) + '\n' +
    mdSection('Product Hunt', ph) + '\n' +
    mdSection('X (from local X report)', x) + '\n';

  fs.writeFileSync(`daily/${date}.md`, md);
  buildIndex();
  console.log(`Generated daily/${date}.md, site/index.md, site/index.html`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
