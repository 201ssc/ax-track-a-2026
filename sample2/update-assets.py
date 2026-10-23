"""Keep local modules and styles on one content-derived cache version. No build dependencies."""
from pathlib import Path
import hashlib
import re

root = Path(__file__).resolve().parent
files = sorted([*root.glob('*.js'), *root.glob('*.mjs'), root / 'styles.css', root / 'index.html'])
version_pattern = re.compile(r'\?v=[a-f0-9]{12}')
contents = {p: version_pattern.sub('', p.read_text()) for p in files}
version = hashlib.sha256(''.join(p.name + '\n' + text for p, text in contents.items()).encode()).hexdigest()[:12]
for path, text in contents.items():
    if path.suffix in ('.js', '.mjs'):
        text = re.sub(r"(['\"])(\./(?:model|demo|chat|prototype|api)\.mjs)\1", lambda m: f'{m[1]}{m[2]}?v={version}{m[1]}', text)
    if path.name == 'index.html':
        text = text.replace('href="styles.css"', f'href="styles.css?v={version}"')
        text = text.replace('src="boot.js"', f'src="boot.js?v={version}"')
    if path.read_text() != text:
        path.write_text(text)
print('Asset version:', version)
