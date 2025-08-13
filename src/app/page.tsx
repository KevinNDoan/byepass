export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { CaptureForm } from "@/components/CaptureForm";
import { FullscreenSnapshot } from "@/components/FullscreenSnapshot";
import Image from "next/image";

type CaptureType = "html" | "screenshot" | "pdf";

type CaptureResult = {
  dataUrl: string;
  contentType: string;
  fileName: string;
  htmlText?: string;
};

const ARCHIVER_USER_AGENT = "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Googlebot/2.1; +http://www.google.com/bot.html) Chrome/139.0.7258.123 Safari/537.36";

function fetchWithTimeout(input: string, init: RequestInit & { timeoutMs?: number } = {}) {
  const { timeoutMs = 5000, ...rest } = init;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(input, { ...rest, signal: controller.signal }).finally(() => clearTimeout(id));
}

function isHttpUrl(input: string): boolean {
  try {
    const u = new URL(input);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }): Promise<Metadata> {
  const sp = await searchParams;
  const urlParam = typeof sp.url === "string" ? sp.url : "";
  const meta: Metadata = { title: "Byepass Archiver" };

  if (!urlParam || !isHttpUrl(urlParam)) return meta;

  try {
    const res = await fetchWithTimeout(urlParam, {
      redirect: "follow",
      headers: { "user-agent": ARCHIVER_USER_AGENT, accept: "text/html,*/*" },
      cache: "no-store",
      timeoutMs: 4000,
    });
    if (!res.ok) return meta;
    const html = await res.text();

    // Title: prefer <title>, fall back to og:title or twitter:title
    let pageTitle: string | undefined;
    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    pageTitle = titleMatch?.[1]?.trim();
    if (!pageTitle) {
      const ogMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["'][^>]*>/i);
      pageTitle = ogMatch?.[1]?.trim();
    }
    if (!pageTitle) {
      const twMatch = html.match(/<meta[^>]*name=["']twitter:title["'][^>]*content=["']([^"']+)["'][^>]*>/i);
      pageTitle = twMatch?.[1]?.trim();
    }
    if (pageTitle) meta.title = pageTitle;

    // Favicon: search for best candidate among link[rel*=icon]
    let iconHref: string | undefined;
    const linkTags = html.match(/<link[^>]*>/gi) || [];
    const candidates: Array<{ href: string; score: number }> = [];
    for (const tag of linkTags) {
      const relMatch = tag.match(/rel=["']([^"']+)["']/i);
      const hrefMatch = tag.match(/href=["']([^"']+)["']/i);
      const sizesMatch = tag.match(/sizes=["']([^"']+)["']/i);
      const typeMatch = tag.match(/type=["']([^"']+)["']/i);
      const relVal = (relMatch?.[1] || "").toLowerCase();
      const hrefVal = hrefMatch?.[1];
      if (!hrefVal || !relVal.includes("icon")) continue;
      let score = 0;
      if (relVal.includes("shortcut")) score += 2;
      if (relVal.includes("apple")) score += 1;
      if (typeMatch?.[1]?.includes("png")) score += 2;
      if (sizesMatch?.[1]?.includes("32x32")) score += 2;
      if (sizesMatch?.[1]?.includes("16x16")) score += 1;
      candidates.push({ href: hrefVal, score });
    }
    candidates.sort((a, b) => b.score - a.score);
    iconHref = candidates[0]?.href;
    if (!iconHref) {
      // fallback to /favicon.ico
      try {
        const candidate = new URL("/favicon.ico", res.url).href;
        const head = await fetchWithTimeout(candidate, { method: "HEAD", timeoutMs: 2000, cache: "no-store" });
        if (head.ok) iconHref = candidate;
      } catch {}
    }
    if (iconHref) {
      const abs = new URL(iconHref, res.url).href;
      meta.icons = { icon: [{ url: abs }] } as Metadata["icons"];
    }
  } catch {}

  return meta;
}

function buildSnapshotHtml(originalHtml: string, originalUrl: string): string {
  try {
    const url = new URL(originalUrl);
    const baseHref = new URL("./", url).href;
    let html = originalHtml;

    // Remove CSP meta to avoid blocking resources in snapshot context
    html = html.replace(/<meta[^>]*http-equiv=["']content-security-policy["'][^>]*>/gi, "");

    // Strip inline scripts for safety (static snapshot)
    html = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
    // Remove inline event handlers to reduce JS execution surface
    html = html.replace(/\son[a-z-]+=("[^"]*"|'[^']*')/gi, "");

    // Ensure we have a head tag
    if (!/<head[^>]*>/i.test(html)) {
      const bodyContent = /<body[^>]*>[\s\S]*?<\/body>/i.test(html)
        ? html.match(/<body[^>]*>[\s\S]*?<\/body>/i)?.[0] || `<body>${html}</body>`
        : `<body>${html}</body>`;
      html = `<!doctype html><html><head><meta charset="utf-8"></head>${bodyContent}</html>`;
    }

    // Inject base tag early in head for relative URL resolution
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
    // Append our style block at the end of head to win cascade order
    if (/<\/head>/i.test(html)) {
      html = html.replace(/<\/head>/i, `${styleBlock}</head>`);
    } else {
      html = html.replace(/<head(.*?)>/i, `<head$1>${styleBlock}`);
    }

    // Add a minimal banner in body
    const banner = `\n<div style="all:initial; display:block; box-sizing:border-box; width:100%; background:#fffbdd; color:#111; border-bottom:1px solid rgba(0,0,0,.1); font: 13px/1.4 system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; padding:8px 12px; position:sticky; top:0; z-index:2147483647;">Archived snapshot of <a href="${originalUrl}" style="color:#0366d6;">${originalUrl}</a>. Scripts removed for safety.</div>\n`;
    if (/<body[^>]*>/i.test(html)) {
      html = html.replace(/<body(.*?)>/i, `<body$1>${banner}`);
    } else {
      html = html.replace(/<head[^>]*>[\s\S]*?<\/head>/i, (m) => `${m}<body>${banner}</body>`);
    }

    // Inject a minimal script to keep navigation inside the viewer and remove overlays
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
    // Fallback: return original
    return originalHtml;
  }
}

async function performCapture(url: string, type: CaptureType): Promise<CaptureResult> {
  const puppeteer = (await import("puppeteer")).default;
  const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || (puppeteer as any).executablePath?.();
  const browser = await puppeteer.launch({
    headless: true,
    executablePath,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });
  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
    );
    // Disable JavaScript execution during navigation and rendering
    await page.setJavaScriptEnabled(false);
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
    } catch (navErr) {
      throw new Error("Navigation timed out or failed");
    }
    // Give the page a brief moment to settle for more consistent captures
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

export default async function Home({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const sp = await searchParams;
  const urlParam = typeof sp.url === "string" ? sp.url : "";
  const typeParam = "html"

  let result: CaptureResult | null = null;
  let error: string | null = null;

  try {
    result = await performCapture(urlParam, typeParam);
  } catch (e: unknown) {
    error = e instanceof Error ? e.message : "Capture failed";
  }

  if (result && result.contentType.startsWith("text/html")) {
    return <FullscreenSnapshot dataUrl={result.dataUrl} html={result.htmlText} />;
  }

  return (
    <div className="flex flex-col items-center justify-center h-screen min-h-screen bg-black/95 overflow-hidden" style={{ contain: result ? "content" : undefined }}>
      <header className="flex flex-col items-center z-10 mb-6">

        <svg className="text-white w-36 h-16" width="428" height="135" viewBox="0 0 428 135" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
          <path d="M0.227273 108V0.909088H13.8182V49.5H14.6364C15.4242 48.0455 16.5606 46.3636 18.0455 44.4545C19.5303 42.5455 21.5909 40.8788 24.2273 39.4545C26.8636 38 30.3485 37.2727 34.6818 37.2727C40.3182 37.2727 45.3485 38.697 49.7727 41.5455C54.197 44.3939 57.6667 48.5 60.1818 53.8636C62.7273 59.2273 64 65.6818 64 73.2273C64 80.7727 62.7424 87.2424 60.2273 92.6364C57.7121 98 54.2576 102.136 49.8636 105.045C45.4697 107.924 40.4545 109.364 34.8182 109.364C30.5758 109.364 27.1061 108.652 24.4091 107.227C21.7424 105.803 19.6515 104.136 18.1364 102.227C16.6212 100.318 15.4545 98.6212 14.6364 97.1364H13.5V108H0.227273ZM13.5455 73.0909C13.5455 78 14.2576 82.303 15.6818 86C17.1061 89.697 19.1667 92.5909 21.8636 94.6818C24.5606 96.7424 27.8636 97.7727 31.7727 97.7727C35.8333 97.7727 39.2273 96.697 41.9545 94.5455C44.6818 92.3636 46.7424 89.4091 48.1364 85.6818C49.5606 81.9545 50.2727 77.7576 50.2727 73.0909C50.2727 68.4849 49.5758 64.3485 48.1818 60.6818C46.8182 57.0151 44.7576 54.1212 42 52C39.2727 49.8788 35.8636 48.8182 31.7727 48.8182C27.8333 48.8182 24.5 49.8333 21.7727 51.8636C19.0758 53.8939 17.0303 56.7273 15.6364 60.3636C14.2424 64 13.5455 68.2424 13.5455 73.0909Z"/>
          <path d="M73.9573 134.182C71.927 134.182 70.0785 134.015 68.4118 133.682C66.7451 133.379 65.5027 133.045 64.6845 132.682L67.9573 121.545C70.4421 122.212 72.6542 122.5 74.5936 122.409C76.533 122.318 78.2451 121.591 79.73 120.227C81.2451 118.864 82.5785 116.636 83.73 113.545L85.4118 108.909L59.8664 38.1818H74.4118L92.0936 92.3636H92.8209L110.503 38.1818H125.094L96.3209 117.318C94.9876 120.955 93.2906 124.03 91.23 126.545C89.1694 129.091 86.7148 131 83.8664 132.273C81.0179 133.545 77.7148 134.182 73.9573 134.182Z"/>
          <path d="M154.062 109.409C147.183 109.409 141.259 107.939 136.29 105C131.35 102.03 127.532 97.8636 124.835 92.5C122.168 87.1061 120.835 80.7879 120.835 73.5455C120.835 66.3939 122.168 60.0909 124.835 54.6364C127.532 49.1818 131.29 44.9242 136.108 41.8636C140.956 38.803 146.623 37.2727 153.108 37.2727C157.047 37.2727 160.865 37.9242 164.562 39.2273C168.259 40.5303 171.577 42.5758 174.517 45.3636C177.456 48.1515 179.774 51.7727 181.471 56.2273C183.168 60.6515 184.017 66.0303 184.017 72.3636V77.1818H128.517V67H170.699C170.699 63.4242 169.971 60.2576 168.517 57.5C167.062 54.7121 165.017 52.5151 162.38 50.9091C159.774 49.303 156.714 48.5 153.199 48.5C149.38 48.5 146.047 49.4394 143.199 51.3182C140.38 53.1667 138.199 55.5909 136.653 58.5909C135.138 61.5606 134.38 64.7879 134.38 68.2727V76.2273C134.38 80.8939 135.199 84.8636 136.835 88.1364C138.502 91.4091 140.82 93.9091 143.79 95.6364C146.759 97.3333 150.229 98.1818 154.199 98.1818C156.774 98.1818 159.123 97.8182 161.244 97.0909C163.365 96.3333 165.199 95.2121 166.744 93.7273C168.29 92.2424 169.471 90.4091 170.29 88.2273L183.153 90.5455C182.123 94.3333 180.274 97.6515 177.608 100.5C174.971 103.318 171.653 105.515 167.653 107.091C163.683 108.636 159.153 109.409 154.062 109.409Z"/>
          <path d="M187.576 134.182V38.1818H200.849V49.5H201.985C202.773 48.0455 203.91 46.3636 205.395 44.4545C206.879 42.5455 208.94 40.8788 211.576 39.4545C214.213 38 217.698 37.2727 222.031 37.2727C227.667 37.2727 232.698 38.697 237.122 41.5455C241.546 44.3939 245.016 48.5 247.531 53.8636C250.076 59.2273 251.349 65.6818 251.349 73.2273C251.349 80.7727 250.092 87.2424 247.576 92.6364C245.061 98 241.607 102.136 237.213 105.045C232.819 107.924 227.804 109.364 222.167 109.364C217.925 109.364 214.455 108.652 211.758 107.227C209.092 105.803 207.001 104.136 205.485 102.227C203.97 100.318 202.804 98.6212 201.985 97.1364H201.167V134.182H187.576ZM200.895 73.0909C200.895 78 201.607 82.303 203.031 86C204.455 89.697 206.516 92.5909 209.213 94.6818C211.91 96.7424 215.213 97.7727 219.122 97.7727C223.182 97.7727 226.576 96.697 229.304 94.5455C232.031 92.3636 234.092 89.4091 235.485 85.6818C236.91 81.9545 237.622 77.7576 237.622 73.0909C237.622 68.4849 236.925 64.3485 235.531 60.6818C234.167 57.0151 232.107 54.1212 229.349 52C226.622 49.8788 223.213 48.8182 219.122 48.8182C215.182 48.8182 211.849 49.8333 209.122 51.8636C206.425 53.8939 204.379 56.7273 202.985 60.3636C201.592 64 200.895 68.2424 200.895 73.0909Z"/>
          <path d="M275.375 109.545C270.95 109.545 266.95 108.727 263.375 107.091C259.799 105.424 256.965 103.015 254.875 99.8636C252.814 96.7121 251.784 92.8485 251.784 88.2727C251.784 84.3333 252.541 81.0909 254.056 78.5455C255.572 76 257.617 73.9848 260.193 72.5C262.768 71.0152 265.647 69.8939 268.829 69.1364C272.011 68.3788 275.253 67.803 278.556 67.4091C282.738 66.9242 286.132 66.5303 288.738 66.2273C291.344 65.8939 293.238 65.3636 294.42 64.6364C295.602 63.9091 296.193 62.7273 296.193 61.0909V60.7727C296.193 56.803 295.072 53.7273 292.829 51.5455C290.617 49.3636 287.314 48.2727 282.92 48.2727C278.344 48.2727 274.738 49.2879 272.102 51.3182C269.496 53.3182 267.693 55.5455 266.693 58L253.92 55.0909C255.435 50.8485 257.647 47.4242 260.556 44.8182C263.496 42.1818 266.875 40.2727 270.693 39.0909C274.511 37.8788 278.526 37.2727 282.738 37.2727C285.526 37.2727 288.481 37.6061 291.602 38.2727C294.753 38.9091 297.693 40.0909 300.42 41.8182C303.178 43.5455 305.435 46.0151 307.193 49.2273C308.95 52.4091 309.829 56.5455 309.829 61.6364V108H296.556V98.4545H296.011C295.132 100.212 293.814 101.939 292.056 103.636C290.299 105.333 288.041 106.742 285.284 107.864C282.526 108.985 279.223 109.545 275.375 109.545ZM278.329 98.6364C282.087 98.6364 285.299 97.8939 287.965 96.4091C290.662 94.9242 292.708 92.9849 294.102 90.5909C295.526 88.1667 296.238 85.5758 296.238 82.8182V73.8182C295.753 74.303 294.814 74.7576 293.42 75.1818C292.056 75.5758 290.496 75.9242 288.738 76.2273C286.981 76.5 285.268 76.7576 283.602 77C281.935 77.2121 280.541 77.3939 279.42 77.5455C276.784 77.8788 274.375 78.4394 272.193 79.2273C270.041 80.0152 268.314 81.1515 267.011 82.6364C265.738 84.0909 265.102 86.0303 265.102 88.4545C265.102 91.8182 266.344 94.3636 268.829 96.0909C271.314 97.7879 274.481 98.6364 278.329 98.6364Z"/>
          <path d="M368.73 55.2273L356.411 57.4091C355.896 55.8333 355.078 54.3333 353.957 52.9091C352.866 51.4848 351.381 50.3182 349.502 49.4091C347.623 48.5 345.275 48.0455 342.457 48.0455C338.608 48.0455 335.396 48.9091 332.82 50.6364C330.245 52.3333 328.957 54.5303 328.957 57.2273C328.957 59.5606 329.82 61.4394 331.548 62.8636C333.275 64.2879 336.063 65.4545 339.911 66.3636L351.002 68.9091C357.427 70.3939 362.214 72.6818 365.366 75.7727C368.517 78.8636 370.093 82.8788 370.093 87.8182C370.093 92 368.881 95.7273 366.457 99C364.063 102.242 360.714 104.788 356.411 106.636C352.139 108.485 347.184 109.409 341.548 109.409C333.73 109.409 327.351 107.742 322.411 104.409C317.472 101.045 314.442 96.2727 313.32 90.0909L326.457 88.0909C327.275 91.5152 328.957 94.1061 331.502 95.8636C334.048 97.5909 337.366 98.4545 341.457 98.4545C345.911 98.4545 349.472 97.5303 352.139 95.6818C354.805 93.803 356.139 91.5152 356.139 88.8182C356.139 86.6364 355.32 84.803 353.684 83.3182C352.078 81.8333 349.608 80.7121 346.275 79.9545L334.457 77.3636C327.942 75.8788 323.123 73.5152 320.002 70.2727C316.911 67.0303 315.366 62.9242 315.366 57.9545C315.366 53.8333 316.517 50.2273 318.82 47.1364C321.123 44.0455 324.305 41.6364 328.366 39.9091C332.427 38.1515 337.078 37.2727 342.32 37.2727C349.866 37.2727 355.805 38.9091 360.139 42.1818C364.472 45.4242 367.336 49.7727 368.73 55.2273Z"/>
          <path d="M425.835 55.2273L413.516 57.4091C413.001 55.8333 412.183 54.3333 411.062 52.9091C409.971 51.4848 408.486 50.3182 406.607 49.4091C404.728 48.5 402.38 48.0455 399.562 48.0455C395.713 48.0455 392.501 48.9091 389.925 50.6364C387.35 52.3333 386.062 54.5303 386.062 57.2273C386.062 59.5606 386.925 61.4394 388.653 62.8636C390.38 64.2879 393.168 65.4545 397.016 66.3636L408.107 68.9091C414.532 70.3939 419.319 72.6818 422.471 75.7727C425.622 78.8636 427.198 82.8788 427.198 87.8182C427.198 92 425.986 95.7273 423.562 99C421.168 102.242 417.819 104.788 413.516 106.636C409.244 108.485 404.289 109.409 398.653 109.409C390.835 109.409 384.456 107.742 379.516 104.409C374.577 101.045 371.547 96.2727 370.425 90.0909L383.562 88.0909C384.38 91.5152 386.062 94.1061 388.607 95.8636C391.153 97.5909 394.471 98.4545 398.562 98.4545C403.016 98.4545 406.577 97.5303 409.244 95.6818C411.91 93.803 413.244 91.5152 413.244 88.8182C413.244 86.6364 412.425 84.803 410.789 83.3182C409.183 81.8333 406.713 80.7121 403.38 79.9545L391.562 77.3636C385.047 75.8788 380.228 73.5152 377.107 70.2727C374.016 67.0303 372.471 62.9242 372.471 57.9545C372.471 53.8333 373.622 50.2273 375.925 47.1364C378.228 44.0455 381.41 41.6364 385.471 39.9091C389.532 38.1515 394.183 37.2727 399.425 37.2727C406.971 37.2727 412.91 38.9091 417.244 42.1818C421.577 45.4242 424.441 49.7727 425.835 55.2273Z"/>
        </svg>

        <p className="text-zinc-200">Copy and paste a link to get past any wall</p>
      </header>

      <Image
        src="/gradient-bg.png"
        alt="Byepass"
        width={100}
        height={100}
        className="absolute inset-0 w-full h-full object-cover"
      />

      <main className="flex flex-row justify-center w-full mb-28">
        <CaptureForm defaultUrl={urlParam} />
      </main>
    </div>
  );
}
