#!/usr/bin/env python3
"""
⚡ MUSE.AI MULTI-ACCOUNT BRIDGE (PTERODACTYL TUI & API GATEWAY)
- HTTP API Gateway running 24/7 on port 3008 (OpenAI-compatible /v1)
- Persistent Random API Key (sk-...)
- Interactive Console TUI in Pterodactyl Web Console (Command Input bar)
- Step-by-Step OTP Account Login directly from Pterodactyl Console
- High-Speed Direct Connection (Zero Proxy Latency)
"""

import sys
try:
    sys.stdout.reconfigure(line_buffering=True)
    sys.stderr.reconfigure(line_buffering=True)
except Exception:
    pass

import asyncio
import glob
import html
import json
import os
import re
import secrets
import signal
import socket
import time
import urllib.request
import ast
from datetime import datetime
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from threading import Thread
from typing import Dict, List, Optional, Callable, Tuple
from urllib.parse import urlparse
from tool_protocol import prepare, decode, finish_reason

from rich.console import Console
from rich.panel import Panel
from rich.prompt import Prompt
from rich.table import Table
from rich import box
from rich.markup import escape

console = Console(highlight=False, width=70, force_terminal=True)

# Directories
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SESSIONS_DIR = os.path.join(BASE_DIR, "sessions")
REGISTRY_FILE = os.path.join(BASE_DIR, "accounts.json")
CONFIG_FILE = os.path.join(BASE_DIR, "config.json")
API_KEYS_DB_FILE = os.path.join(BASE_DIR, "api_keys.txt")
FILES_DIR = os.path.join(BASE_DIR, "generated_files")
os.makedirs(SESSIONS_DIR, exist_ok=True)
os.makedirs(FILES_DIR, exist_ok=True)

# Port configuration from environment (Pterodactyl or standalone VPS)
PORT = int(os.environ.get("SERVER_PORT", os.environ.get("PORT", "3008")))
HOST = "0.0.0.0"

# ==========================================
# AUTO CONFIGURATION: SYSTEM ENVIRONMENT
# ==========================================
class SystemEnvironment:
    _cached_ip = None

    @classmethod
    def get_public_ip(cls) -> str:
        if cls._cached_ip:
            return cls._cached_ip
        endpoints = ["https://api.ipify.org", "https://ifconfig.me/ip", "https://icanhazip.com"]
        for url in endpoints:
            try:
                req = urllib.request.Request(url, headers={"User-Agent": "curl/7.68.0"})
                with urllib.request.urlopen(req, timeout=3) as resp:
                    ip = resp.read().decode().strip()
                    if ip and len(ip.split(".")) == 4:
                        cls._cached_ip = ip
                        return ip
            except Exception:
                continue
        cls._cached_ip = "127.0.0.1"
        return cls._cached_ip

    @classmethod
    def detect(cls) -> dict:
        is_ptero = False
        reason = ""
        if os.environ.get("PTERODACTYL") == "1" or "SERVER_PORT" in os.environ:
            is_ptero = True
            reason = "Variable SERVER_PORT / PTERODACTYL terdeteksi"
        elif os.path.exists("/home/container") and (os.getcwd() == "/home/container" or BASE_DIR.startswith("/home/container")):
            is_ptero = True
            reason = "Path container /home/container (Pterodactyl Egg)"
        else:
            reason = "Standalone Linux Host (Native VPS)"

        env_name = "PTERODACTYL CONTAINER (Docker)" if is_ptero else "STANDALONE PURE VPS (Linux)"
        port = PORT
        public_ip = cls.get_public_ip()
        
        base_url_ip = f"http://{public_ip}:{port}/v1"
        base_url_domain = os.environ.get("BASE_URL_DOMAIN", base_url_ip)

        return {
            "is_ptero": is_ptero,
            "env_name": env_name,
            "reason": reason,
            "port": port,
            "public_ip": public_ip,
            "base_url_ip": base_url_ip,
            "base_url_domain": base_url_domain
        }


# ==========================================
# FILE GENERATION & INSTANT WEB PREVIEW
# ==========================================
class GeneratedFileManager:
    @staticmethod
    def get_mime(filename: str) -> str:
        ext = filename.split(".")[-1].lower()
        mimes = {
            "html": "text/html; charset=utf-8",
            "htm": "text/html; charset=utf-8",
            "js": "application/javascript; charset=utf-8",
            "css": "text/css; charset=utf-8",
            "json": "application/json; charset=utf-8",
            "py": "text/plain; charset=utf-8",
            "sh": "text/plain; charset=utf-8",
            "txt": "text/plain; charset=utf-8",
            "md": "text/markdown; charset=utf-8"
        }
        return mimes.get(ext, "application/octet-stream")

    @classmethod
    def save_code_files(cls, text: str, host_hdr: str = "") -> Tuple[str, List[Dict]]:
        pattern = r"```([a-zA-Z0-9_\-\+]*)\n(.*?)```"
        matches = list(re.finditer(pattern, text, re.DOTALL))

        # Normalisasi raw code tanpa wrapper markdown
        if not matches:
            trimmed = text.strip()
            for lang_prefix in ["python", "py", "javascript", "js", "html", "css", "bash", "sh", "json", "php"]:
                if trimmed.lower().startswith(f"{lang_prefix}\n") and not trimmed.startswith("```"):
                    actual_code = trimmed[len(lang_prefix)+1:].strip()
                    text = f"```{lang_prefix}\n{actual_code}\n```"
                    matches = list(re.finditer(pattern, text, re.DOTALL))
                    break
            else:
                if (trimmed.startswith("<!DOCTYPE") or trimmed.startswith("<html")) and not trimmed.startswith("```"):
                    text = f"```html\n{trimmed}\n```"
                    matches = list(re.finditer(pattern, text, re.DOTALL))

        if not matches:
            return text, []

        saved = []
        links_footer = []

        # Gunakan domain HTTPS publik agar link bisa langsung diklik dan dibuka dari HP
        base_url = "https://pt.zallpyx.xyz/muse"

        for idx, match in enumerate(matches):
            lang = match.group(1).lower().strip()
            code = match.group(2).strip()
            if not code or len(code) < 15:
                continue

            ext_map = {
                "html": ("index.html", "html"),
                "htm": ("index.html", "html"),
                "python": ("script.py", "py"),
                "py": ("script.py", "py"),
                "javascript": ("script.js", "js"),
                "js": ("script.js", "js"),
                "css": ("style.css", "css"),
                "json": ("data.json", "json"),
                "bash": ("run.sh", "sh"),
                "sh": ("run.sh", "sh")
            }
            fname, kind = ext_map.get(lang, (f"file_{idx+1}.txt", "txt"))
            file_id = secrets.token_hex(4)
            file_dir = os.path.join(FILES_DIR, file_id)
            os.makedirs(file_dir, exist_ok=True)
            file_path = os.path.join(file_dir, fname)

            try:
                with open(file_path, "w", encoding="utf-8") as f:
                    f.write(code)

                download_url = f"{base_url}/files/{file_id}/{fname}"
                view_url = f"{base_url}/view/{file_id}"

                saved.append({
                    "id": file_id,
                    "filename": fname,
                    "path": file_path,
                    "download_url": download_url,
                    "view_url": view_url,
                    "lang": lang
                })

                if kind == "html":
                    links_footer.append(f"📁 **File**: [{fname}]({download_url}) • 🌐 **Live Preview**: [Buka Website]({view_url})")
                else:
                    links_footer.append(f"📁 **File**: [{fname}]({download_url}) • 👁️ **Preview**: [Lihat Kode]({view_url})")
            except Exception:
                pass

        return text, saved


