#!/usr/bin/env node
/**
 * Build the docs site as ordinary static HTML.
 *
 * Each page is a `.md` file: YAML front matter (title, description, optional
 * lede), then the body. markdown-it renders it, Shiki highlights its code, and
 * one layout wraps every page — the top bar, the tabs, the sidebar, the
 * contents rail — so no page carries a copy of the site's chrome.
 *
 * Cloudflare Pages runs this as `node build.mjs` on Node 22 after
 * `npm clean-install`, and publishes `dist/`. Nothing here may need a newer
 * Node, and nothing may need a dashboard change.
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, readdirSync, existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import MarkdownIt from 'markdown-it';
import anchor from 'markdown-it-anchor';
import container from 'markdown-it-container';
import frontMatter from 'markdown-it-front-matter';
import { parse as parseYaml } from 'yaml';
import { createHighlighter, createCssVariablesTheme } from 'shiki';
import * as pagefind from 'pagefind';
import { TABS, HIDDEN } from './site.mjs';

const OUT = 'dist';
const SITE = 'https://docs.lloyal.ai';
const CATEGORY_URL = 'https://verticalinference.lloyal.ai/';
// Shared with the marketing site rather than duplicated here.
const OG_IMAGE = 'https://lloyal.ai/assets/vertical-inference-og.png';
const GITHUB = 'https://github.com/lloyal-ai/hdk';
const HOME = 'https://lloyal.ai/';

const hrefOf = (slug) => (slug === 'index' ? '/' : `/${slug}`);
const canonical = (slug) => `${SITE}${hrefOf(slug)}`;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Hashed asset names. The images are content-stable, so `/assets/*` is served
 * `immutable`; the stylesheet and script are not, and an immutable file under
 * an unchanging name means an edit can never reach anyone (found the hard way:
 * a fix deployed, and the CDN kept serving the old file).
 */
function hashed(path, ext) {
  const body = readFileSync(path);
  return { body, name: `docs.${createHash('sha256').update(body).digest('hex').slice(0, 8)}.${ext}` };
}
const CSS = hashed('assets/docs.css', 'css');
const JS = hashed('assets/docs.js', 'js');

// ── The page list, and the one registration it must agree with ─────────────
const ORDER = TABS.flatMap((tab) => tab.pages.map((p) => ({ ...p, tab })));
const LISTED = new Set([...ORDER.map((p) => p.slug), ...HIDDEN]);
// Every root `.md` is a page. `licensing/` also holds legal source texts that
// are not pages (fsl-template.md, the .mdx drafts), so only what HIDDEN names
// is published from there.
const SOURCES = [
  ...readdirSync('.').filter((f) => f.endsWith('.md') && f !== 'README.md').map((f) => f.replace(/\.md$/, '')),
  ...HIDDEN.filter((s) => s.startsWith('licensing/') && existsSync(`${s}.md`)),
].sort();

const unlisted = SOURCES.filter((s) => !LISTED.has(s));
if (unlisted.length) throw new Error(`build: pages missing from site.mjs — ${unlisted.join(', ')} (add them to TABS, or to HIDDEN)`);
const missing = [...LISTED].filter((s) => !SOURCES.includes(s));
if (missing.length) throw new Error(`build: site.mjs lists pages with no .md file — ${missing.join(', ')}`);

// ── Markdown ───────────────────────────────────────────────────────────────
const LANGS = ['ts', 'tsx', 'sh', 'yaml', 'json', 'md', 'css', 'dotenv', 'html', 'js'];
const theme = createCssVariablesTheme({ name: 'css-variables', variablePrefix: '--shiki-', fontStyle: true });
const highlighter = await createHighlighter({ themes: [theme], langs: LANGS });

let frontMatterRaw = null;
const md = new MarkdownIt({ html: true, linkify: false, typographer: false });
md.use(frontMatter, (raw) => { frontMatterRaw = raw; });

/**
 * `## Heading {#id}` keeps an id a page already had, so a link into the old
 * page still lands. Headings without one get a slug from markdown-it-anchor,
 * which reuses any id already set rather than replacing it.
 */
