#!/usr/bin/env python3
"""Repeatable static regression checks for the recovered AI-Syed-Jalal frontend.

Run: python source/AI-Syed-Jalal-FINAL-RECOVERED/scripts/validate-recovery-static.py
This checks markup/link/asset invariants only; it does not replace browser, API,
authentication, accessibility, visual-approval, or production deployment tests.
"""
from html.parser import HTMLParser
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1] / "frontend"
REQUIRED_FILES = ("index.html", "dashboard.html", "projects.html", "visual-styles.html", "visual-library.html", "workspace.html", "components/AIWidget/AIWidget.js", "components/AIWidget/AIWidget.css", "config/api.js")
MODES = ("Glassmorphism", "Watermorphism", "Firemorphism", "Rainbowmorphism")
EXPECTED_IMAGES = (
    "1000121180.jpg",
    "1000121181.png",
    "AI-Syed Jalal Futuristic AI Ecosystem.png",
    "AI-Syed Jalal Futuristic Platform UI Board.png",
    "AI-Syed Jalal Neon AI Command Center.png",
    "Alsyed Jalal AI Platform Overview.png",
    "Cleared Project Structure Dashboard.png",
    "FINAL-VISUAL-RECOVERY-COMPARISON.png",
)

class Markup(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.links, self.images, self.ids, self.forms = [], [], set(), set()
        self.figures = 0
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if a.get("id"): self.ids.add(a["id"])
        if tag == "a" and a.get("href"): self.links.append(a["href"])
        if tag == "img": self.images.append(a)
        if tag == "form" and a.get("id"): self.forms.add(a["id"])
        if tag == "figure": self.figures += 1

def fail(msg):
    print("FAIL:", msg)
    return False

def main():
    failures = []
    def check(condition, message):
        if condition: print("PASS:", message)
        else: failures.append(message); fail(message)
    docs = {}
    for name in REQUIRED_FILES:
        path = ROOT / name
        check(path.is_file(), f"required frontend file exists: {name}")
        if path.is_file(): docs[name] = path.read_text(encoding="utf-8")
    for asset in ("assets/approved-sj-emblem.png", "assets/v101-palette.css"):
        check((ROOT / asset).is_file(), f"shared asset exists: {asset}")
    if "index.html" in docs:
        home = docs["index.html"]
        check('src="assets/approved-sj-emblem.png"' in home, "homepage uses the recovered crowned SJ emblem")
        check('id="login"' in home and 'id="f"' in home, "existing login modal and form remain present")
        check("/api/auth/login" in home, "existing login API request is preserved")
        check('href="visual-styles.html"' in home and 'href="visual-library.html"' in home,
              "homepage links to both additive visual pages")
        check('href="dashboard.html"' in home and 'href="projects.html"' in home,
              "homepage navigation exposes the dashboard and project portfolio")
        check('aria-label="Main navigation"' in home and '.nav nav{display:flex;order:3' in home,
              "homepage navigation remains available on mobile layouts")
        check('Your AI Partner for a <span>Smarter Tomorrow</span>' in home,
              "homepage tagline matches the saved visual reference")
        check('class="command-preview"' in home and 'Not live telemetry' in home,
              "homepage includes a clearly labelled command-center preview")
        check('id="featured-projects"' in home and 'Integration Center' in home,
              "homepage surfaces the recovered project ecosystem")
    if "projects.html" in docs:
        portfolio = docs["projects.html"]
        check("AI Agent Catalog" in portfolio and "3,500 Skills" in portfolio and "OmniRoute" in portfolio,
              "project portfolio lists core source-backed project modules")
        check("PostgreSQL + Node API" in portfolio and "HTTP 404" in portfolio,
              "portfolio explicitly discloses the backend deployment blocker")
        check("function applyFilter()" in portfolio and "addEventListener('input',applyFilter)" in portfolio,
              "portfolio project search/filter controls are wired")
    if "dashboard.html" in docs:
        dashboard = docs["dashboard.html"]
        check('href="projects.html"' in dashboard and 'href="visual-library.html"' in dashboard,
              "dashboard sidebar links to projects and visual library")
        check('id="v-projects"' in dashboard and "Projects &amp; Integrations" in dashboard,
              "dashboard includes a project portfolio view")
        check('src="components/AIWidget/AIWidget.js"' in home, "homepage mounts the recovered V122 AI widget")
        check('src="assets/ai-widget.js"' not in home, "homepage does not load a duplicate legacy widget")
    if "components/AIWidget/AIWidget.js" in docs:
        widget_js = docs["components/AIWidget/AIWidget.js"]
        check("import './AIWidget.css'" not in widget_js, "widget avoids a browser-incompatible native CSS module import")
        check("new URL('./AIWidget.css', import.meta.url).href" in widget_js and "root.prepend(stylesheet)" in widget_js,
              "widget loads its CSS into shadow DOM using a browser-native stylesheet link")
    if "config/api.js" in docs:
        api_config = docs["config/api.js"]
        check("aj-v31-api" in api_config and "aj-v122-api" in api_config,
              "AI widget accepts both current login API storage and legacy API storage")
        check("function getStoredApiBase()" in api_config, "AI widget reads the API base dynamically after login configuration")
    if "visual-styles.html" in docs:
        styles = docs["visual-styles.html"]
        for mode in MODES: check(mode in styles, f"visual showcase contains {mode}")
        check("@media(max-width:720px)" in styles, "visual showcase includes a mobile layout")
        check("prefers-reduced-motion" in styles, "visual showcase respects reduced-motion preference")
        check('src="assets/approved-sj-emblem.png"' in styles, "visual showcase uses the recovered crowned SJ emblem")
    for page in ("index.html", "dashboard.html", "projects.html", "visual-styles.html", "visual-library.html", "workspace.html", "roadmaps.html"):
        if page in docs:
            check('assets/approved-sj-emblem.png' in docs[page], f"{page} uses the same recovered crowned SJ brand asset")
    if "visual-library.html" in docs:
        gallery = docs["visual-library.html"]
        parsed = Markup(); parsed.feed(gallery)
        check(parsed.figures == 8, f"visual library contains exactly 8 candidate cards (found {parsed.figures})")
        names = [name for name in EXPECTED_IMAGES if name in gallery]
        check(len(names) == 8, f"all 8 recovered candidate filenames are represented (found {len(names)})")
        check("not yet individually signed off" in gallery.lower(), "gallery clearly labels candidate images as not approved")
        check('href="visual-styles.html"' in gallery, "gallery links back to visual styles")
    for name, html in docs.items():
        parsed = Markup(); parsed.feed(html)
        for href in parsed.links:
            if href.startswith(("http://", "https://", "mailto:", "tel:", "#", "javascript:")):
                continue
            target = href.split("#", 1)[0].split("?", 1)[0]
            if not target or target in ("./", "."):
                target = "index.html"
            target_path = (ROOT / target).resolve()
            try: target_path.relative_to(ROOT.resolve())
            except ValueError:
                failures.append(f"unsafe local link in {name}: {href}"); fail(f"unsafe local link in {name}: {href}"); continue
            check(target_path.is_file(), f"local link resolves: {name} -> {href}")
    print(f"\nStatic regression result: {'PASS' if not failures else 'FAIL'}; {len(failures)} failure(s).")
    print("Scope: static markup and local asset checks only; browser/runtime/backend/visual approval remain separate release gates.")
    return 1 if failures else 0

if __name__ == "__main__":
    sys.exit(main())
