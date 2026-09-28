"""Create a portable VS Code project ZIP (Python 3, standard library only)."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
root = Path(__file__).resolve().parent.parent
out = root / 'exports' / 'dasco-configurator-vscode.zip'
out.parent.mkdir(exist_ok=True)
excluded = {'.git', '.openai', '.sites-runtime', 'node_modules', 'exports', '__pycache__'}
with ZipFile(out, 'w', ZIP_DEFLATED) as archive:
    for file in sorted(root.rglob('*')):
        relative = file.relative_to(root)
        if file.is_file() and not any(part in excluded for part in relative.parts) and (not file.name.startswith('.env') or file.name == '.env.example'):
            archive.write(file, Path('dasco-configurator') / relative)
with ZipFile(out) as archive:
    assert archive.testzip() is None
    assert 'dasco-configurator/README.md' in archive.namelist()
    assert 'dasco-configurator/src/admin.js' in archive.namelist()
    print(f'{out}: {len(archive.namelist())} files, {out.stat().st_size:,} bytes')