# ==========================================
# AUTO-DEBUGGING & SYNTAX HEALING ENGINE
# ==========================================
class CodeValidatorDebugger:
    @staticmethod
    def validate_code(text: str) -> Tuple[bool, str]:
        # 1. Cek markdown code block seimbang
        backtick_count = text.count("```")
        if backtick_count % 2 != 0:
            return False, "Output terpotong: blok kode markdown tidak tertutup."

        # 2. Cek apakah ada frasa evasif / janji tanpa kode
        evasions = [
            "kartunya di atas", "lagi dibikin", "file html-nya lagi dibikin",
            "saya buatkan dulu", "bisa download di atas", "cek kartu di atas"
        ]
        if any(e in text.lower() for e in evasions) and len(text) < 350:
            return False, "Respon hanya berupa janji/kartu tanpa kode nyata."

        # 3. Validasi sintaks tiap bahasa
        pattern = r"```([a-zA-Z0-9_\-\+]*)\n(.*?)```"
        matches = re.findall(pattern, text, re.DOTALL)
        for lang, code in matches:
            lang = lang.lower().strip()
            code = code.strip()
            if lang in ("python", "py"):
                try:
                    ast.parse(code)
                except SyntaxError as e:
                    return False, f"Python SyntaxError di baris {e.lineno}: {e.msg}"
            elif lang in ("json",):
                try:
                    json.loads(code)
                except json.JSONDecodeError as e:
                    return False, f"JSON SyntaxError: {e.msg}"
            elif lang in ("html", "htm"):
                for tag in ["html", "body"]:
                    if f"<{tag}" in code.lower() and f"</{tag}>" not in code.lower():
                        return False, f"HTML terpotong: tag <{tag}> belum ditutup."

        return True, "OK"


# ==========================================
# CONFIG & PERSISTENT API KEY (TEXT DB)
# ==========================================
def load_config() -> dict:
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r") as f:
                return json.load(f)
        except Exception:
            pass
    return {}

def save_config(cfg: dict):
    with open(CONFIG_FILE, "w") as f:
        json.dump(cfg, f, indent=2)

def init_api_key() -> str:
    env_k = os.environ.get("BRIDGE_API_KEY", "").strip()
    if env_k:
        return env_k
    cfg = load_config()
    k = cfg.get("api_key", "").strip()
    if not k:
        k = "«redacted:sk-…»"
        cfg["api_key"] = k
        save_config(cfg)
    return k

API_KEY = init_api_key()


