"""Run: python muse-stream-check.py. No browser or third-party dependencies."""
import ast
import asyncio
from pathlib import Path
from types import SimpleNamespace

source = ast.parse(Path(__file__).with_name('main.py').read_text(encoding='utf-8'))
method = next(n for n in ast.walk(source) if isinstance(n, ast.AsyncFunctionDef) and n.name == 'execute_chat')
block = next(n for n in ast.walk(method) if isinstance(n, ast.Try) and any(isinstance(s, ast.Assign) and any(isinstance(t, ast.Name) and t.id == 'response_text' for t in s.targets) for s in n.body))
start = next(i for i, n in enumerate(block.body) if isinstance(n, ast.Assign) and any(isinstance(t, ast.Name) and t.id == 'previous_text' for t in n.targets))
end = next(i for i, n in enumerate(block.body) if isinstance(n, ast.Return))
body = block.body[start:end + 1]
fn = ast.AsyncFunctionDef(name='collect', args=ast.arguments(posonlyargs=[], args=[ast.arg(arg=n) for n in ['page','on_delta','asyncio','self','acc']], kwonlyargs=[], kw_defaults=[], defaults=[]), body=ast.parse("response_text = ''\nstreamed_text = ''\nhas_logged_stream = False\nstable_count = 0\njs_extractor = ''\nold_prose_count = 0").body + body, decorator_list=[])
ns = {}
exec(compile(ast.fix_missing_locations(ast.Module(body=[fn], type_ignores=[])), '<production-stream-loop>', 'exec'), ns)

async def check():
    final = '```python\nprint("final answer")\n```'
    snapshots = iter([('Draft answer', True), ('Rewritten answer with more text', True), ('Short', True), (final, False)])
    class Page:
        async def evaluate(self, *_):
            text, generating = next(snapshots, (final, False))
            return {'text': text, 'isGenerating': generating}
    async def sleep(_):
        pass
    emitted = []
    result = await ns['collect'](Page(), emitted.append, SimpleNamespace(sleep=sleep), SimpleNamespace(log=lambda _: None), SimpleNamespace(name='test', requests_handled=1))
    assert result == final, result
    assert emitted == [final], emitted
    print('PASS: growing, rewritten and shortened drafts emit only final code once')

asyncio.run(check())
