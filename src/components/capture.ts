export type CaptureType = "html" | "screenshot" | "pdf";

export type CaptureResult = {
  dataUrl: string;
  contentType: string;
  fileName: string;
  htmlText?: string;
};

export const ARCHIVER_USER_AGENT =
  "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Googlebot/2.1; +http://www.google.com/bot.html) Chrome/139.0.7258.123 Safari/537.36";

// Use a desktop Linux Chrome UA for browser navigation (matches Docker/Ubuntu-like envs)
export const BROWSER_USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

export function fetchWithTimeout(
  input: string,
  init: RequestInit & { timeoutMs?: number } = {}
) {
  const { timeoutMs = 5000, ...rest } = init;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(input, { ...rest, signal: controller.signal }).finally(() =>
    clearTimeout(id)
  );
}

export function isHttpUrl(input: string): boolean {
  try {
    const u = new URL(input);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export async function isBlockedByRobots(targetUrl: string): Promise<boolean> {
  try {
    const url = new URL(targetUrl);
    const robotsUrl = `${url.origin}/robots.txt`;
    const res = await fetchWithTimeout(robotsUrl, {
      headers: { "user-agent": ARCHIVER_USER_AGENT },
      timeoutMs: 3000,
    });
    if (!res.ok) return false;
    const txt = await res.text();
    if (/disallow:\s*\//i.test(txt) && /user-agent:\s*\*/i.test(txt)) {
      return true;
    }
    const path = url.pathname + (url.search || "");
    const disallowLines = txt
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => /^disallow:/i.test(l))
      .map((l) => l.split(":")[1]?.trim() || "");
    return disallowLines.some((d) => d && path.startsWith(d));
  } catch {
    return false;
  }
}

export function hasNoArchiveHeader(headers: Headers): boolean {
  const header = headers.get("x-robots-tag");
  if (!header) return false;
  const value = header.toLowerCase();
  return (
    value.includes("noarchive") ||
    value.includes("noindex") ||
    value.includes("none")
  );
}

export async function hasNoArchiveMeta(
  targetUrl: string
): Promise<boolean> {
  try {
    const headRes = await fetchWithTimeout(targetUrl, {
      method: "HEAD",
      redirect: "follow",
      headers: { "user-agent": ARCHIVER_USER_AGENT },
      timeoutMs: 3000,
    });
    if (headRes.ok && hasNoArchiveHeader(headRes.headers)) return true;

    const res = await fetchWithTimeout(targetUrl, {
      redirect: "follow",
      headers: { "user-agent": ARCHIVER_USER_AGENT, accept: "text/html,*/*" },
      timeoutMs: 6000,
    });
    if (!res.ok) return false;
    if (hasNoArchiveHeader(res.headers)) return true;
    const ctype = res.headers.get("content-type") || "";
    if (!ctype.includes("text/html")) return false;
    const html = await res.text();
    const robotsMetaRegex = /<meta[^>]*name=["']robots["'][^>]*content=["']([^"']+)["'][^>]*>/i;
    const match = html.match(robotsMetaRegex);
    if (!match) return false;
    const content = match[1].toLowerCase();
    return (
      content.includes("noarchive") ||
      content.includes("noindex") ||
      content.includes("none")
    );
  } catch {
    return false;
  }
}

export function buildSnapshotHtml(
  originalHtml: string,
  originalUrl: string
): string {
  try {
    const url = new URL(originalUrl);
    const baseHref = new URL("./", url).href;
    let html = originalHtml;

    html = html.replace(
      /<meta[^>]*http-equiv=["']content-security-policy["'][^>]*>/gi,
      ""
    );
    html = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
    html = html.replace(/\son[a-z-]+=("[^"]*"|'[^']*')/gi, "");

    if (!/<head[^>]*>/i.test(html)) {
      const bodyContent = /<body[^>]*>[\s\S]*?<\/body>/i.test(html)
        ? html.match(/<body[^>]*>[\s\S]*?<\/body>/i)?.[0] || `<body>${html}</body>`
        : `<body>${html}</body>`;
      html = `<!doctype html><html><head><meta charset="utf-8"></head>${bodyContent}</html>`;
    }

    const styleBlock = `<style id="byepass-scroll">
html,body{margin:0!important;padding:0!important;height:auto!important;min-height:100vh!important;overflow:auto!important;}
html{scroll-behavior:auto!important;}
body{overflow-y:auto!important;-webkit-overflow-scrolling:touch;}
#root,#app,#__next,main,.app,.page,.layout,body>div:first-child{height:auto!important;min-height:100vh!important;overflow:auto!important;}
.overflow-hidden,.no-scroll,.modal-open,[data-scroll-lock],[data-lenis-smooth],[data-lenis-prevent],[data-scroll-lock-saved-overflow]{overflow:auto!important;}
*{overscroll-behavior:auto!important;}
/* Hide common overlays/popups/consent banners */
[role="dialog"], [aria-modal="true"], dialog, [data-modal], [data-overlay],
.modal, .dialog, .overlay, .backdrop, .popup,
[class*="cookie" i], [id*="cookie" i], [class*="consent" i], [id*="consent" i], [class*="gdpr" i], [id*="gdpr" i]{
  display:none !important;
}
</style>`;
    if (!/<base\b/i.test(html)) {
      html = html.replace(/<head(.*?)>/i, `<head$1><base href="${baseHref}">`);
    }
    if (/<\/head>/i.test(html)) {
      html = html.replace(/<\/head>/i, `${styleBlock}</head>`);
    } else {
      html = html.replace(/<head(.*?)>/i, `<head$1>${styleBlock}`);
    }

    const banner = `\n<div style="all:initial; display:block; box-sizing:border-box; width:100%; background:#fffbdd; color:#111; border-bottom:1px solid rgba(0,0,0,.1); font: 13px/1.4 system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; padding:8px 12px; position:sticky; top:0; z-index:2147483647;">Archived snapshot of <a href="${originalUrl}" style="color:#0366d6;">${originalUrl}</a>. Scripts removed for safety.</div>\n`;
    if (/<body[^>]*>/i.test(html)) {
      html = html.replace(/<body(.*?)>/i, `<body$1>${banner}`);
    } else {
      html = html.replace(/<head[^>]*>[\s\S]*?<\/head>/i, (m) => `${m}<body>${banner}</body>`);
    }

    const navScript = `\n<script>(function(){try{
function unlock(){try{
  var de=document.documentElement, b=document.body; if(!de||!b) return;
  de.style.overflow='auto'; b.style.overflow='auto';
  if(b.classList){['overflow-hidden','no-scroll','modal-open'].forEach(function(c){try{b.classList.remove(c)}catch(_){}})}
  var vh=window.innerHeight;
  var roots=['#root','#app','#__next','main','body>div:first-child'];
  roots.forEach(function(sel){var el=document.querySelector(sel); if(!el) return; var cs=getComputedStyle(el);
    if(cs.position==='fixed' && cs.top==='0px' && cs.bottom==='0px'){el.style.position='static'}
    if((cs.height===vh+'px' || cs.maxHeight===vh+'px') || cs.overflow==='hidden' || cs.overflowY==='hidden'){
      el.style.height='auto'; el.style.minHeight='100%'; el.style.overflow='auto'; el.style.overflowY='auto';
    }
  });
}catch(_){}}
function removeOverlays(){try{
  var vw=window.innerWidth, vh=window.innerHeight;
  var selectors='[role=\\'dialog\\'],[aria-modal=\\'true\\'],dialog,[data-modal],[data-overlay],.modal,.dialog,.overlay,.backdrop,.popup,[class*=\\'cookie\\' i],[id*=\\'cookie\\' i],[class*=\\'consent\\' i],[id*=\\'consent\\' i],[class*=\\'gdpr\\' i],[id*=\\'gdpr\\' i]';
  document.querySelectorAll(selectors).forEach(function(el){ try{ el.remove(); }catch(_){ try{ (el).style.display='none'; }catch(__){} } });
  Array.prototype.slice.call(document.body.querySelectorAll('div,section,aside,dialog,header,footer')).forEach(function(el){
    try{
      var r=el.getBoundingClientRect(); if(!r || r.width===0 || r.height===0) return;
      var cs=getComputedStyle(el);
      var zi=parseInt(cs.zIndex,10); if(isNaN(zi)) zi=0;
      var fixedOrSticky=(cs.position==='fixed' || cs.position==='sticky');
      var covers = (r.width>=vw*0.6 && r.height>=vh*0.6) || (r.top<=5 && r.left<=5 && (Math.abs((vw-r.right))<=5 || Math.abs((vh-r.bottom))<=5));
      if(fixedOrSticky && (zi>=1000 || covers)){
        el.remove();
      }
    }catch(_){}
  });
}catch(_){}}
document.addEventListener('DOMContentLoaded', unlock);
setTimeout(unlock, 0); setTimeout(unlock, 500); setTimeout(unlock, 1500); setInterval(unlock, 3000);
document.addEventListener('DOMContentLoaded', removeOverlays);
setTimeout(removeOverlays, 0); setTimeout(removeOverlays, 500); setTimeout(removeOverlays, 1500); setInterval(removeOverlays, 3000);
document.addEventListener('click',function(e){var t=e.target&&e.target.closest?e.target.closest('a[href]'):null;if(!t)return;var h=t.getAttribute('href');if(!h||h.startsWith('#')||/^javascript:/i.test(h))return;e.preventDefault();var abs=new URL(h,document.baseURI).href;window.top.location.href='/?url='+encodeURIComponent(abs)+'&type=html';},true);
}catch(_){}})();</script>\n`;
    if (/<\/body>/i.test(html)) {
      html = html.replace(/<\/body>/i, `${navScript}</body>`);
    } else {
      html += navScript;
    }

    return html;
  } catch {
    return originalHtml;
  }
}

export async function performCapture(
  url: string,
  type: CaptureType
): Promise<CaptureResult> {
  const puppeteer = (await import("puppeteer")).default;
  const { existsSync } = await import("node:fs");
  const systemChromePath = ["/usr/bin/chromium", "/usr/bin/chromium-browser"].find((p) => existsSync(p));
  const executablePath =
    systemChromePath ||
    process.env.PUPPETEER_EXECUTABLE_PATH ||
    (puppeteer as import("puppeteer").PuppeteerNode).executablePath?.();
  const browser = await puppeteer.launch({
    headless: true,
    executablePath,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
    ],
  });
  try {
    const page = await browser.newPage();
    await page.setUserAgent(BROWSER_USER_AGENT);
    await page.setExtraHTTPHeaders({
      accept: "text/html,*/*",
      "accept-language": "en-US,en;q=0.9",
    });
    await page.setJavaScriptEnabled(false);
    // Cloak headless hints and reduce anti-bot triggers
    await page.evaluateOnNewDocument(() => {
      try {
        // Pretend to be not headless
        // @ts-ignore
        const _navigator = window.navigator;
        Object.defineProperty(_navigator, 'webdriver', { get: () => undefined });
        // Minimal plugins & languages
        Object.defineProperty(_navigator, 'languages', { get: () => ['en-US', 'en'] });
        Object.defineProperty(_navigator, 'platform', { get: () => 'MacIntel' });
      } catch {}
    });
    page.setDefaultNavigationTimeout(30000);
    page.setDefaultTimeout(30000);
    await page.setRequestInterception(true);
    page.on("request", (request) => {
      const blocked = new Set([
        "media",
        "font",
        "script",
        "xhr",
        "fetch",
        "websocket",
        "eventsource",
        "manifest",
      ]);
      if (blocked.has(request.resourceType())) request.abort();
      else request.continue();
    });
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    } catch {
      throw new Error("Navigation timed out or failed");
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));

    if (type === "screenshot") {
      const buf = await page.screenshot({ fullPage: true, type: "png" });
      return {
        dataUrl: `data:image/png;base64,${Buffer.from(buf).toString("base64")}`,
        contentType: "image/png",
        fileName: "archive.png",
      };
    }
    if (type === "pdf") {
      const buf = await page.pdf({ printBackground: true, preferCSSPageSize: true });
      return {
        dataUrl: `data:application/pdf;base64,${Buffer.from(buf).toString("base64")}`,
        contentType: "application/pdf",
        fileName: "archive.pdf",
      };
    }
    const html = await page.content();
    const snapshot = buildSnapshotHtml(html, url);
    return {
      dataUrl: `data:text/html;charset=utf-8,${encodeURIComponent(snapshot)}`,
      contentType: "text/html; charset=utf-8",
      fileName: "archive.html",
      htmlText: snapshot,
    };
  } finally {
    await browser.close();
  }
}