class ApiKeyManager:
    @classmethod
    def load_keys(cls) -> List[Dict[str, str]]:
        keys = []
        if not os.path.exists(API_KEYS_DB_FILE):
            if API_KEY:
                keys.append({"key": API_KEY, "label": "default-ptero", "created": "2026-09-24"})
                cls.save_keys(keys)
            return keys

        try:
            with open(API_KEYS_DB_FILE, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line or line.startswith("#"):
                        continue
                    parts = [p.strip() for p in line.split("|")]
                    key = parts[0]
                    label = parts[1] if len(parts) > 1 else "client"
                    created = parts[2] if len(parts) > 2 else "-"
                    keys.append({"key": key, "label": label, "created": created})
        except Exception:
            pass

        if API_KEY and not any(k["key"] == API_KEY for k in keys):
            keys.insert(0, {"key": API_KEY, "label": "default-ptero", "created": "2026-09-24"})
            cls.save_keys(keys)

        return keys

    @classmethod
    def save_keys(cls, keys: List[Dict[str, str]]):
        try:
            with open(API_KEYS_DB_FILE, "w", encoding="utf-8") as f:
                f.write("# ==========================================\n")
                f.write("# MUSE.AI BRIDGE API KEYS DATABASE (TEXT DB)\n")
                f.write("# Format: KEY | LABEL | CREATED_AT\n")
                f.write("# ==========================================\n")
                for k in keys:
                    f.write(f"{k['key']} | {k.get('label', 'client')} | {k.get('created', '-')}\n")
        except Exception as e:
            console.print(f"[red]Gagal menulis api_keys.txt: {e}[/red]")

    @classmethod
    def generate_key(cls, label: str = "client") -> Dict[str, str]:
        new_key = f"sk-muse-{secrets.token_hex(16)}"
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        entry = {"key": new_key, "label": label, "created": now_str}
        keys = cls.load_keys()
        keys.append(entry)
        cls.save_keys(keys)
        return entry

    @classmethod
    def delete_key(cls, target: str) -> bool:
        keys = cls.load_keys()
        new_keys = []
        deleted = False
        target_clean = target.strip().lower()
        for idx, k in enumerate(keys, 1):
            k_key = k["key"].lower()
            k_label = k.get("label", "").lower()
            if str(idx) == target_clean or k_key == target_clean or k_key.startswith(target_clean) or k_label == target_clean:
                deleted = True
            else:
                new_keys.append(k)
        if deleted:
            cls.save_keys(new_keys)
        return deleted

    @classmethod
    def is_valid(cls, token: str) -> bool:
        if not token:
            return False
        if API_KEY and token == API_KEY:
            return True
        for k in cls.load_keys():
            if k["key"] == token:
                return True
        if not cls.load_keys() and token.startswith("sk-"):
            return True
        return False


from playwright.async_api import async_playwright, Browser, BrowserContext, Page


class AccountRegistry:
    @staticmethod
    def load_accounts() -> List[Dict]:
        if os.path.exists(REGISTRY_FILE):
            try:
                with open(REGISTRY_FILE, "r") as f:
                    return json.load(f)
            except Exception:
                pass
        return []

    @classmethod
    def list_accounts(cls) -> List[Dict]:
        accs = cls.load_accounts()
        found_files = glob.glob(os.path.join(SESSIONS_DIR, "*.json"))
        active_names = {os.path.splitext(os.path.basename(f))[0] for f in found_files}

        res = []
        for a in accs:
            a["has_session"] = a["name"] in active_names
            res.append(a)

        registered_names = {a["name"] for a in accs}
        for name in active_names:
            if name not in registered_names:
                res.append({"name": name, "email": name, "has_session": True})
        return res

    @classmethod
    def add_or_update(cls, name: str, email: str):
        accs = cls.load_accounts()
        accs = [a for a in accs if a["name"] != name]
        accs.append({"name": name, "email": email, "added_at": int(time.time())})
        with open(REGISTRY_FILE, "w") as f:
            json.dump(accs, f, indent=2)

    @classmethod
    def increment_req(cls, name: str) -> int:
        accs = cls.load_accounts()
        found = False
        new_val = 1
        for a in accs:
            if a.get("name") == name:
                a["requests_handled"] = a.get("requests_handled", 0) + 1
                new_val = a["requests_handled"]
                found = True
                break
        if not found:
            accs.append({"name": name, "email": name, "requests_handled": 1, "added_at": int(time.time())})
        try:
            with open(REGISTRY_FILE, "w") as f:
                json.dump(accs, f, indent=2)
        except Exception:
            pass
        return new_val

    @classmethod
    def get_req(cls, name: str) -> int:
        accs = cls.load_accounts()
        for a in accs:
            if a.get("name") == name:
                return a.get("requests_handled", 0)
        return 0

    @classmethod
    def remove(cls, name: str):
        accs = cls.load_accounts()
        accs = [a for a in accs if a["name"] != name]
        with open(REGISTRY_FILE, "w") as f:
            json.dump(accs, f, indent=2)
        target = os.path.join(SESSIONS_DIR, f"{name}.json")
        if os.path.exists(target):
            try:
                os.remove(target)
            except Exception:
                pass


class AccountSession:
    def __init__(self, name: str, session_path: str):
        self.name = name
        self.session_path = session_path
        self.context: Optional[BrowserContext] = None
        self.page: Optional[Page] = None
        self.status: str = "INITIALIZING"
        self.requests_handled: int = AccountRegistry.get_req(name)
        self.is_busy: bool = False
        self.current_client_id: Optional[str] = None
        self.chat_bubbles_count: int = 0
        self.lock = asyncio.Lock()


class MuseServerApp:
    def __init__(self):
        self.sessions: Dict[str, AccountSession] = {}
        self.playwright = None
        self.browser: Optional[Browser] = None
        self.round_robin_index = 0
        self.total_requests = 0
        self.start_time = time.time()
        self.is_running = True
        self.recent_logs: List[str] = []

    def log(self, text: str):
        timestamp = time.strftime("%H:%M:%S")
        entry = f"[{timestamp}] {text}"
        self.recent_logs.append(entry)
        if len(self.recent_logs) > 30:
            self.recent_logs.pop(0)
        # Cetak real-time ke console stdout agar langsung muncul di web console Pterodactyl / Docker
        print(f"\033[1;36m{entry}\033[0m", flush=True)

    async def init_engine(self):
        self.log(f"Memulai Chromium Playwright Engine...")
        self.playwright = await async_playwright().start()

        launch_kwargs = {
            "headless": True,
            "args": [
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-blink-features=AutomationControlled",
                "--disable-dev-shm-usage",
                "--disable-gpu",
                "--disable-features=WebGL,WebGL2",
                "--disable-software-rasterizer",
                "--mute-audio"
            ]
        }
        if os.path.exists("/usr/bin/chromium"):
            launch_kwargs["executable_path"] = "/usr/bin/chromium"

        self.browser = await self.playwright.chromium.launch(**launch_kwargs)
        await self.reload_sessions()

    @staticmethod
    async def _setup_route_filter(page: Page):
        async def route_filter(route):
            url = route.request.url.lower()
            if any(ad in url for ad in ["google", "doubleclick", "tiktok", "snapchat", "analytics", "pixel", "facebook.net"]) and "muse.ai" not in url:
                return await route.abort()
            if route.request.resource_type in ["image", "media", "font"]:
                return await route.abort()
            return await route.continue_()
        try:
            await page.route("**/*", route_filter)
        except Exception:
            pass

    async def reload_sessions(self):
        session_files = glob.glob(os.path.join(SESSIONS_DIR, "*.json"))
        if not session_files:
            self.log("Belum ada file sesi akun di folder 'sessions/'.")
            return

        for sf in session_files:
            name = os.path.splitext(os.path.basename(sf))[0]
            if name in self.sessions:
                old_acc = self.sessions[name]
                if old_acc.status == "READY":
                    continue
                if old_acc.context:
                    try:
                        await old_acc.context.close()
                    except Exception:
                        pass

            acc = AccountSession(name=name, session_path=sf)
            try:
                self.log(f"Memuat sesi akun '{name}'...")
                acc.context = await self.browser.new_context(
                    storage_state=sf,
                    user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
                    ignore_https_errors=True
                )
                acc.page = await acc.context.new_page()
                await self._setup_route_filter(acc.page)
                await acc.page.goto("https://muse.ai", wait_until="domcontentloaded", timeout=25000)
                await asyncio.sleep(2)

                is_logged_in = await acc.page.evaluate('''() => {
                    const text = document.body ? document.body.innerText : '';
                    if (text.includes('Log in or create an account') || text.includes('Enter your code')) {
                        return false;
                    }
                    return !!document.querySelector('textarea, div[contenteditable="true"], [data-role="chat-input"]');
                }''')

                if not is_logged_in:
                    acc.status = "LOGIN_REQUIRED"
                    self.log(f"❌ Akun '{name}' belum login / sesi expired.")
                    if acc.context:
                        await acc.context.close()
                        acc.context = None
                        acc.page = None
                else:
                    acc.status = "READY"
                    self.log(f"✅ Akun '{name}' SIAP MELAYANI REQUEST!")

                self.sessions[name] = acc
            except Exception as e:
                acc.status = f"ERROR"
                self.log(f"⚠️ Gagal memuat akun '{name}': {str(e)[:40]}")
                if acc.context:
                    try:
                        await acc.context.close()
                    except Exception:
                        pass
                    acc.context = None
                    acc.page = None
                self.sessions[name] = acc

    def has_ready_account(self) -> bool:
        return any(acc.status == "READY" for acc in self.sessions.values())

    def get_available_account(self) -> Optional[AccountSession]:
        ready_accounts = [acc for acc in self.sessions.values() if acc.status == "READY"]
        if not ready_accounts:
            return None
        idle_accounts = [acc for acc in ready_accounts if not acc.is_busy]
        if idle_accounts:
            self.round_robin_index = (self.round_robin_index + 1) % len(idle_accounts)
            return idle_accounts[self.round_robin_index]
        return min(ready_accounts, key=lambda a: a.requests_handled)

    async def execute_chat(self, prompt: str, model_id: str = "muse-spark-1.3", client_id: str = "default", on_delta: Optional[Callable[[str], None]] = None, is_new_chat: bool = True) -> str:
        acc = self.get_available_account()
        if not acc:
            raise Exception("Tidak ada akun Muse.ai yang READY di pool! Silakan login akun via Menu [2].")

        async with acc.lock:
            acc.is_busy = True
            acc.requests_handled = AccountRegistry.increment_req(acc.name)
            self.total_requests += 1

            # Periksa apakah tab masih hidup (bukan cuma is_closed)
            is_alive = False
            if acc.page and not acc.page.is_closed():
                try:
                    await asyncio.wait_for(acc.page.evaluate("1 + 1"), timeout=3)
                    is_alive = True
                except Exception:
                    is_alive = False

            if not is_alive:
                self.log(f"🔄 Menghidupkan ulang tab akun '{acc.name}'...")
                try:
                    if acc.page:
                        await acc.page.close()
                except Exception:
                    pass
                if not acc.context:
                    acc.context = await self.browser.new_context(
                        storage_state=acc.session_path,
                        user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
                        ignore_https_errors=True
                    )
                acc.page = await acc.context.new_page()
                await self._setup_route_filter(acc.page)
                await acc.page.goto("https://muse.ai/thread/new", wait_until="domcontentloaded", timeout=25000)
                acc.current_client_id = client_id
                acc.chat_bubbles_count = 0
            else:
                needs_reset = is_new_chat or (acc.current_client_id is not None and acc.current_client_id != client_id) or acc.chat_bubbles_count >= 1
                if needs_reset:
                    try:
                        self.log(f"⚡ Fast-reset thread (/thread/new) via SPA [{client_id}]...")
                        reset_ok = await acc.page.evaluate('''() => {
                            try {
                                const a = document.createElement("a");
                                a.href = "/thread/new";
                                document.body.appendChild(a);
                                a.click();
                                a.remove();
                                return true;
                            } catch (e) {
                                return false;
                            }
                        }''')
                        await asyncio.sleep(0.4)
                        if not reset_ok or "thread/new" not in acc.page.url:
                            await acc.page.goto("https://muse.ai/thread/new", wait_until="domcontentloaded", timeout=12000)
                    except Exception as e:
                        self.log(f"⚠️ Fast-reset fallback goto: {e}")
                        try:
                            await acc.page.goto("https://muse.ai/thread/new", wait_until="domcontentloaded", timeout=12000)
                        except Exception:
                            pass
                    acc.chat_bubbles_count = 0

                acc.current_client_id = client_id

            acc.chat_bubbles_count += 1
            page = acc.page

            try:
                input_selector = 'textarea[aria-label="Message"], textarea, div[contenteditable="true"]'
                target_input = await page.wait_for_selector(input_selector, timeout=10000)

                self.log(f"🚀 [{acc.name}] Mengirim input ke webchat ({len(prompt)} chars)...")

                # Catat teks dan jumlah prose sebelum prompt baru dikirim
                old_last_text = await page.evaluate(r'''() => {
                    const p = document.querySelectorAll('.prose');
                    return p.length ? (p[p.length - 1].innerText || '').trim() : '';
                }''')
                old_prose_count = await page.evaluate(r'''() => document.querySelectorAll('.prose').length''')

                await target_input.fill(prompt)
                await asyncio.sleep(0.15)

                send_btn = await page.query_selector('button[aria-label="Send"], button[type="submit"]')
                if send_btn and await send_btn.is_visible():
                    try:
                        await send_btn.click()
                    except Exception:
                        await target_input.press("Enter")
                else:
                    await target_input.press("Enter")

                # Tunggu hingga input terkirim (textarea kosong atau send button menghilang/reaktif)
                for _ in range(25):
                    await asyncio.sleep(0.1)
                    val = await target_input.input_value()
                    if not val.strip():
                        break
                else:
                    await target_input.press("Enter")
                    await asyncio.sleep(0.2)

                response_text = ""
                stable_count = 0

                js_extractor = r'''(minProseCount) => {
                    if (!document.getElementById("hermes-fix-style")) {
                        const s = document.createElement("style");
                        s.id = "hermes-fix-style";
                        s.textContent = "* { content-visibility: visible !important; }";
                        document.head.appendChild(s);
                    }

                    const thread = document.querySelector(".max-w-3xl.flex.flex-col") || document.querySelector("main");
                    if (!thread) return { text: "", isGenerating: false };

                    const stopBtn = document.querySelector('button[aria-label="Stop"], button[aria-label="Stop generating"], button[aria-label="Stop task"]');
                    const isGenerating = Boolean(stopBtn);

                    const allProses = Array.from(thread.querySelectorAll(".prose"));
                    if (allProses.length <= minProseCount) return { text: "", isGenerating: isGenerating };
                    const prose = allProses[allProses.length - 1];

                    function inlineToMd(node) {
                        if (!node) return "";
                        if (node.nodeType === 3) return node.textContent;
                        if (node.nodeType !== 1) return "";

                        const tag = node.tagName.toUpperCase();
                        const cls = typeof node.className === "string" ? node.className : "";
                        const children = Array.from(node.childNodes).map(inlineToMd).join("");

                        if (tag === "STRONG" || tag === "B" || cls.includes("font-bold") || cls.includes("font-semibold")) return `**${children}**`;
                        if (tag === "EM" || tag === "I" || cls.includes("italic")) return `*${children}*`;
                        if (tag === "CODE" || (cls.includes("font-mono") && !cls.includes("text-response"))) {
                            if (!node.closest("pre") && !node.closest('[data-streamdown="code-block"]')) return `\`${node.textContent}\``;
                        }
                        if (tag === "A") {
                            const href = node.getAttribute("href");
                            return href ? `[${children}](${href})` : children;
                        }
                        if (tag === "DEL" || tag === "S") return `~~${children}~~`;
                        if (tag === "BR") return "\n";
                        return children;
                    }

                    const parts = [];
                    const container = prose.querySelector(".flex.flex-col") || prose;
                    const blocks = Array.from(container.children);

                    if (!blocks.length) {
                        const t = inlineToMd(prose).trim();
                        if (t) parts.push(t);
                    } else {
                        for (let bIdx = 0; bIdx < blocks.length; bIdx++) {
                            const b = blocks[bIdx];
                            
                            let hasSubsequentBlockContent = false;
                            for (let nextB = bIdx + 1; nextB < blocks.length; nextB++) {
                                if ((blocks[nextB].textContent || "").trim().length > 0) {
                                    hasSubsequentBlockContent = true;
                                    break;
                                }
                            }

                            const isTail = !hasSubsequentBlockContent;
                            const codeBlock = b.getAttribute("data-streamdown") === "code-block" ? b : b.querySelector('[data-streamdown="code-block"]');
                            if (codeBlock) {
                                const lang = codeBlock.getAttribute("data-language") || "";
                                const codeEl = codeBlock.querySelector('[data-streamdown="code-block-body"] pre') ||
                                               codeBlock.querySelector("pre") ||
                                               codeBlock;
                                const code = codeEl ? (codeEl.innerText || codeEl.textContent || "") : "";
                                if (isTail) {
                                    parts.push("```" + lang + "\n" + code);
                                } else {
                                    parts.push("```" + lang + "\n" + code + "\n```");
                                }
                            } else if (/^H[1-6]$/i.test(b.tagName)) {
                                parts.push("# " + inlineToMd(b).trim());
                            } else if (b.tagName === "TABLE" || b.querySelector("table")) {
                                const table = b.tagName === "TABLE" ? b : b.querySelector("table");
                                const rows = Array.from(table.querySelectorAll("tr"));
                                if (rows.length) {
                                    const tableLines = [];
                                    let headerDone = false;
                                    for (let rIdx = 0; rIdx < rows.length; rIdx++) {
                                        const row = rows[rIdx];
                                        const cells = Array.from(row.querySelectorAll("th, td"));
                                        const cellTexts = cells.map(cell => inlineToMd(cell).trim().replace(/\|/g, "\\|"));
                                        tableLines.push(`| ${cellTexts.join(" | ")} |`);

                                        const hasTh = row.querySelector("th") !== null;
                                        if (!headerDone && (hasTh || rIdx === 0)) {
                                            const delim = cells.map(() => "---").join(" | ");
                                            tableLines.push(`| ${delim} |`);
                                            headerDone = true;
                                        }
                                    }
                                    parts.push(tableLines.join("\n"));
                                }
                            } else if (b.tagName === "BLOCKQUOTE") {
                                const lines = inlineToMd(b).trim().split("\n");
                                parts.push(lines.map(l => `> ${l}`).join("\n"));
                            } else if (b.tagName === "UL") {
                                const items = Array.from(b.children).filter(el => el.tagName === "LI").map(li => "- " + inlineToMd(li).trim());
                                parts.push(items.join("\n"));
                            } else if (b.tagName === "OL") {
                                const items = Array.from(b.children).filter(el => el.tagName === "LI").map((li, idx) => `${idx + 1}. ` + inlineToMd(li).trim());
                                parts.push(items.join("\n"));
                            } else {
                                const t = inlineToMd(b).trim();
                                if (t) parts.push(t);
                            }
                        }
                    }

                    // Cek jika ada sandbox file card di container yang sama dan prose belum punya kode
                    const hasProseCode = parts.some(p => p.startsWith("```"));
                    if (!hasProseCode) {
                        const assistantContainer = prose.closest(".flex.flex-col.gap-2") || prose.parentElement;
                        if (assistantContainer) {
                            const card = assistantContainer.querySelector('[data-pel-impression="sandbox_file_card_impression"]');
                            if (card) {
                                const fontMono = card.querySelector("span.font-mono") || card.querySelector(".font-mono") || card.querySelector("pre");
                                if (fontMono) {
                                    const fnEl = card.querySelector(".text-subheadline-emphasized") || card.querySelector('[class*="truncate"]');
                                    const fn = fnEl ? (fnEl.textContent || "").trim() : "";
                                    const code = fontMono.innerText || fontMono.textContent || "";
                                    let lang = "bash";
                                    if (fn.endsWith(".py") || code.startsWith("def ") || code.startsWith("import ")) lang = "python";
                                    else if (fn.endsWith(".js") || fn.endsWith(".ts")) lang = "javascript";
                                    else if (fn.endsWith(".html") || code.startsWith("<!DOCTYPE") || code.startsWith("<html")) lang = "html";
                                    else if (fn.endsWith(".sh") || code.startsWith("#!/")) lang = "bash";

                                    if (isGenerating) {
                                        parts.push("```" + lang + "\n" + code);
                                    } else {
                                        parts.push("```" + lang + "\n" + code + "\n```");
                                    }
                                }
                            }
                        }
                    }

                    const cleanParts = [];
                    for (let p of parts) {
                        let trimmed = p.trim();
                        if (!trimmed) continue;
                        trimmed = trimmed.replace(/\*\*([^*]+)\*\*\s*([a-zA-Z0-9_\-\s]+):\*\*/g, "**$1 $2:**");
                        trimmed = trimmed.replace(/\*\*\s*\*\*/g, "");
                        cleanParts.push(trimmed);
                    }

                    return { text: cleanParts.join("\n\n"), isGenerating };
                }'''

                previous_text = ""
                for tick in range(600):  # Keep the 60-second generation window.
                    await asyncio.sleep(0.1)
                    res = await page.evaluate(js_extractor, old_prose_count)
                    current_text = res.get("text", "")
                    is_gen = res.get("isGenerating", False)


                    # Selesai jika tidak sedang generate (Stop button hilang), teks sudah ada, dan stabil
                    if not is_gen and current_text.strip() and current_text == previous_text:
                        stable_count += 1
                        if stable_count >= 20:  # DOM pauses inside code blocks are not completion.
                            response_text = current_text.strip()
                            break
                    else:
                        stable_count = 0
                    previous_text = current_text

                if not response_text:
                    raise TimeoutError("Muse response did not finish within 60 seconds.")
                if response_text.count("```") % 2:
                    response_text += "\n```"

                # ponytail: DOM snapshots are revisable; emit final text once. Token streaming needs an append-only upstream API.
                if on_delta:
                    on_delta(response_text)



                self.log(f"✅ [{acc.name}] Selesai! ({len(response_text)} chars) • Total req: {acc.requests_handled}")
                return response_text
            except Exception as e:
                self.log(f"❌ Error chat pada [{acc.name}]: {e}")
                raise e
            finally:
                acc.is_busy = False

    async def cleanup(self):
        if self.browser:
            await self.browser.close()
        if self.playwright:
            await self.playwright.stop()
        self.is_running = False


app_instance = MuseServerApp()
loop = asyncio.new_event_loop()


# ==========================================
# HTTP REQUEST HANDLER (OpenAI COMPATIBLE)
# ==========================================
class RequestHandler(BaseHTTPRequestHandler):
    def _send_json(self, status: int, data: dict):
        body = json.dumps(data, ensure_ascii=False, indent=2).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.end_headers()

    def log_message(self, format, *args):
        # Cetak log HTTP request ringkas, saring health check berulang
        msg = format % args
        if any(h in msg for h in ["/health", "GET / "]):
            return
        timestamp = time.strftime("%H:%M:%S")
        print(f"\033[90m[{timestamp}] 🌐 HTTP: {msg}\033[0m", flush=True)

    def _check_auth(self) -> bool:
        auth_header = (self.headers.get("authorization") or self.headers.get("Authorization") or "").strip()
        token = ""
        if auth_header.lower().startswith("bearer "):
            token = auth_header[7:].strip()
        elif self.headers.get("x-api-key"):
            token = self.headers.get("x-api-key", "").strip()

        return ApiKeyManager.is_valid(token)

    def do_HEAD(self):
        parsed = urlparse(self.path)
        path = parsed.path
        if path.startswith("/files/"):
            parts = [p for p in path.split("/") if p]
            if len(parts) >= 3:
                fpath = os.path.join(FILES_DIR, parts[1], parts[2])
                if os.path.exists(fpath) and os.path.isfile(fpath):
                    mime = GeneratedFileManager.get_mime(parts[2])
                    self.send_response(200)
                    self.send_header("Content-Type", mime)
                    self.send_header("Content-Length", str(os.path.getsize(fpath)))
                    self.send_header("Access-Control-Allow-Origin", "*")
                    self.end_headers()
                    return
        elif path.startswith("/view/"):
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            return
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path in ("/", "/health"):
            sessions_info = {
                name: {"status": acc.status, "requests": acc.requests_handled, "is_busy": acc.is_busy, "client": acc.current_client_id, "bubbles": acc.chat_bubbles_count}
                for name, acc in app_instance.sessions.items()
            }
            self._send_json(200, {
                "status": "online",
                "service": "Muse.ai Bridge for 9Router",
                "uptime_seconds": int(time.time() - app_instance.start_time),
                "total_requests": app_instance.total_requests,
                "api_key_configured": bool(API_KEY),
                "connection": "direct",
                "sessions": sessions_info
            })
        elif path == "/debug/dom":
            acc = app_instance.sessions.get("julian")
            if not acc or not acc.page:
                self._send_json(500, {"error": "no julian page"})
                return
            try:
                fut = asyncio.run_coroutine_threadsafe(
                    acc.page.evaluate(r'''() => {
                        const thread = document.querySelector(".max-w-3xl.flex.flex-col") || document.querySelector("main");
                        if (!thread) return { error: "no thread" };
                        const children = Array.from(thread.children);
                        return children.slice(-6).map((c, i) => ({
                            i: children.length - 6 + i,
                            tag: c.tagName,
                            hasProse: !!c.querySelector(".prose") || (c.classList && c.classList.contains("prose")),
                            textStart: (c.innerText || "").substring(0, 50)
                        }));
                    }'''),
                    loop
                )
                data = fut.result(timeout=5)
                self._send_json(200, data)
            except Exception as e:
                self._send_json(500, {"error": str(e)})
            return
        elif path == "/v1/models":
            self._send_json(200, {
                "object": "list",
                "data": [
                    {"id": "muse-spark-1.3", "object": "model", "created": 1727136000, "owned_by": "meta"},
                    {"id": "muse-spark-1.3-contributor", "object": "model", "created": 1727136000, "owned_by": "meta"},
                    {"id": "muse-spark-1.2", "object": "model", "created": 1727136000, "owned_by": "meta"},
                    {"id": "muse-spark-1.2-contributor", "object": "model", "created": 1727136000, "owned_by": "meta"},
                    {"id": "muse-image-1.0", "object": "model", "created": 1727136000, "owned_by": "meta"},
                    {"id": "muse-voice-transcribe-1.0", "object": "model", "created": 1727136000, "owned_by": "meta"},
                    {"id": "muse-spark", "object": "model", "created": 1727136000, "owned_by": "meta"},
                    {"id": "muse", "object": "model", "created": 1727136000, "owned_by": "meta"}
                ]
            })

        elif path.startswith("/files/"):
            # Format: /files/<file_id>/<filename>
            parts = [p for p in path.split("/") if p]
            if len(parts) >= 3:
                file_id = parts[1]
                filename = parts[2]
                fpath = os.path.join(FILES_DIR, file_id, filename)
                if os.path.exists(fpath) and os.path.isfile(fpath):
                    try:
                        with open(fpath, "rb") as f:
                            content = f.read()
                        mime = GeneratedFileManager.get_mime(filename)
                        self.send_response(200)
                        self.send_header("Content-Type", mime)
                        self.send_header("Content-Length", str(len(content)))
                        self.send_header("Access-Control-Allow-Origin", "*")
                        self.end_headers()
                        self.wfile.write(content)
                        return
                    except Exception as e:
                        self._send_json(500, {"error": str(e)})
                        return
            self._send_json(404, {"error": "File not found"})

        elif path.startswith("/view/"):
            # Format: /view/<file_id>
            parts = [p for p in path.split("/") if p]
            if len(parts) >= 2:
                file_id = parts[1]
                fdir = os.path.join(FILES_DIR, file_id)
                if os.path.exists(fdir) and os.path.isdir(fdir):
                    files = os.listdir(fdir)
                    if files:
                        fname = files[0]
                        fpath = os.path.join(fdir, fname)
                        try:
                            with open(fpath, "r", encoding="utf-8", errors="replace") as f:
                                code_content = f.read()
                            if fname.endswith((".html", ".htm")):
                                self.send_response(200)
                                self.send_header("Content-Type", "text/html; charset=utf-8")
                                self.send_header("Access-Control-Allow-Origin", "*")
                                self.end_headers()
                                self.wfile.write(code_content.encode("utf-8"))
                                return
                            else:
                                escaped_code = html.escape(code_content)
                                viewer_html = f'''<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>{fname} - Muse Preview</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
body {{ margin:0; background:#0f172a; color:#f8fafc; font-family:system-ui,sans-serif; padding:20px; }}
.header {{ display:flex; justify-content:space-between; align-items:center; margin-bottom:15px; border-bottom:1px solid #334155; padding-bottom:10px; }}
pre {{ background:#1e293b; padding:16px; border-radius:8px; overflow-x:auto; font-family:monospace; line-height:1.5; font-size:14px; }}
a.btn {{ background:#38bdf8; color:#0f172a; padding:6px 14px; text-decoration:none; border-radius:6px; font-weight:bold; }}
</style></head>
<body>
<div class="header">
  <h2>📄 {fname}</h2>
  <a class="btn" href="/files/{file_id}/{fname}" download>⬇️ Download File</a>
</div>
<pre><code>{escaped_code}</code></pre>
</body></html>'''
                                self.send_response(200)
                                self.send_header("Content-Type", "text/html; charset=utf-8")
                                self.send_header("Access-Control-Allow-Origin", "*")
                                self.end_headers()
                                self.wfile.write(viewer_html.encode("utf-8"))
                                return
                        except Exception as e:
                            self._send_json(500, {"error": str(e)})
                            return
            self._send_json(404, {"error": "Preview not found"})

        else:
            self._send_json(404, {"error": "Not Found"})

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path

        content_length = int(self.headers.get("Content-Length", 0))
        post_data = self.rfile.read(content_length)

        if path == "/v1/chat/completions":
            if not self._check_auth():
                self._send_json(401, {
                    "error": {
                        "message": "Incorrect API key provided.",
                        "type": "invalid_request_error",
                        "param": None,
                        "code": "invalid_api_key"
                    }
                })
                return

            try:
                payload = json.loads(post_data.decode("utf-8"))
            except Exception:
                self._send_json(400, {
                    "error": {
                        "message": "Invalid JSON body",
                        "type": "invalid_request_error",
                        "code": "bad_request"
                    }
                })
                return

            try:
                prompt, tool_context = prepare(payload)
            except ValueError as error:
                self._send_json(400, {"error": {"message": str(error), "type": "invalid_request_error", "code": "invalid_tool_request"}})
                return
            model = payload.get("model", "muse-spark-1.3")
            stream = payload.get("stream", False)

            client_ip = (self.headers.get("x-forwarded-for") or self.headers.get("x-real-ip") or self.client_address[0]).split(",")[0].strip()
            session_hdr = self.headers.get("x-session-id") or self.headers.get("session-id")
            client_id = session_hdr if session_hdr else client_ip

            app_instance.log(f"📩 Chat request ({model}) [{client_id}]: {prompt[:70].replace(chr(10), ' ')}...")

            if not app_instance.has_ready_account():
                self._send_json(503, {
                    "error": {
                        "message": "Belum ada akun Muse yang aktif / login. Buka Web Console Pterodactyl dan pilih menu [2] untuk login OTP.",
                        "type": "service_unavailable",
                        "code": "muse_account_not_ready"
                    }
                })
                return

            resp_id = f"chatcmpl-muse-{int(time.time()*1000)}"

            if stream:
                try:
                    self.send_response(200)
                    self.send_header("Content-Type", "text/event-stream; charset=utf-8")
                    self.send_header("Cache-Control", "no-cache")
                    self.send_header("X-Accel-Buffering", "no")
                    self.send_header("Connection", "close")
                    self.send_header("Access-Control-Allow-Origin", "*")
                    self.end_headers()

                    future = asyncio.run_coroutine_threadsafe(
                        app_instance.execute_chat(prompt, model_id=model, client_id=client_id, is_new_chat=True), loop
                    )
                    response_text = future.result(timeout=80)
                    message = decode(response_text, tool_context)
                    delta = dict(message)
                    if "tool_calls" in delta:
                        delta["tool_calls"] = [dict(call, index=index) for index, call in enumerate(delta["tool_calls"])]
                    chunk = {"id": resp_id, "object": "chat.completion.chunk", "created": int(time.time()), "model": model,
                             "choices": [{"index": 0, "delta": delta, "finish_reason": None}]}
                    self.wfile.write(f"data: {json.dumps(chunk, ensure_ascii=False)}\n\n".encode("utf-8"))
                    self.wfile.flush()

                    final_chunk = {
                        "id": resp_id,
                        "object": "chat.completion.chunk",
                        "created": int(time.time()),
                        "model": model,
                        "choices": [{
                            "index": 0,
                            "delta": {},
                            "finish_reason": finish_reason(message)
                        }]
                    }
                    self.wfile.write(f"data: {json.dumps(final_chunk, ensure_ascii=False)}\n\ndata: [DONE]\n\n".encode("utf-8"))
                    self.wfile.flush()
                    self.close_connection = True
                except (BrokenPipeError, ConnectionResetError):
                    pass
                except Exception as e:
                    if 'future' in locals() and not future.done():
                        future.cancel()
                    try:
                        err_chunk = {"error": f"Streaming error: {str(e) or type(e).__name__}"}
                        self.wfile.write(f"data: {json.dumps(err_chunk)}\n\ndata: [DONE]\n\n".encode("utf-8"))
                        self.wfile.flush()
                        self.close_connection = True
                    except Exception:
                        pass
            else:
                try:
                    future = asyncio.run_coroutine_threadsafe(
                        app_instance.execute_chat(prompt, model_id=model, client_id=client_id, is_new_chat=True),
                        loop
                    )
                    response_text = future.result(timeout=80)

                    message = decode(response_text, tool_context)

                    p_tokens = max(1, int(len(prompt) / 3.8))
                    c_tokens = max(1, int(len(response_text) / 3.8))

                    self._send_json(200, {
                        "id": resp_id,
                        "object": "chat.completion",
                        "created": int(time.time()),
                        "model": model,
                        "choices": [{
                            "index": 0,
                            "message": message,
                            "finish_reason": finish_reason(message)
                        }],
                        "usage": {
                            "prompt_tokens": p_tokens,
                            "completion_tokens": c_tokens,
                            "total_tokens": p_tokens + c_tokens
                        }
                    })
                except (BrokenPipeError, ConnectionResetError):
                    pass
                except Exception as e:
                    if 'future' in locals() and not future.done():
                        future.cancel()
                    self._send_json(504 if isinstance(e, TimeoutError) else 500, {"error": f"Bridge execution failed: {str(e) or type(e).__name__}"})

        elif path == "/api/sessions/import":
            try:
                payload = json.loads(post_data.decode("utf-8"))
                name = payload.get("name", f"acc_{int(time.time())}")
                storage_state = payload.get("storage_state")
                if not storage_state:
                    self._send_json(400, {"error": "Missing storage_state field"})
                    return

                target_file = os.path.join(SESSIONS_DIR, f"{name}.json")
                with open(target_file, "w") as f:
                    json.dump(storage_state, f, indent=2)

                AccountRegistry.add_or_update(name=name, email=name)
                asyncio.run_coroutine_threadsafe(app_instance.reload_sessions(), loop)
                self._send_json(200, {"success": True, "message": f"Sesi [{name}] berhasil dimuat!"})
            except Exception as e:
                self._send_json(400, {"error": str(e)})

        else:
            self._send_json(404, {"error": "Endpoint not found"})


def run_http_server():
    server = ThreadingHTTPServer((HOST, PORT), RequestHandler)
    server.daemon_threads = True
    try:
        server.serve_forever()
    except Exception:
        pass


# ==========================================
# ROBUST STEP-BY-STEP OTP LOGIN (MAIN THREAD)
# ==========================================
def clear_screen():
    print("\033[H\033[2J\033[3J", end="", flush=True)
    try:
        console.clear()
    except Exception:
        pass


def do_interactive_login():
    clear_screen()
    console.print("\n[bold cyan]=== [2] TAMBAH / LOGIN AKUN BARU ===[/bold cyan]")
    name = Prompt.ask("👉 Masukkan ID Akun (misal: acc1, carry, main)").strip()
    if not name:
        return

    identifier = Prompt.ask("👉 Masukkan Email / No HP akun muse.ai").strip()
    if not identifier:
        return

    console.print(f"[cyan]🚀 Menyiapkan browser untuk akun [{name}]...[/cyan]")

    # Run browser session inside the existing app_instance browser
    async def request_otp():
        # Create fresh context
        context = await app_instance.browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
            ignore_https_errors=True
        )
        page = await context.new_page()
        await app_instance._setup_route_filter(page)

        console.print("[cyan]🌐 Membuka https://muse.ai...[/cyan]")
        await page.goto("https://muse.ai", wait_until="networkidle", timeout=30000)

        # Cari input di landing page muse.ai
        console.print(f"[cyan]✍️ Mengisi identifier: {identifier}...[/cyan]")
        inp = await page.wait_for_selector('input', timeout=15000)
        await inp.fill(identifier)
        await asyncio.sleep(0.5)

        # Klik tombol Continue (type="submit")
        console.print("[cyan]🖱️ Mengirim permintaan OTP ke muse.ai...[/cyan]")
        submit_btn = await page.wait_for_selector('button[type="submit"]', timeout=10000)
        await submit_btn.click()

        # Tunggu sampai halaman berpindah ke layar OTP
        console.print("[yellow]⏳ Menunggu respon pengiriman OTP dari muse.ai...[/yellow]")
        otp_screen = False
        for _ in range(20):  # poll up to 10 seconds
            await asyncio.sleep(0.5)
            body = await page.evaluate("() => document.body ? document.body.innerText : ''")
            if 'enter your code' in body.lower() or 'code we sent to' in body.lower():
                otp_screen = True
                break

        if not otp_screen:
            err_msg = await page.evaluate('''() => {
                const el = document.querySelector('[class*="error"], [role="alert"], [class*="helper"]');
                return el ? el.innerText : '';
            }''')
            if err_msg:
                raise Exception(f"Pesan dari muse.ai: {err_msg}")
            raise Exception("Layar OTP tidak muncul setelah submit. Silakan coba beberapa saat lagi.")

        return context, page

    try:
        future_req = asyncio.run_coroutine_threadsafe(request_otp(), loop)
        context, page = future_req.result(timeout=40)
    except Exception as e:
        console.print(f"[red]❌ Gagal mengirim OTP: {e}[/red]")
        return

    console.print(f"[bold green]📬 KODE OTP TELAH DIKIRIM KE {identifier}![/bold green]")
    otp_code = Prompt.ask("👉 [bold green]Masukkan 6-Digit Kode OTP dari Email/SMS[/bold green]").strip()

    if not otp_code:
        console.print("[yellow]Batal: OTP kosong.[/yellow]")
        asyncio.run_coroutine_threadsafe(context.close(), loop)
        return

    async def submit_otp_and_save():
        console.print("[cyan]Mengirim kode verifikasi email...[/cyan]")
        otp_inp = await page.wait_for_selector('input', timeout=10000)
        await otp_inp.fill(otp_code)
        
        # Meta Muse langsung auto-submit & navigasi begitu digit ke-6 diketik
        # Jangan crash kalau tombol submit sudah detached karena halaman sedang pindah
        try:
            next_btn = await page.query_selector('button[type="submit"]')
            if next_btn:
                await next_btn.click(timeout=1500)
        except Exception:
            pass

        console.print("[cyan]⏳ Memverifikasi sesi login (menunggu redirect auth.meta.com)...[/cyan]")
        
        # 1. Tunggu navigasi auth.meta.com -> muse.ai
        try:
            await page.wait_for_url(lambda u: "muse.ai" in u and "auth.meta.com" not in u, timeout=20000)
        except Exception:
            pass

        try:
            await page.wait_for_load_state("domcontentloaded", timeout=10000)
        except Exception:
            pass

        # 2. Polling verifikasi sesi (safe try-catch against context destroyed during redirect)
        login_success = False
        two_factor_submitted = False
        for _ in range(30):
            await asyncio.sleep(1)
            try:
                current_url = page.url
                body = (await page.locator('body').inner_text()).lower()
                if 'authenticator app' in body and not two_factor_submitted:
                    console.print('[yellow]Verifikasi dua faktor diperlukan.[/yellow]')
                    code = (await asyncio.to_thread(Prompt.ask, 'Kode 6 digit dari authenticator', password=sys.stdin.isatty())).strip()
                    if not re.fullmatch(r'[0-9]{6}', code):
                        raise ValueError('Kode authenticator harus 6 digit angka.')
                    await page.locator('input:not([type="hidden"]):not([type="checkbox"])').first.fill(code)
                    await page.get_by_role('button', name='Next', exact=True).click()
                    two_factor_submitted = True
                    continue
                if "auth.meta.com" in current_url:
                    continue

                is_ok = await page.evaluate('''() => {
                    const text = document.body ? document.body.innerText : '';
                    if (text.includes('Enter your code') || text.includes('Log in or create an account')) {
                        return false;
                    }
                    const hasChat = !!document.querySelector('textarea, div[contenteditable="true"], [data-role="chat-input"]');
                    const isMuseHome = window.location.href.includes('muse.ai') && !window.location.href.includes('auth.meta.com');
                    return hasChat && window.location.hostname === 'muse.ai';
                }''')
                if is_ok:
                    login_success = True
                    break
            except ValueError:
                raise
            except Exception:
                continue

        if not login_success:
            err_text = ""
            try:
                err_text = await page.evaluate('''() => {
                    const el = document.querySelector('[class*="error"], [role="alert"]');
                    return el ? el.innerText : '';
                }''')
            except Exception:
                pass
            if err_text:
                raise Exception(f"Error dari muse.ai: {err_text}")
            raise Exception("Kode OTP tidak valid atau verifikasi timeout!")

        session_path = os.path.join(SESSIONS_DIR, f"{name}.json")
        await context.storage_state(path=session_path)
        AccountRegistry.add_or_update(name=name, email=identifier)
        await context.close()
        await app_instance.reload_sessions()
        return session_path

    try:
        future_sub = asyncio.run_coroutine_threadsafe(submit_otp_and_save(), loop)
        sess_file = future_sub.result(timeout=300)
        console.print(f"[bold green]✨ BERHASIL! Sesi akun '{name}' tersimpan di {sess_file} dan statusnya READY![/bold green]")
    except Exception as e:
        console.print(f"[red]❌ Verifikasi OTP gagal: {e}[/red]")
        try:
            asyncio.run_coroutine_threadsafe(context.close(), loop)
        except Exception:
            pass


