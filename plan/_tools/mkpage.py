"""Stamp a portal page from the shared header (plan/_tools/_header.html) so every page has
an identical KHDA DS header. Usage: python plan/_tools/mkpage.py <name> <team> <script> [title]
The page body is rendered by js/<script>.js into <main id="main">."""
import io, sys, os
root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
V = '20260921b'
name, team, script = sys.argv[1], sys.argv[2], sys.argv[3]
title = sys.argv[4] if len(sys.argv) > 4 else 'KHDA'
header = io.open(os.path.join(root, 'plan/_tools/_header.html'), encoding='utf-8').read()
common = ['i18n', 'a11y', 'fit', 'lists', 'datasets', 'schema', 'sector', 'roles', 'journey', 'chatbot']
scripts = '\n'.join(f'  <script src="js/{s}.js?v={V}"></script>' for s in common + [script])
html = f'''<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{title} — KHDA</title>
  <meta name="application-name" content="KHDA">
  <link rel="icon" type="image/svg+xml" href="assets/favicon.svg?v=20260920f">
  <meta name="theme-color" content="#A8305C">
  <link rel="stylesheet" href="css/khda.css?v={V}">
</head>
<body class="on-canvas" data-team="{team}">

{header}  <main class="page page--plan" id="main" aria-busy="true"></main>

  <div class="toast-host" id="toastHost" aria-live="polite"></div>

{scripts}
</body>
</html>
'''
io.open(os.path.join(root, name + '.html'), 'w', encoding='utf-8', newline='\n').write(html)
print('wrote', name + '.html')
