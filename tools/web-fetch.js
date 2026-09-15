// web-fetch.js — Fetch and parse a URL. FULLY LOCAL: direct fetch + HTML→text.
// No third-party readers (no Jina). If a page is a JS shell or bot-walled,
// we report that honestly instead of round-tripping to a remote service.
// NOTE: this module exports a function named `fetch`, which shadows the
// global fetch inside this file. All network calls MUST use `net`
// (captured from globalThis) or the module will call itself →
// infinite recursion ("Maximum call stack size exceeded").

const net = globalThis.fetch;

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const LIMIT = 20000;

export function htmlToText(html) {
  if (!html) return '';
  let text = html;

  // Remove scripts and styles
  text = text.replace(/<\/?(script|style|noscript|iframe|svg|math)[^>]*>\s*?([\s\S]*?)<\/\1>/gi, '');

  // Block elements → double newline (paragraph break)
  const BLOCK_TAGS = 'p|div|br|hr|h[1-6]|li|tr|blockquote|pre|table|section|article|header|footer|nav|main|aside|figure|figcaption|details|summary|dl|dt|dd|address|form|fieldset|legend|button|input|textarea|select|option|video|audio|source|canvas|svg|math|iframe|embed|object|param|track|map|area|picture|slot|template|img';
  text = text.replace(new RegExp(`</?(${BLOCK_TAGS})[^>]*>`, 'gi'), (m, tag) => {
    const lower = tag.toLowerCase();
    if (lower === 'br' || lower === 'hr') return '\n';
    return '\n\n';
  });

  // Inline elements → single newline (to separate them visually)
  const INLINE_BREAK_TAGS = 'span|label|a|strong|em|b|i|u|s|mark|code|kbd|samp|var|sub|sup|ins|del|abbr|dfn|q|small|big|cite|font|tt|bdo|bdi|wbr';
  text = text.replace(new RegExp(`</?(${INLINE_BREAK_TAGS})[^>]*>`, 'gi'), '\n');

  // Remove all remaining tags (scripts, styles, comments, etc.)
  text = text.replace(/<[^>]+>/g, '');

  // Decode common HTML entities
  text = text.replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ');

  // Collapse whitespace (preserve intentional newlines)
  text = text.replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n /g, '\n')
    .replace(/ \n/g, '\n')
    .trim();

  return text;
}

function truncate(s) {
  return s.length > LIMIT ? s.substring(0, LIMIT) + '\n... [truncated]' : s;
}

// Heuristic: is this a JS app shell / anti-bot wall rather than real content?
function looksLikeShell(html, plain) {
  if (plain.length < 300) return true;
  if (html.length < 30000 && /__next|__nuxt|__vue|id="app"|data-reactroot|ng-app/i.test(html)) return true;
  if (/Enable JavaScript and cookies|cf-chl|__cf_chl_|Just a moment|challenge-platform|captcha|Access Denied|Attention Required/i.test(plain)) return true;
  return false;
}

export function fetch(url) {
  return net(url, {
    signal: AbortSignal.timeout(30000),
    redirect: 'follow',
    headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml' },
  }).then(async (resp) => {
    const html = await resp.text();
    if (!resp.ok) {
      return `HTTP ${resp.status}: page not available${resp.status === 403 ? ' (likely blocked by anti-bot — try a different source)' : ''}.`;
    }
    const plain = htmlToText(html);
    if (looksLikeShell(html, plain)) {
      const hint = '[No readable content — page appears JS-rendered or bot-walled. Try a different source.]';
      return hint + (plain ? '\n\n(raw text):\n' + truncate(plain) : '');
    }
    return truncate(plain) || 'Page returned no readable text.';
  }).catch((err) => `Fetch error: ${err.message}`);
}