def handle_api_keys_menu():
    env_info = SystemEnvironment.detect()
    while True:
        clear_screen()
        keys = ApiKeyManager.load_keys()
        console.print("\n[bold yellow]=== 🔑 KELOLA API KEY (DATABASE: api_keys.txt) ===[/bold yellow]")
        console.print(f"Base URL (Direct IP) : [bold green]{env_info['base_url_ip']}[/bold green]")
        console.print(f"Base URL (Domain CF) : [bold cyan]{env_info['base_url_domain']}[/bold cyan]")
        console.print(f"Total API Key Aktif  : [bold yellow]{len(keys)}[/bold yellow]")
        console.print(" [1] [bold green]Generate / Buat API Key Baru[/bold green]")
        console.print(" [2] Lihat Daftar Semua API Key & Info Integrasi")
        console.print(" [3] [red]Hapus API Key[/red]")
        console.print(" [4] Kembali ke Dashboard")

        c = Prompt.ask("\n👉 [bold cyan]Pilih [1-4][/bold cyan]", choices=["1", "2", "3", "4"], default="4", show_choices=False, show_default=False)

        if c == "1":
            label = Prompt.ask("👉 Masukkan label/nama API Key (misal: 9router, carry, client-1)", default="client").strip() or "client"
            entry = ApiKeyManager.generate_key(label=label)
            
            card = (
                f"[bold green]✨ API KEY BARU BERHASIL DIGENERATE![/bold green]\n\n"
                f"[bold white]API Key       :[/bold white] [bold yellow]{entry['key']}[/bold yellow]\n"
                f"[bold white]Label         :[/bold white] {entry['label']}\n"
                f"[bold white]Base URL (IP) :[/bold white] [bold green]{env_info['base_url_ip']}[/bold green]\n"
                f"[bold white]Base URL (SSL):[/bold white] [bold cyan]{env_info['base_url_domain']}[/bold cyan]\n"
                f"[bold white]Format Header :[/bold white] [dim]Authorization: Bearer {entry['key']}[/dim]\n"
                f"[bold white]Database Text :[/bold white] [green]Tersimpan di api_keys.txt[/green]"
            )
            console.print(Panel(card, border_style="green", box=box.ROUNDED, expand=False))
            Prompt.ask("\nTekan Enter untuk lanjut")

        elif c == "2":
            table = Table(title=f"Daftar API Key ({len(keys)})", box=box.SIMPLE, expand=False, header_style="bold dim")
            table.add_column("No", justify="center", width=3)
            table.add_column("Label", style="bold cyan")
            table.add_column("API Key", style="yellow")
            table.add_column("Dibuat", style="dim")

            for idx, k in enumerate(keys, 1):
                masked = k['key'][:14] + "..." + k['key'][-4:] if len(k['key']) > 24 else k['key']
                table.add_row(str(idx), escape(k.get('label', '-')), masked, escape(k.get('created', '-')))
            console.print(table)
            console.print(f"[dim]Direct IP Base URL : {env_info['base_url_ip']}[/dim]")
            console.print(f"[dim]Domain SSL Base URL: {env_info['base_url_domain']}[/dim]")
            Prompt.ask("\nTekan Enter untuk lanjut")

        elif c == "3":
            if not keys:
                console.print("[dim]Belum ada API Key untuk dihapus.[/dim]")
            else:
                for idx, k in enumerate(keys, 1):
                    console.print(f" {idx}. [{escape(k['label'])}] {k['key'][:14]}...{k['key'][-4:]}")
                target = Prompt.ask("\nMasukkan nomor urut atau prefix API key yang ingin dihapus (kosongkan untuk batal)").strip()
                if target:
                    if ApiKeyManager.delete_key(target):
                        console.print(f"[green]✅ API Key berhasil dihapus dari api_keys.txt.[/green]")
                    else:
                        console.print(f"[red]❌ API Key tidak ditemukan.[/red]")
            Prompt.ask("\nTekan Enter untuk lanjut")

        elif c == "4":
            break