md.core.ruler.after('inline', 'heading-ids', (state) => {
  const t = state.tokens;
  for (let i = 0; i < t.length; i++) {
    if (t[i].type !== 'heading_open') continue;
    const inline = t[i + 1];
    const m = /\s*\{#([A-Za-z0-9_-]+)\}\s*$/.exec(inline.content);
    if (!m) continue;
    t[i].attrSet('id', m[1]);
    inline.content = inline.content.slice(0, m.index);
    const last = inline.children[inline.children.length - 1];
    if (last?.type === 'text') last.content = last.content.replace(/\s*\{#[A-Za-z0-9_-]+\}\s*$/, '');
  }
});
const slugify = (s) => s.toLowerCase().replace(/<[^>]+>/g, '').replace(/[^\p{L}\p{N}\s-]/gu, '').trim().replace(/\s+/g, '-');
md.use(anchor, { slugify, tabIndex: false });

/**
 * Blocks a page may use. `callout` and `proof` carry a title on the opening
 * line; `owns` is the "who owns what here" box for Effection's rules at the
 * point a page needs them.
 */
const BLOCKS = {
  callout: { tag: 'aside', titled: true },
  proof: { tag: 'div', titled: true },
  note: { tag: 'aside', label: 'Note' },
  warning: { tag: 'aside', label: 'Warning' },
  owns: { tag: 'aside', label: 'Who owns what' },
  pull: { tag: 'div' },
};
for (const [name, { tag, titled, label }] of Object.entries(BLOCKS)) {
  md.use(container, name, {
    render(tokens, idx) {
      const t = tokens[idx];
      if (t.nesting === -1) return `</${tag}>\n`;
      const title = titled ? t.info.trim().slice(name.length).trim() : label;
      return `<${tag} class="block block-${name}">${title ? `<div class="block-title">${md.renderInline(title)}</div>` : ''}\n`;
    },
  });
}

// ```ts label="src/index.ts" — the language, then the label the frame shows.
md.renderer.rules.fence = (tokens, idx) => {
  const t = tokens[idx];
  const m = /^(\S*)(?:\s+label="(.*)")?\s*$/.exec(t.info.trim());
  const lang = m?.[1] || 'text';
  const label = m?.[2] ?? '';
  if (lang !== 'text' && !LANGS.includes(lang)) throw new Error(`build: fence language "${lang}" is not loaded — add it to LANGS`);
  const code = highlighter.codeToHtml(t.content.replace(/\n$/, ''), { lang, theme: 'css-variables' });
  return `<div class="code-frame"><div class="code-head" data-pagefind-ignore><span class="code-label">${esc(label || lang)}</span><button type="button" class="code-copy" aria-label="Copy code">Copy</button></div>${code}</div>\n`;
};
md.renderer.rules.table_open = () => '<div class="table-wrap"><table>\n';
md.renderer.rules.table_close = () => '</table></div>\n';
// A Markdown image is a diagram drawn for a light page: it sits on a light plate in either theme.
const defaultImage = md.renderer.rules.image;
md.renderer.rules.image = (tokens, idx, options, env, self) => {
  tokens[idx].attrJoin('class', 'plate');
  tokens[idx].attrSet('loading', 'lazy');
  return defaultImage(tokens, idx, options, env, self);
};

function renderPage(slug) {
  const src = readFileSync(`${slug}.md`, 'utf8');
  frontMatterRaw = null;
  const env = {};
  const tokens = md.parse(src, env);
  if (frontMatterRaw === null) throw new Error(`${slug}.md: no front matter`);
  const meta = parseYaml(frontMatterRaw) ?? {};
  for (const k of ['title', 'description']) if (typeof meta[k] !== 'string' || !meta[k]) throw new Error(`${slug}.md: front matter needs a ${k}`);

  const toc = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    // Two levels: a contents list deeper than that stops being scannable.
    if (t.type !== 'heading_open' || !['h2', 'h3'].includes(t.tag)) continue;
    const text = md.renderer.renderInline(tokens[i + 1].children, md.options, env).replace(/<(?!\/?code\b)[^>]+>/g, '');
    toc.push({ level: Number(t.tag[1]), id: t.attrGet('id'), text });
  }
  const html = md.renderer.render(tokens, md.options, env);
  const body = src.replace(/^---\n[\s\S]*?\n---\n?/, '');
  return { slug, meta, html, toc, body };
}

// ── Layout ─────────────────────────────────────────────────────────────────
const tabOf = (slug) => ORDER.find((p) => p.slug === slug)?.tab ?? null;

const topbar = (tab) => `<header class="topbar">
<div class="topbar-inner">
<a class="wordmark" href="/"><strong>Lloyal</strong><span>docs</span></a>
<nav class="tabs" aria-label="Sections">${TABS.map((t) => `<a href="${hrefOf(t.pages[0].slug)}"${t === tab ? ' class="is-current" aria-current="true"' : ''}>${esc(t.label)}</a>`).join('')}</nav>
<div class="topbar-tools">
<button type="button" class="search-button" aria-haspopup="dialog" aria-controls="search-dialog"><span>Search</span><kbd>/</kbd></button>
<button type="button" class="theme-toggle" aria-label="Switch to light theme" title="Switch theme"><span aria-hidden="true">◐</span></button>
<a class="topbar-out" href="${HOME}">lloyal.ai <span aria-hidden="true">↗</span></a>
<a class="topbar-out" href="${GITHUB}">GitHub <span aria-hidden="true">↗</span></a>
<button type="button" class="menu-button" aria-expanded="false" aria-controls="drawer" aria-label="Open menu"><span></span><span></span></button>
</div>
</div>
</header>`;

const pageLink = (p, slug) => `<a href="${hrefOf(p.slug)}"${p.slug === slug ? ' class="is-current" aria-current="page"' : ''}>${esc(p.label)}</a>`;

const sidebar = (tab, slug) => (tab
  ? `<nav class="sidebar" aria-label="${esc(tab.label)}"><div class="sidebar-label">${esc(tab.label)}</div>${tab.pages.map((p) => pageLink(p, slug)).join('')}</nav>`
  : '<nav class="sidebar" aria-hidden="true"></nav>');

// Below the breakpoint the tabs and the sidebar are one list: every page, grouped.
const drawer = (slug) => `<nav class="drawer" id="drawer" aria-label="All pages" hidden>${TABS.map((t) => `<div class="drawer-group"><div class="sidebar-label">${esc(t.label)}</div>${t.pages.map((p) => pageLink(p, slug)).join('')}</div>`).join('')}<div class="drawer-group"><a href="${HOME}">lloyal.ai ↗</a><a href="${GITHUB}">GitHub ↗</a></div></nav>`;

const tocList = (toc) => toc.map((h) => `<a class="toc-l${h.level - 1}" href="#${h.id}">${h.text}</a>`).join('');
const contents = (toc) => (toc.length < 2 ? { rail: '<aside class="toc-rail"></aside>', inline: '' } : {
  rail: `<aside class="toc-rail"><nav class="toc" aria-label="On this page"><div class="toc-label">On this page</div>${tocList(toc)}</nav></aside>`,
  inline: `<details class="toc-inline"><summary>On this page</summary><nav aria-label="On this page">${tocList(toc)}</nav></details>`,
});

function prevNext(slug) {
  const i = ORDER.findIndex((p) => p.slug === slug);
  if (i < 0) return '';
  const prev = ORDER[i - 1], next = ORDER[i + 1];
  const cell = (p, dir) => (p ? `<a class="pn-${dir}" href="${hrefOf(p.slug)}"><span>${dir === 'prev' ? 'Previous' : 'Next'}</span>${esc(p.label)}</a>` : '<span></span>');
  return `<nav class="prev-next" aria-label="Previous and next">${cell(prev, 'prev')}${cell(next, 'next')}</nav>`;
}

/** Runs before first paint, so a light-theme reader never sees a dark flash. */
const THEME_INIT = `<script>try{var t=localStorage.getItem('lloyal-docs-theme');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t)}catch(e){}</script>`;

function head({ title, description, url, type }) {
  return `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="theme-color" content="#080808">
${THEME_INIT}
${url ? `<link rel="canonical" href="${url}">
<meta property="og:type" content="${type}">
<meta property="og:site_name" content="Lloyal docs">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${OG_IMAGE}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${OG_IMAGE}">` : '<meta name="robots" content="noindex">'}
<link rel="icon" href="/favicon.svg">
<link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>
<link rel="stylesheet" href="/assets/${CSS.name}">`;
}

/** Search: a dialog the top bar opens. Pagefind's UI is loaded into it on first open, so a page that is never
 *  searched never pays for it. */
const searchDialog = `<dialog class="search-dialog" id="search-dialog" aria-label="Search the docs"><div class="search-head"><span>Search</span><button type="button" class="search-close" aria-label="Close search">Esc</button></div><div id="search"></div></dialog>`;

function layout({ slug, meta, html, toc }) {
  const tab = tabOf(slug);
  const title = `${meta.title} — Lloyal docs`;
  const url = canonical(slug);
  // Escaped for a <script> context: a literal `</script>` in any string would end the block.
  const jsonld = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    headline: meta.title,
    description: meta.description,
    url,
    isPartOf: { '@type': 'WebSite', name: 'Lloyal docs', url: `${SITE}/` },
    about: { '@type': 'DefinedTerm', name: 'Vertical Inference', url: CATEGORY_URL },
    publisher: { '@type': 'Organization', name: 'Lloyal Labs', url: HOME },
  }).replace(/</g, '\\u003c');
  const c = contents(toc);
  return `<!doctype html>
<html lang="en" data-theme="dark">
<head>
${head({ title, description: meta.description, url, type: slug === 'index' ? 'website' : 'article' })}
<script type="application/ld+json">${jsonld}</script>
</head>
<body class="page-${slug.replace(/\//g, '-')}">
<a class="skip" href="#main">Skip to content</a>
${topbar(tab)}
${drawer(slug)}
<div class="shell">
${sidebar(tab, slug)}
<main class="main" id="main" data-pagefind-body>
<header class="page-head">
${tab ? `<div class="crumb" data-pagefind-meta="section">${esc(tab.label)}</div>` : ''}
<h1${meta.id ? ` id="${esc(meta.id)}"` : ''}>${esc(meta.title)}</h1>
<p class="lede">${esc(meta.lede ?? meta.description)}</p>
</header>
<div data-pagefind-ignore>${c.inline}</div>
<article class="article">
${html}
</article>
<div data-pagefind-ignore>${prevNext(slug)}</div>
<footer class="footer" data-pagefind-ignore><span>Lloyal Labs</span><a href="${HOME}">lloyal.ai</a><a href="${GITHUB}">GitHub</a><a href="/llms.txt">llms.txt</a></footer>
</main>
${c.rail}
</div>
<a class="back-to-top" href="#main" aria-label="Back to top">↑</a>
${searchDialog}
<script src="/assets/${JS.name}" defer></script>
</body>
</html>
`;
}

/**
 * Refuse to emit a page whose block structure does not close cleanly.
 *
 * A browser silently ignores an unmatched `</div>`, so a stray one in a page's
 * inline HTML closes the layout early and everything after it escapes. That
 * shipped to production once and stayed up through several deploys.
 */
function assertBalanced(name, body) {
  const TAGS = /<(\/?)(div|section|header|footer|nav|main|article|aside|ul|ol|li|table|figure|details)\b([^>]*)>/g;
  const stack = [];
  for (const [, close, tag, attrs] of body.matchAll(TAGS)) {
    if (attrs.trimEnd().endsWith('/')) continue;
    if (!close) { stack.push([tag, (attrs.match(/class="([^"]*)"/) || [, ''])[1]]); continue; }
    if (!stack.length) throw new Error(`${name}: unmatched </${tag}> — it would close the layout early`);
    const [open, cls] = stack.pop();
    if (open !== tag) throw new Error(`${name}: </${tag}> closes <${open} class="${cls}">`);
  }
  if (stack.length) throw new Error(`${name}: never closed — ${stack.map(([t, c]) => `<${t} class="${c}">`).join(', ')}`);
}

// ── Build ──────────────────────────────────────────────────────────────────
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const pages = SOURCES.map(renderPage);
const redirectSrc = readFileSync('_redirects', 'utf8');
const redirects = redirectSrc.split('\n').filter((l) => l.trim() && !l.startsWith('#'));
const redirectFrom = new Set(redirects.map((l) => l.split(/\s+/)[0]));

/**
 * Every internal link must land: on a page, an asset, a file this build writes,
 * or a redirect — and a `#fragment` on an id that page actually has.
 */
const idsOf = new Map(pages.map((p) => [hrefOf(p.slug), new Set([...p.html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]).concat(p.meta.id ?? []))]));
const WRITTEN = new Set(['/llms.txt', '/sitemap.xml', '/robots.txt', ...pages.map((p) => `/${p.slug}.md`)]);
const dead = [];
for (const p of pages) {
  for (const [, href] of p.html.matchAll(/\shref="([^"]*)"/g)) {
    if (/^[a-z]+:/i.test(href) || href.startsWith('//')) continue;
    const [pathPart, frag] = href.split('#');
    const path = pathPart === '' ? hrefOf(p.slug) : pathPart.replace(/\/$/, '') || '/';
    if (idsOf.has(path)) {
      if (frag && !idsOf.get(path).has(decodeURIComponent(frag))) dead.push(`${p.slug}: ${href} (no such anchor)`);
    } else if (!(WRITTEN.has(path) || redirectFrom.has(path) || (existsSync(`.${path}`) && statSync(`.${path}`).isFile()))) {
      dead.push(`${p.slug}: ${href}`);
    }
  }
}
if (dead.length) throw new Error(`build: ${dead.length} internal link(s) land nowhere:\n  ${dead.join('\n  ')}`);

for (const p of pages) {
  const out = layout(p);
  assertBalanced(`${p.slug}.md`, out);
  mkdirSync(join(OUT, dirname(p.slug)), { recursive: true });
  writeFileSync(join(OUT, `${p.slug}.html`), out);
  // The same page as Markdown, for a reader's coding agent: append `.md` to any URL.
  writeFileSync(join(OUT, `${p.slug}.md`), `# ${p.meta.title}\n\n> ${p.meta.description}\n\n${p.body.trim()}\n`);
  console.log(`  build  ${p.slug}`);
}

// Static assets, copied verbatim; the stylesheet and script only under their hashed names.
cpSync('assets', join(OUT, 'assets'), { recursive: true, filter: (s) => !/assets\/docs\.(css|js)$/.test(s) });
writeFileSync(join(OUT, 'assets', CSS.name), CSS.body);
writeFileSync(join(OUT, 'assets', JS.name), JS.body);
if (existsSync('logo')) cpSync('logo', join(OUT, 'logo'), { recursive: true });
cpSync('favicon.svg', join(OUT, 'favicon.svg'));

// Every retired URL, so no previously-working link breaks.
writeFileSync(join(OUT, '_redirects'), redirectSrc);
writeFileSync(join(OUT, '_headers'), `/assets/*
  Cache-Control: public, max-age=31536000, immutable

/*.html
  Cache-Control: public, max-age=0, must-revalidate
`);

/**
 * Without a 404.html, Cloudflare Pages answers any unmatched path with the
 * home page and a 200 — a soft 404 that makes dead links look alive.
 */
const notFound = `<!doctype html>
<html lang="en" data-theme="dark">
<head>
${head({ title: 'Not found — Lloyal docs', description: 'That page does not exist here.' })}
</head>
<body class="page-404">
${topbar(null)}
${drawer('')}
<div class="shell">
<nav class="sidebar" aria-hidden="true"></nav>
<main class="main" id="main">
<header class="page-head"><div class="crumb">404</div><h1>Not found</h1><p class="lede">That page does not exist here. Try one of these.</p></header>
<article class="article">${TABS.map((t) => `<h2>${esc(t.label)}</h2><ul>${t.pages.map((p) => `<li><a href="${hrefOf(p.slug)}">${esc(p.label)}</a></li>`).join('')}</ul>`).join('')}</article>
</main>
<aside class="toc-rail"></aside>
</div>
${searchDialog}
<script src="/assets/${JS.name}" defer></script>
</body>
</html>
`;
assertBalanced('404.html', notFound);
writeFileSync(join(OUT, '404.html'), notFound);

const byslug = new Map(pages.map((p) => [p.slug, p]));
writeFileSync(join(OUT, 'llms.txt'), `# Lloyal docs

> ${byslug.get('index').meta.description}

Every page is also published as Markdown: append \`.md\` to its URL (for example ${SITE}/ship.md; the overview is ${SITE}/index.md).

${TABS.map((t) => `## ${t.label}\n\n${t.pages.map((p) => `- [${byslug.get(p.slug).meta.title}](${canonical(p.slug)}): ${byslug.get(p.slug).meta.description}`).join('\n')}`).join('\n\n')}
`);

writeFileSync(join(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages.map((p) => `  <url><loc>${canonical(p.slug)}</loc></url>`).join('\n')}
</urlset>
`);

// Cloudflare appends its own managed block; this adds the part only we know.
writeFileSync(join(OUT, 'robots.txt'), `User-agent: *
Allow: /

Sitemap: ${SITE}/sitemap.xml
`);

/**
 * The search index, built from the pages just written: only each page's main column (marked
 * `data-pagefind-body`), without the navigation around it. Pagefind writes a static index into
 * dist/pagefind/, which the browser fetches in fragments as a reader types — no server.
 */
const { index, errors } = await pagefind.createIndex({});
if (!index) throw new Error(`build: pagefind could not start — ${errors.join('; ')}`);
const added = await index.addDirectory({ path: OUT });
if (added.errors.length) throw new Error(`build: pagefind — ${added.errors.join('; ')}`);
const written = await index.writeFiles({ outputPath: join(OUT, 'pagefind') });
if (written.errors.length) throw new Error(`build: pagefind — ${written.errors.join('; ')}`);
await pagefind.close();

console.log(`\n  ${pages.length} pages · ${added.page_count} indexed · ${redirects.length} redirects · ${CSS.name} · ${JS.name} → ${OUT}/`);
