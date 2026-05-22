"""
download_refs.py — Archive all referenced URLs from references/index.json.

For each reference with a discoverable URL, fetches the page and saves it as:
  <output_dir>/<stub>.html  — HTML responses
  <output_dir>/<stub>.pdf   — PDF responses, or PDFs linked from the HTML page

Skips stubs that already have a downloaded file unless --force is given.
Failed and skipped references are written to <output_dir>/failed.txt.

Usage:
    python tools/download_refs.py <output_dir>
    python tools/download_refs.py <output_dir> --delay 2.0
    python tools/download_refs.py <output_dir> --force
"""

import argparse
import json
import re
import sys
import time
from pathlib import Path
from urllib.parse import urljoin

try:
    import requests
    from requests.exceptions import RequestException
except ImportError:
    print("ERROR: requests not installed. Run: pip install requests")
    sys.exit(1)

ROOT = Path(__file__).parent.parent
REFERENCES_PATH = ROOT / "references" / "index.json"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (compatible; UVICMaterialsArchiver/1.0; "
        "educational reference archival +https://github.com/scroberts/Engineering-Materials-Database)"
    )
}

TIMEOUT = 25  # seconds


def safe_filename(stub: str) -> str:
    """Replace characters that are invalid in filenames (e.g. '/' in DOI keys)."""
    return re.sub(r'[/\\:*?"<>|]', '_', stub)


def resolve_url(entry: dict) -> str | None:
    """Return the best URL for a reference entry, matching detail.js priority order."""
    if entry.get("doi"):
        return f"https://doi.org/{entry['doi']}"
    if entry.get("url"):
        return entry["url"]
    if entry.get("bibtex"):
        m = re.search(r'\burl\s*=\s*\{([^}]+)\}', entry["bibtex"])
        if m:
            return m.group(1).strip()
    return None


def find_pdf_link(html: str, base_url: str) -> str | None:
    """Return the first PDF href found in HTML, resolved against base_url."""
    for m in re.finditer(r'href=["\']([^"\']*\.pdf(?:\?[^"\']*)?)["\']', html, re.IGNORECASE):
        return urljoin(base_url, m.group(1))
    return None


def already_downloaded(stub: str, output_dir: Path) -> bool:
    name = safe_filename(stub)
    return (output_dir / f"{name}.html").exists() or (output_dir / f"{name}.pdf").exists()


def fetch(url: str) -> requests.Response:
    return requests.get(url, headers=HEADERS, timeout=TIMEOUT, allow_redirects=True)


def download_one(stub: str, entry: dict, output_dir: Path, delay: float, force: bool) -> dict:
    """
    Attempt to download one reference. Returns a result dict:
      { "status": "ok"|"skip"|"fail"|"no_url", "url": str|None, "reason": str|None }
    """
    url = resolve_url(entry)

    if not url:
        print(f"  SKIP  {stub:40s}  no URL")
        return {"status": "no_url", "url": None, "reason": "No URL available"}

    if not force and already_downloaded(stub, output_dir):
        print(f"  SKIP  {stub:40s}  already downloaded")
        return {"status": "skip", "url": url, "reason": "Already downloaded"}

    # ── Primary fetch ─────────────────────────────────────────────────────────
    try:
        resp = fetch(url)
        resp.raise_for_status()
    except RequestException as e:
        print(f"  FAIL  {stub:40s}  {e}")
        return {"status": "fail", "url": url, "reason": str(e)}

    content_type = resp.headers.get("Content-Type", "").split(";")[0].strip().lower()
    final_url = resp.url  # after redirects
    name = safe_filename(stub)

    # ── Save primary response ─────────────────────────────────────────────────
    if "application/pdf" in content_type or final_url.lower().split("?")[0].endswith(".pdf"):
        path = output_dir / f"{name}.pdf"
        path.write_bytes(resp.content)
        print(f"  PDF   {stub:40s}  {final_url}")
        time.sleep(delay)
        return {"status": "ok", "url": final_url, "reason": None}

    # HTML — save page
    path = output_dir / f"{name}.html"
    path.write_bytes(resp.content)
    print(f"  HTML  {stub:40s}  {final_url}")

    # ── Try to find and download a linked PDF ─────────────────────────────────
    try:
        html_text = resp.content.decode("utf-8", errors="replace")
        pdf_url = find_pdf_link(html_text, final_url)
        if pdf_url:
            time.sleep(delay)
            pdf_resp = fetch(pdf_url)
            pdf_resp.raise_for_status()
            pdf_path = output_dir / f"{name}.pdf"
            pdf_path.write_bytes(pdf_resp.content)
            print(f"  PDF   {stub:40s}  {pdf_url}  (linked)")
    except Exception:
        pass  # PDF discovery is best-effort; don't fail the whole entry

    time.sleep(delay)
    return {"status": "ok", "url": final_url, "reason": None}


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("output_dir", help="Directory to save downloaded files")
    parser.add_argument(
        "--delay", type=float, default=1.5, metavar="SECONDS",
        help="Pause between requests in seconds (default: 1.5)"
    )
    parser.add_argument(
        "--force", action="store_true",
        help="Re-download files that already exist in output_dir"
    )
    args = parser.parse_args()

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    refs: dict = json.loads(REFERENCES_PATH.read_text(encoding="utf-8"))
    print(f"References : {len(refs)}")
    print(f"Output dir : {output_dir.resolve()}")
    print(f"Delay      : {args.delay} s\n")

    failures: list[tuple[str, str | None, str]] = []  # (stub, url, reason)

    for stub, entry in sorted(refs.items()):
        result = download_one(stub, entry, output_dir, args.delay, args.force)
        if result["status"] in ("fail", "no_url"):
            failures.append((stub, result["url"], result["reason"]))

    # ── Write failure log ────────────────────────────────────────────────────
    fail_path = output_dir / "failed.txt"
    with open(fail_path, "w", encoding="utf-8") as f:
        f.write(f"# Failed/unavailable references — {len(failures)} of {len(refs)}\n")
        f.write("# stub\turl\treason\n\n")
        for stub, url, reason in failures:
            f.write(f"{stub}\t{url or '—'}\t{reason}\n")

    total = len(refs)
    ok = total - len(failures)
    print(f"\n{'─' * 60}")
    print(f"Downloaded : {ok}/{total}")
    if failures:
        print(f"Failed     : {len(failures)}  →  {fail_path}")


if __name__ == "__main__":
    main()
