#!/usr/bin/env python3
"""Ставит метку версии (?v=...) на CSS и все JS-модули, чтобы браузеры
не смешивали после обновления новую страницу со старыми файлами из кеша.

    python3 tools/bump_version.py      # запускать перед каждым коммитом
"""
import pathlib
import re
import time

root = pathlib.Path(__file__).resolve().parent.parent
version = time.strftime('%Y%m%d%H%M%S')

files = [root / 'index.html', *sorted((root / 'js').glob('*.js'))]
pattern = re.compile(r"""((?:href|src)="(?:css|js)/[\w./-]+\.(?:css|js)|from '\./[\w.-]+\.js)(?:\?v=\w+)?""")
for f in files:
    text = f.read_text(encoding='utf-8')
    new = pattern.sub(lambda m: f'{m.group(1)}?v={version}', text)
    if new != text:
        f.write_text(new, encoding='utf-8')
print('version', version)
