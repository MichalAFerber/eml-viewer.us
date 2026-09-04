// Headless-Chromium harness — serves this viewer with the *real* security
// headers (incl. CSP) from `_headers` and drives index.html, per the dev
// standards (§15). Exit 1 on any failure.
import { chromium } from "playwright";
import http from "node:http";
import { readFileSync, existsSync, statSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const ROOT = process.cwd();
const PORT = Number(process.env.PORT) || 8099;

const H = {};
for (const line of readFileSync(join(ROOT, "_headers"), "utf8").split("\n")) {
  const m = line.match(/^[ \t]+([A-Za-z0-9-]+):[ \t]*(.+?)\s*$/);
  if (m && !line.trim().startsWith("#")) H[m[1]] = m[2];
}
if (!H["Content-Security-Policy"]) {
  console.error("FAIL: no Content-Security-Policy found in _headers");
  process.exit(1);
}

const MIME = {
  ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript",
  ".json": "application/json", ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon",
  ".woff2": "font/woff2", ".xml": "application/xml", ".txt": "text/plain",
};
const mime = (p) => MIME[p.slice(p.lastIndexOf("."))] || "application/octet-stream";

const server = http.createServer((req, res) => {
  let p = decodeURIComponent((req.url || "/").split("?")[0]);
  if (p.endsWith("/")) p += "index.html";
  let fp = join(ROOT, p);
  if (!fp.startsWith(ROOT) || !existsSync(fp)) fp = join(ROOT, "index.html");
  try {
    res.writeHead(200, { ...H, "Content-Type": mime(fp) });
    res.end(readFileSync(fp));
  } catch (e) { res.writeHead(500); res.end(String(e)); }
});
await new Promise((r) => server.listen(PORT, r));

const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}
);
const results = [];
const check = (name, ok, detail) => results.push([name, !!ok, detail]);
const errs = [];
const hook = (page) => {
  page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  page.on("pageerror", (e) => errs.push(String(e)));
};

// A minimal well-formed .eml: readFile() calls show() (or showMsgNotice()
// for a compound-binary .msg) on any accepted extension, and show() tries
// EMLCORE.parseEml() inside its own try/catch, so this is enough to
// exercise the ?name= write path either way.
const FIX = mkdtempSync(join(tmpdir(), "eml-harness-"));
const FIXTURE_EML = join(FIX, "sample.eml");
writeFileSync(FIXTURE_EML, "From: a@example.com\r\nSubject: Test\r\n\r\nHello.\r\n");

// -- main context: light system scheme, full toggle round-trip
const ctx = await browser.newContext({ colorScheme: "light", viewport: { width: 1240, height: 800 } });
const page = await ctx.newPage();
hook(page);
await page.goto(`http://localhost:${PORT}/`, { waitUntil: "load", timeout: 30000 });
await page.evaluate(() => document.fonts.ready);
check("font loads under CSP", await page.evaluate(() => [...document.fonts].some((f) => f.family.includes("JetBrains"))));
check("heading uses JetBrains Mono", await page.evaluate(() => {
  const el = document.querySelector(".doc-title") || document.querySelector(".empty-title");
  return el && getComputedStyle(el).fontFamily.includes("JetBrains Mono");
}));
check("light default with light system scheme", await page.evaluate(() => document.getElementById("bgPicker").value) === "#ffffff");
check("toggle present in toolbar", await page.evaluate(() => {
  const t = document.getElementById("themeToggle");
  return !!t && t.hasAttribute("aria-pressed") && !!t.closest("nav.actions");
}));
check("icons in light mode (sun shown, moon hidden)", await page.evaluate(() => {
  const s = document.getElementById("themeIconSun"), m = document.getElementById("themeIconMoon");
  return !s.hasAttribute("hidden") && m.hasAttribute("hidden");
}));
await page.click("#themeToggle");
check("toggle to dark sets picker #0d1117", await page.evaluate(() => document.getElementById("bgPicker").value) === "#0d1117");
check("aria-pressed true in dark", await page.getAttribute("#themeToggle", "aria-pressed") === "true");
check("icons in dark mode (moon shown, sun hidden)", await page.evaluate(() => {
  const s = document.getElementById("themeIconSun"), m = document.getElementById("themeIconMoon");
  const moonVisible = !m.hasAttribute("hidden") && getComputedStyle(m).display !== "none";
  const sunHidden = s.hasAttribute("hidden") || getComputedStyle(s).display === "none";
  return moonVisible && sunHidden;
}));
check("choice persists (mykk-bg)", await page.evaluate(() => { try { return localStorage.getItem("mykk-bg") === "#0d1117"; } catch (e) { return false; } }));
await page.click("#themeToggle");
check("toggle back to light", await page.evaluate(() => document.getElementById("bgPicker").value) === "#ffffff");

