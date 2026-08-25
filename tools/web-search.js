// web-search.js — Search via DuckDuckGo HTML. Top results are fetched
// locally (direct fetch + HTML→text). No third-party readers.

import { htmlToText } from './web-fetch.js';

const USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64; rv/128.0) Gecko/20100101 Firefox/128.0';

function extractRealUrl(ddgUrl) {
  const m = ddgUrl.match(/uddg=([^&]+)/);
  if (m) return decodeURIComponent(m[1]);
  return ddgUrl;
}

function parseDuckDuckGoResults(html) {
  const results = [];
  const seen = new Set();

  // Strategy 1: Match links with result__a class (standard DDG HTML)
  // Use a more flexible regex that handles class order variations
  const primaryRegex = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/gi;
  let m;
  while ((m = primaryRegex.exec(html)) !== null) {
    const url = m[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    const title = m[2].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
    if (url && title) {
      const realUrl = extractRealUrl(url);
      if (!seen.has(realUrl)) {
        seen.add(realUrl);
        results.push({ title, url: realUrl });
        if (results.length >= 10) break;
      }
    }
  }

  // Strategy 2: Fallback — match any <a> with href containing /l/ or /uddg= (DDG redirect links)
  // that has a reasonable title length (not nav/footer garbage)
  if (!results.length) {
    const fallbackRegex = /<a[^>]*href="(\/l\/[^"]+|\/uddg\?[^"]+)"[^>]*>([^<]{5,})<\/a>/gi;
    let fm;
    while ((fm = fallbackRegex.exec(html)) !== null) {
      let url = fm[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
      const title = fm[2].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
      if (url && title && title.length >= 5) {
        const realUrl = extractRealUrl(url);
        if (!seen.has(realUrl)) {
          seen.add(realUrl);
          results.push({ title, url: realUrl });
          if (results.length >= 10) break;
        }
      }
    }
  }

  // Strategy 3: Last resort — match any href with /uddg= (URL-encoded redirect)
  if (!results.length) {
    const redirectRegex = /<a[^>]*href="([^"]*uddg%3D[^"]+)"[^>]*>([^<]+)<\/a>/gi;
    let rm;
    while ((rm = redirectRegex.exec(html)) !== null) {
      const rawUrl = decodeURIComponent(rm[1].replace(/&amp;/g, '&'));
      const title = rm[2].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
      if (rawUrl && title) {
        const realUrl = extractRealUrl(rawUrl);
        if (!seen.has(realUrl)) {
          seen.add(realUrl);
          results.push({ title, url: realUrl });
          if (results.length >= 10) break;
        }
      }
    }
  }

  return results;
}

async function fetchPageContent(url) {
  try {
    const resp = await fetch(url, {
      signal: AbortSignal.timeout(20000),
      redirect: 'follow',
      headers: { 'User-Agent': USER_AGENT, 'Accept': 'text/html,application/xhtml+xml' },
    });
    if (!resp.ok) return null;
    const html = await resp.text();
    const text = htmlToText(html);
    if (!text.trim()) return null;
    return text.substring(0, 3000);
  } catch {
    return null;
  }
}

export function search(query) {
  const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

  return fetch(ddgUrl, {
    signal: AbortSignal.timeout(15000),
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'identity',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
    },
  }).then(async (resp) => {
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const html = await resp.text();
    if (!html.trim() || html.includes('anomaly-modal') || html.includes('DDG error') || html.includes('Check if you are a bot')) {
      throw new Error('DDG error or CAPTCHA');
    }

    const results = parseDuckDuckGoResults(html);
    if (!results.length) throw new Error('No DDG results');

    // Fetch content from top 3 URLs in parallel (local fetch, 25s cap each)
    const topUrls = results.slice(0, 3);
    const fetchedResults = await Promise.all(topUrls.map(async (u, i) => {
      try {
        const content = await Promise.race([
          fetchPageContent(u.url),
          new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 25000))
        ]);
        return { index: i + 1, title: u.title, url: u.url, content };
      } catch {
        return { index: i + 1, title: u.title, url: u.url, content: null };
      }
    }));

    // Build output
    let output = `Search results for "${query}":\n\n`;
    output += results.map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}`).join('\n\n');

    output += '\n\n---\nTop results (content fetched locally):';
    for (const r of fetchedResults) {
      if (r.content) {
        output += `\n\n[${r.index}] ${r.title}\n${r.url}\n---\n${r.content}\n---`;
      } else {
        output += `\n\n[${r.index}] ${r.title}\n${r.url}\n[Content unavailable]`;
      }
    }

    return output;
  }).catch((err) => {
    const msg = err?.message || String(err);
    if (/HTTP 429|rate/i.test(msg)) return `Search failed for "${query}": rate limited by DuckDuckGo. Try again in a few seconds.`;
    if (/CAPTCHA|anomaly|bot/i.test(msg)) return `Search failed for "${query}": DuckDuckGo bot detection triggered. Try again shortly.`;
    if (/No DDG results/i.test(msg)) return `Search failed for "${query}": no results parsed (DDG HTML may have changed).`;
    if (/timeout|aborted/i.test(msg)) return `Search failed for "${query}": request timed out.`;
    return `Search failed for "${query}": ${msg}`;
  });
}
