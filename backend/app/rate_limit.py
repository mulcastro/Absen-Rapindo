from collections import defaultdict, deque
from threading import Lock
from time import monotonic

from fastapi import Request
from starlette.responses import JSONResponse


class InMemoryRateLimitMiddleware:
    """Fondasi satu proses; produksi multi-worker memerlukan penyimpanan bersama."""

    def __init__(self, app, requests_per_minute: int = 30):
        self.app = app
        self.limit = requests_per_minute
        self.hits: dict[str, deque[float]] = defaultdict(deque)
        self.lock = Lock()

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        request = Request(scope)
        if request.url.path.endswith(("/login", "/challenge", "/attendance/start")):
            key = f"{request.client.host if request.client else 'unknown'}:{request.url.path}"
            now = monotonic()
            with self.lock:
                bucket = self.hits[key]
                while bucket and bucket[0] <= now - 60:
                    bucket.popleft()
                if len(bucket) >= self.limit:
                    response = JSONResponse(
                        {"error": {"code": "RATE_LIMIT", "message": "Terlalu banyak permintaan."}},
                        status_code=429,
                        headers={"Retry-After": "60"},
                    )
                    return await response(scope, receive, send)
                bucket.append(now)
        return await self.app(scope, receive, send)