def handle_delete_account():
    clear_screen()
    console.print("\n[bold red]=== [4] HAPUS AKUN ===[/bold red]")
    accounts = AccountRegistry.list_accounts()
    if not accounts:
        console.print("[dim]Belum ada akun yang terdaftar.[/dim]")
        return
    for idx, a in enumerate(accounts, 1):
        console.print(f"  {idx}. [cyan]{escape(a['name'])}[/cyan] ({escape(a.get('email', '-'))})")
    
    target = Prompt.ask("Masukkan ID akun yang mau dihapus (atau kosongkan untuk batal)").strip()
    if target:
        AccountRegistry.remove(target)
        if target in app_instance.sessions:
            del app_instance.sessions[target]
        console.print(f"[green]✅ Akun '{escape(target)}' berhasil dihapus.[/green]")


def show_dashboard():
    while True:
        clear_screen()
        env_info = SystemEnvironment.detect()
        uptime_s = int(time.time() - app_instance.start_time)
        uptime_str = f"{uptime_s // 60}m {uptime_s % 60}s"
        total_keys = len(ApiKeyManager.load_keys())

        total_reqs = sum(a.get("requests_handled", 0) for a in AccountRegistry.load_accounts())
        header = (
            f"[bold cyan]⚡ MUSE.AI 9ROUTER BRIDGE (DIRECT HIGH-SPEED) ⚡[/bold cyan]\n"
            f"[bold white]Lingkungan :[/bold white] {env_info['env_name']}\n"
            f"[bold white]Base URL IP:[/bold white] [bold green]{env_info['base_url_ip']}[/bold green]\n"
            f"[bold white]Base URL CF:[/bold white] [bold cyan]{env_info['base_url_domain']}[/bold cyan]\n"
            f"[bold white]DB API Key :[/bold white] [bold yellow]api_keys.txt[/bold yellow] ({total_keys} Key Terdaftar)\n"
            f"[bold white]Aktivitas  :[/bold white] {total_reqs} req  •  Uptime {uptime_str}"
        )
        console.print(Panel(header, border_style="cyan", box=box.ROUNDED, expand=False))

        # Accounts table (compact, expand=False, no wrapping)
        accounts = AccountRegistry.list_accounts()
        table = Table(
            title=f"Akun Terdaftar ({len(accounts)})",
            box=box.SIMPLE,
            expand=False,
            header_style="bold dim"
        )
        table.add_column("No", justify="center", width=3)
        table.add_column("ID Akun", style="bold cyan")
        table.add_column("Email/HP", style="white")
        table.add_column("Status", justify="center")
        table.add_column("Req", justify="right", width=5)

        if not accounts:
            table.add_row("-", "Kosong", "-", "[yellow]Login via [2][/yellow]", "0")
        else:
            for idx, a in enumerate(accounts, 1):
                name = a["name"]
                sess = app_instance.sessions.get(name)
                status_str = "[bold green]READY[/bold green]" if sess and sess.status == "READY" else "[red]NOT READY[/red]"
                reqs = str(AccountRegistry.get_req(name))
                table.add_row(str(idx), escape(name), escape(a.get("email", "-")), status_str, reqs)
        console.print(table)

        # Recent logs (last 5 lines)
        if app_instance.recent_logs:
            log_text = "\n".join(app_instance.recent_logs[-5:])
            console.print(Panel(log_text, title="Log Terakhir", border_style="dim", box=box.ROUNDED, expand=False))

        console.print("[bold]Aksi Tersedia:[/bold]")
        console.print(" [bold cyan]1[/bold cyan] Refresh Tampilan     [bold cyan]2[/bold cyan] [bold green]Login Akun (OTP)[/bold green]")
        console.print(" [bold cyan]3[/bold cyan] 🔑 [bold yellow]Kelola API Key[/bold yellow]    [bold cyan]4[/bold cyan] Hapus Akun")
        console.print(" [bold cyan]5[/bold cyan] Reload Sesi Akun")

        choice = Prompt.ask("\n👉 [bold cyan]Pilihan [1-5][/bold cyan]", choices=["1", "2", "3", "4", "5"], default="1", show_choices=False, show_default=False)

        if choice == "1":
            continue
        elif choice == "2":
            do_interactive_login()
            Prompt.ask("\nTekan Enter untuk lanjut")
        elif choice == "3":
            handle_api_keys_menu()
        elif choice == "4":
            handle_delete_account()
            Prompt.ask("\nTekan Enter untuk lanjut")
        elif choice == "5":
            console.print("[cyan]🔄 Me-reload sesi akun...[/cyan]")
            asyncio.run_coroutine_threadsafe(app_instance.reload_sessions(), loop).result(timeout=30)
            console.print("[green]✅ Reload selesai![/green]")
            Prompt.ask("\nTekan Enter untuk lanjut")