// -- ?name=: loading a file reflects its name into the URL, Clear removes it
await page.setInputFiles("#fileInput", FIXTURE_EML);
await page.waitForFunction(() => document.body.classList.contains("viewing"), null, { timeout: 10000 });
check("load: URL reflects ?name=sample.eml", await page.evaluate(() =>
  new URLSearchParams(location.search).get("name")) === "sample.eml");
await page.click("#btnClear");
check("clear: ?name= removed from the URL", await page.evaluate(() =>
  new URLSearchParams(location.search).get("name")) === null);
await ctx.close();

// -- direct visit with ?name=: empty-state names the last-viewed file
const p3 = await browser.newContext().then((c) => c.newPage());
hook(p3);
await p3.goto(`http://localhost:${PORT}/?name=${encodeURIComponent("sample.eml")}`, { waitUntil: "load", timeout: 30000 });
check("?name=: 'shared for' sub-line names the file", await p3.evaluate(() =>
  /shared for/.test(document.querySelector(".empty-sub").textContent) &&
  /sample\.eml/.test(document.querySelector(".empty-sub").textContent)));
await p3.context().close();

// -- ?name= carrying markup renders as TEXT, never parsed as HTML
const p4 = await browser.newContext().then((c) => c.newPage());
hook(p4);
const HOSTILE_NAME = "<img src=x onerror=alert(1)>.eml";
await p4.goto(`http://localhost:${PORT}/?name=${encodeURIComponent(HOSTILE_NAME)}`, { waitUntil: "load", timeout: 30000 });
check("?name=: hostile markup shows as literal text, never parsed", await p4.evaluate((name) => {
  const sub = document.querySelector(".empty-sub");
  return sub.textContent.includes(name) && sub.querySelector("img") === null;
}, HOSTILE_NAME));
await p4.context().close();

// -- fresh context with dark system scheme: must default dark
const ctx2 = await browser.newContext({ colorScheme: "dark" });
const p2 = await ctx2.newPage();
hook(p2);
await p2.goto(`http://localhost:${PORT}/`, { waitUntil: "load", timeout: 30000 });
check("system-dark default (#0d1117)", await p2.evaluate(() => document.getElementById("bgPicker").value) === "#0d1117");
await ctx2.close();

// -- static assertions
const sz = (p) => (existsSync(join(ROOT, p)) ? statSync(join(ROOT, p)).size : 0);
check("fonts present", sz("fonts/JetBrainsMono-Bold.subset.woff2") > 10000 && sz("fonts/JetBrainsMono-ExtraBold.subset.woff2") > 10000 && sz("fonts/OFL.txt") > 0);
check("favicon.ico present", sz("favicon.ico") > 2000);
check("site.webmanifest valid", (() => { try { return !!JSON.parse(readFileSync(join(ROOT, "site.webmanifest"), "utf8")).name; } catch (e) { return false; } })());
check("llms/ads/security.txt present", sz("llms.txt") > 0 && sz("ads.txt") > 0 && sz(".well-known/security.txt") > 0);
const csp = H["Content-Security-Policy"];
check("CSP allows self fonts + manifest", /font-src[^;]*'self'/.test(csp) && /manifest-src 'self'/.test(csp));
const idx = readFileSync(join(ROOT, "index.html"), "utf8");
check("head links (manifest + favicon.ico)", idx.includes('rel="manifest"') && idx.includes("/favicon.ico"));

// External-resource network noise (analytics offline) is allowed; CSP
// violations are worded "Refused to ..." and still fail.
const ALLOW = [/plausible/i, /thompsonblack/i, /net::ERR/i, /Failed to load resource/i];
const real = errs.filter((e) => !ALLOW.some((re) => re.test(e)));
check("no unexpected console/CSP errors", real.length === 0, real[0]);

await browser.close();
server.close();

let failed = 0;
for (const [name, ok, detail] of results) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${!ok && detail ? "  — " + String(detail).slice(0, 160) : ""}`);
  if (!ok) failed++;
}
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
