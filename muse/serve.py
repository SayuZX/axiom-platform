import asyncio
import os
from pathlib import Path

BASE = Path(__file__).resolve().parent
os.environ['BRIDGE_API_KEY'] = (BASE / 'bridge.key').read_text().strip()
os.environ['PLAYWRIGHT_BROWSERS_PATH'] = str(BASE / 'browsers')
import main

main.HOST = '127.0.0.1'

async def serve():
    asyncio.set_event_loop(main.loop)
    await main.app_instance.init_engine()
    server = main.ThreadingHTTPServer((main.HOST, main.PORT), main.RequestHandler)
    server.daemon_threads = True
    from threading import Thread
    Thread(target=server.serve_forever, daemon=True).start()
    try:
        await asyncio.Event().wait()
    finally:
        server.shutdown()
        await main.app_instance.cleanup()

main.loop.run_until_complete(serve())
