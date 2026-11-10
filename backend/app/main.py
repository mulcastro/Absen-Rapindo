from fastapi import FastAPI

from .config import get_settings
from .hardening import PayloadLimitMiddleware, SecurityHeadersMiddleware
from .rate_limit import InMemoryRateLimitMiddleware
from .routes import admin, audit, auth, health, public, recap

settings = get_settings()
app = FastAPI(
    title="API Absensi LPK Rapindo",
    version="0.1.0",
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
)
app.add_middleware(InMemoryRateLimitMiddleware, requests_per_minute=settings.rate_limit_per_minute)
app.add_middleware(PayloadLimitMiddleware, max_bytes=settings.max_request_bytes)
app.add_middleware(
    SecurityHeadersMiddleware,
    hsts=settings.app_env == "production" and settings.cookie_secure,
)
app.include_router(health.router)
app.include_router(auth.router)
app.include_router(admin.router)
app.include_router(public.router)
app.include_router(recap.router)
app.include_router(audit.router)
