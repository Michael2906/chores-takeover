"""Render the Apps Script templates into a plain HTML file you can open.

    .venv/Scripts/python tools/preview.py

Writes build/preview.html: Index.html with its <?!= include(...) ?> partials
inlined, its <?= config.x ?> scriptlets filled in from Config.gs, and
tools/mock_backend.js standing in for google.script.run.

This is for looking at and clicking through the interface without deploying.
The mock is an in-memory imitation of the real rules -- see its header for
where it differs. Nothing in tools/ is ever pushed to Apps Script.
"""

import io
import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = os.path.join(ROOT, "apps-script")
OUT = os.path.join(ROOT, "build", "preview.html")
WRAP_OUT = os.path.join(ROOT, "build", "wrapper.html")

# The preview serves the app on 8777. The wrapper test page is served from a
# SECOND port on purpose: same-origin would let the app's own localStorage
# stand in for the bridge, and the whole point of the wrapper is what happens
# when those two origins are different -- as they are in production.
PREVIEW_ORIGIN = "http://localhost:8777"
PREVIEW_WRAPPER_ORIGIN = "http://localhost:8778"


def read(path):
    with io.open(path, encoding="utf-8") as fh:
        return fh.read()


def config_values():
    """Pulls the few CONFIG entries Index.html asks for out of Config.gs."""
    text = read(os.path.join(SRC, "Config.gs"))

    def grab(key, default):
        m = re.search(r"^\s*%s:\s*'([^']*)'" % key, text, re.M)
        if m:
            return m.group(1)
        m = re.search(r"^\s*%s:\s*(\d+)" % key, text, re.M)
        return m.group(1) if m else default

    # WRAPPER_ORIGINS: [ 'https://a', 'https://b' ]
    origins = []
    m = re.search(r"WRAPPER_ORIGINS:\s*\[(.*?)\]", text, re.S)
    if m:
        origins = re.findall(r"'([^']+)'", m.group(1))

    # The preview serves both pages from localhost, so the real allow-list
    # would (correctly) reject the test wrapper. Add localhost for the preview
    # only -- this never reaches Config.gs or the deployed app.
    origins = origins + [PREVIEW_ORIGIN, PREVIEW_WRAPPER_ORIGIN]

    return {
        "appName": grab("APP_NAME", "Chore Boar"),
        "tagline": grab("TAGLINE", ""),
        "pinLength": grab("PIN_LENGTH", "4"),
        "minPassword": grab("MIN_PASSWORD", "8"),
        "wrapperOrigins": origins,
    }


def render():
    html = read(os.path.join(SRC, "Index.html"))
    cfg = config_values()

    # <?!= include('Styles'); ?>  ->  the file's contents
    def sub_include(m):
        return read(os.path.join(SRC, m.group(1) + ".html"))

    html = re.sub(r"<\?!=\s*include\('([^']+)'\);?\s*\?>", sub_include, html)

    # <?= config.appName ?> and the JSON.stringify / Number forms
    def sub_expr(m):
        expr = m.group(1).strip()

        j = re.match(r"JSON\.stringify\(config\.(\w+)\)$", expr)
        if j:
            return json.dumps(cfg.get(j.group(1), ""))

        n = re.match(r"Number\(config\.(\w+)\)$", expr)
        if n:
            return str(cfg.get(n.group(1), "0"))

        c = re.match(r"config\.(\w+)$", expr)
        if c:
            return cfg.get(c.group(1), "")

        raise SystemExit("preview.py cannot render scriptlet: <?= %s ?>" % expr)

    html = re.sub(r"<\?!?=\s*(.+?)\s*\?>", sub_expr, html)

    if "<?" in html:
        leftover = re.findall(r"<\?.*?\?>", html, re.S)
        raise SystemExit("Unrendered scriptlets remain: %r" % leftover[:3])

    # Stand in for google.script.run, before the app's own script runs.
    mock = read(os.path.join(HERE, "mock_backend.js"))
    banner = (
        '<div style="position:fixed;left:0;right:0;bottom:0;z-index:99;'
        'background:#914a42;color:#fff;font:12px Arial;padding:4px 8px;'
        'text-align:center">LOCAL PREVIEW — fake data. '
        'demo@example.com / password123 · PINs: Sarah 1234, Ellie 1111</div>'
    )
    # Preview-only: #autofill drives the REAL sign-in form, so the client path
    # under test (form submit -> api -> TOKENS setter -> the wrapper bridge) is
    # the shipping one. Only the typing is automated. Needed because the
    # cross-origin wrapper test cannot reach into the frame to click.
    autofill = """
<script>
(function () {
  if (location.hash.indexOf('autofill') < 0) return;
  document.addEventListener('DOMContentLoaded', function () {
    var tries = 0;
    var go = setInterval(function () {
      var gate = document.getElementById('gate');
      var f = document.getElementById('form-signin');
      if (gate && !gate.hidden && f) {
        clearInterval(go);
        f.email.value = 'demo@example.com';
        f.password.value = 'password123';
        f.dispatchEvent(new Event('submit', {bubbles: true, cancelable: true}));
      } else if (++tries > 60) {
        clearInterval(go);
      }
    }, 100);
  });
})();
</script>
"""

    html = html.replace(
        "</body>",
        banner + "\n<script>\n" + mock + "\n</script>\n" + autofill + "</body>")

    # The mock must be defined before Scripts.html's DOMContentLoaded fires;
    # putting it last in <body> is enough, but move it ahead of the app script
    # so ordering is obvious to anyone reading the output.
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with io.open(OUT, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(html)

    build_wrapper()

    print("Wrote %s (%.1f KB)" % (
        os.path.relpath(OUT, ROOT), os.path.getsize(OUT) / 1024))
    print("Wrote %s (%.1f KB)" % (
        os.path.relpath(WRAP_OUT, ROOT), os.path.getsize(WRAP_OUT) / 1024))
    print("Open it, or run:  .venv/Scripts/python -m http.server -d build 8777")


def build_wrapper():
    """The real docs/index.html, retargeted at the preview.

    Only two things change -- what it frames, and which origin it will talk to
    -- so what gets exercised here is the wrapper that actually ships, not a
    re-implementation of it that could drift.
    """
    html = read(os.path.join(ROOT, "docs", "index.html"))

    html = re.sub(r'src="https://script\.google\.com/[^"]*"',
                  'src="%s/preview.html#autofill"' % PREVIEW_ORIGIN, html)

    before = html
    html = html.replace(
        "return origin === 'https://script.google.com' ||",
        "return origin === %s ||\n"
        "                 origin === 'https://script.google.com' ||"
        % json.dumps(PREVIEW_ORIGIN))
    if html == before:
        raise SystemExit("build_wrapper: allow-list line in docs/index.html moved")

    html = html.replace("<title>Chore Boar</title>",
                        "<title>Chore Boar (wrapper preview)</title>")

    with io.open(WRAP_OUT, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(html)


if __name__ == "__main__":
    render()
