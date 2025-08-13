# Byepass

Archiving viewer for the modern web. Paste a URL and get a clean, script-free snapshot you can read and navigate without popups, overlays, or heavy client code.

> Use responsibly. Only archive content you have the right to access. Respect site terms and laws in your jurisdiction.

## Features

- Script-free HTML snapshots with a minimal banner that links to the original URL
- Automatic cleanup for common overlays, cookie/consent modals, and scroll locks
- Safe rendering in a sandboxed iframe
- Preserves relative links via an injected `<base>`; link clicks reload inside Byepass
- Fast captures using Puppeteer with JavaScript disabled and non-essential requests blocked
- Dynamic page metadata (title + favicon) pulled from the target page

Note: The capture engine supports screenshot (PNG) and PDF under the hood, though the UI currently captures HTML snapshots.

## Quickstart

Requirements: Node 18+ (Node 20 recommended)

```bash
npm install
npm run dev
```

Open `http://localhost:3000` and paste any URL.

## How it works

1. The server opens the target URL in headless Chrome (Puppeteer) with JavaScript disabled for a lightweight, static snapshot.
2. Non-essential resource types (scripts, fonts, XHR, etc.) are blocked to speed up loads.
3. The resulting HTML is post-processed:
   - Content-Security-Policy meta tags are removed
   - All inline scripts and event handlers are stripped
   - A `<base>` tag is injected so relative links resolve correctly
   - A small banner is added for context, and a script enables in-view navigation
4. The final document is served as a `data:text/html` and rendered in a sandboxed iframe.

## Usage tips

- Many pages will render fine without JavaScript. Pages that strictly require JS may be incomplete.
- Lazy-loaded media that relies on JS may not appear in the snapshot.
- Inside a snapshot, link clicks will open the new page inside Byepass automatically.

## Configuration

- Puppeteer: By default uses the Chromium bundled with Puppeteer. In some environments (e.g., certain hosts), set `PUPPETEER_EXECUTABLE_PATH` to a system Chrome/Chromium binary.
- Timeouts: Navigation and request timeouts are set to 30s by default.

## Scripts

```bash
# Start dev server (Next.js 15)
npm run dev

# Build production
npm run build

# Start production server
npm run start

# Lint
npm run lint
```

## Project structure

```
src/
  app/
    page.tsx                # Server component: runs capture and renders snapshot or the form
  components/
    CaptureForm.tsx         # URL input and navigation
    FullscreenSnapshot.tsx  # Sandboxed iframe viewer
    capture.ts              # Capture helpers (Puppeteer + HTML transformation)
```

## Ethics and legal

Byepass is provided for educational and personal use. Do not archive content you’re not allowed to access. Some sites disallow archiving or scraping via robots.txt or headers; ensure compliance with the site’s terms and applicable laws.