def print_startup_autoconfig():
    env_info = SystemEnvironment.detect()
    total_keys = len(ApiKeyManager.load_keys())
    card = (
        f"[bold cyan]⚡ AUTO-CONFIGURATION: DETEKSI SISTEM ⚡[/bold cyan]\n\n"
        f"[bold white]Mode Lingkungan :[/bold white] [bold green]{env_info['env_name']}[/bold green]\n"
        f"[bold white]Deteksi Alasan  :[/bold white] [dim]{env_info['reason']}[/dim]\n"
        f"[bold white]IP Publik Host  :[/bold white] [bold yellow]{env_info['public_ip']}[/bold yellow]\n"
        f"[bold white]Port Gateway    :[/bold white] [bold cyan]{env_info['port']}[/bold cyan]\n"
        f"[bold white]Base URL (IP)   :[/bold white] [bold green]{env_info['base_url_ip']}[/bold green]\n"
        f"[bold white]Base URL (Domain):[/bold white] [bold cyan]{env_info['base_url_domain']}[/bold cyan]\n"
        f"[bold white]Database Key    :[/bold white] [yellow]api_keys.txt[/yellow] ({total_keys} Active Keys)"
    )
    console.print(Panel(card, border_style="cyan", box=box.ROUNDED, expand=False))


