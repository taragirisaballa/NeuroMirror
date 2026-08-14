from __future__ import annotations

import json
import mimetypes
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from neuromirror.config import ReplayConfig
from neuromirror.processing.filters import bandpass
from neuromirror.replay import replay_frames
from neuromirror.synthetic import generate_eyes_open_closed

WEB_ROOT = Path(__file__).resolve().parent.parent / "web"


class NeuroMirrorHandler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/api/stream":
            self._stream_events(parse_qs(parsed.query))
            return

        path = WEB_ROOT / parsed.path.lstrip("/")
        if parsed.path == "/":
            path = WEB_ROOT / "index.html"
        if not path.is_file() or WEB_ROOT not in path.resolve().parents:
            self.send_error(404)
            return

        content_type = mimetypes.guess_type(path)[0] or "application/octet-stream"
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(path.read_bytes())

    def log_message(self, format: str, *args: object) -> None:
        return

    def _stream_events(self, query: dict[str, list[str]]) -> None:
        seconds = _float_query(query, "seconds", 24.0)
        speed = _float_query(query, "speed", 1.0)
        seed = int(_float_query(query, "seed", 7))
        config = ReplayConfig(speed=speed)

        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "keep-alive")
        self.end_headers()

        while True:
            data, times, labels = generate_eyes_open_closed(config, seconds=seconds, seed=seed)
            filtered = bandpass(data, sample_rate_hz=config.sample_rate_hz)
            for frame in replay_frames(filtered, times, labels, config):
                try:
                    self.wfile.write(f"data: {json.dumps(frame)}\n\n".encode("utf-8"))
                    self.wfile.flush()
                except BrokenPipeError:
                    return
                time.sleep(config.step_seconds / max(config.speed, 0.001))
            seed += 1


def run_dashboard(host: str = "127.0.0.1", port: int = 8765) -> None:
    server = ThreadingHTTPServer((host, port), NeuroMirrorHandler)
    print(f"NeuroMirror dashboard running at http://{host}:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping NeuroMirror dashboard.")


def _float_query(query: dict[str, list[str]], key: str, default: float) -> float:
    values = query.get(key)
    if not values:
        return default
    try:
        return float(values[0])
    except ValueError:
        return default
