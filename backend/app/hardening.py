from starlette.responses import JSONResponse


class SecurityHeadersMiddleware:
    def __init__(self, app, *, hsts: bool = False):
        self.app = app
        self.hsts = hsts

    async def __call__(self, scope, receive, send):
        async def send_hardened(message):
            if message["type"] == "http.response.start":
                headers = list(message.get("headers", []))
                headers.extend(
                    [
                        (b"x-content-type-options", b"nosniff"),
                        (b"x-frame-options", b"DENY"),
                        (b"referrer-policy", b"no-referrer"),
                        (b"permissions-policy", b"camera=(), microphone=(), geolocation=()"),
                        (b"content-security-policy", b"default-src 'none'; frame-ancestors 'none'"),
                    ]
                )
                if scope.get("path", "").startswith("/api/"):
                    headers.append((b"cache-control", b"no-store"))
                if self.hsts:
                    headers.append(
                        (b"strict-transport-security", b"max-age=31536000; includeSubDomains")
                    )
                message["headers"] = headers
            await send(message)

        await self.app(scope, receive, send_hardened)


class PayloadLimitMiddleware:
    def __init__(self, app, *, max_bytes: int | None):
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or self.max_bytes is None:
            return await self.app(scope, receive, send)
        headers = dict(scope.get("headers", []))
        raw_length = headers.get(b"content-length")
        if raw_length:
            try:
                too_large = int(raw_length) > self.max_bytes
            except ValueError:
                too_large = True
            if too_large:
                response = JSONResponse(
                    {"error": {"code": "PAYLOAD_TOO_LARGE", "message": "Payload terlalu besar."}},
                    status_code=413,
                )
                return await response(scope, receive, send)

        buffered = []
        received = 0
        while True:
            message = await receive()
            buffered.append(message)
            if message["type"] == "http.disconnect":
                return
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > self.max_bytes:
                    response = JSONResponse(
                        {
                            "error": {
                                "code": "PAYLOAD_TOO_LARGE",
                                "message": "Payload terlalu besar.",
                            }
                        },
                        status_code=413,
                    )
                    return await response(scope, receive, send)
                if not message.get("more_body", False):
                    break

        async def replay_receive():
            if buffered:
                return buffered.pop(0)
            return {"type": "http.request", "body": b"", "more_body": False}

        await self.app(scope, replay_receive, send)