def configure_port_interactive():
    global PORT
    if "SERVER_PORT" in os.environ:
        PORT = int(os.environ["SERVER_PORT"])
        return
    if os.path.exists("/home/container") and (os.getcwd() == "/home/container" or BASE_DIR.startswith("/home/container")):
        PORT = int(os.environ.get("SERVER_PORT", "3008"))
        return
    if sys.stdin.isatty():
        try:
            console.print("\n[bold cyan]╭────────────────────────────────────────╮[/bold cyan]")
            console.print("[bold cyan]│  ⚡ SETUP GATEWAY PORT (STANDALONE)   │[/bold cyan]")
            console.print("[bold cyan]╰────────────────────────────────────────╯[/bold cyan]")
            val = Prompt.ask("👉 [bold white]Mau jalan di port berapa?[/bold white]", default=str(PORT))
            if val and val.isdigit():
                PORT = int(val)
        except Exception:
            pass


def main():
    configure_port_interactive()
    print_startup_autoconfig()

    asyncio.set_event_loop(loop)

    def run_loop():
        loop.run_forever()

    loop_thread = Thread(target=run_loop, daemon=True)
    loop_thread.start()

    init_future = asyncio.run_coroutine_threadsafe(app_instance.init_engine(), loop)
    init_future.result(timeout=60)

    http_thread = Thread(target=run_http_server, daemon=True)
    http_thread.start()

    console.print(f"[bold green]✨ HTTP Gateway Online di http://{HOST}:{PORT}[/bold green]")
    time.sleep(2)
    clear_screen()

    try:
        show_dashboard()
    except (KeyboardInterrupt, SystemExit):
        asyncio.run_coroutine_threadsafe(app_instance.cleanup(), loop).result(timeout=10)
        sys.exit(0)


if __name__ == "__main__":
    main()
