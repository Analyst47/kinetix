from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app import dbguard
from app.config import get_settings
from app.db import engine
from app.errors import ApiError, api_error_handler
from app.routers import (
    ai,
    audit,
    auth,
    dependencies,
    disclosures,
    findings,
    members,
    passwords,
    projects,
    scans,
)
from app.security.tokens import constant_time_equals

UNSAFE = {"POST", "PUT", "PATCH", "DELETE"}

SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Cache-Control": "no-store",
}


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    with engine.connect() as conn:
        dbguard.enforce(conn, production=get_settings().is_production)
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        lifespan=lifespan,
        title="Kinetix API",
        version="0.1.0",
        description="Vulnerability research and responsible-disclosure platform.",
        docs_url="/api/docs",
        openapi_url="/api/openapi.json",
        redoc_url=None,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "DELETE"],
        allow_headers=["Content-Type", "X-CSRF-Token"],
    )

    @app.middleware("http")
    async def csrf_and_headers(request: Request, call_next):
        if request.method in UNSAFE and request.url.path.startswith("/api/"):
            origin = request.headers.get("origin")
            if (
                origin
                and origin not in settings.cors_origins
                and origin != str(request.base_url).rstrip("/")
            ):
                return _error(403, "bad_origin", "Request origin is not allowed.")
            cookie = request.cookies.get(settings.csrf_cookie)
            header = request.headers.get("x-csrf-token")
            if not cookie or not header or not constant_time_equals(cookie, header):
                return _error(
                    403,
                    "csrf_failed",
                    "Missing or invalid CSRF token. Reload the page and try again.",
                )
        response = await call_next(request)
        for key, value in SECURITY_HEADERS.items():
            response.headers.setdefault(key, value)
        if settings.is_production:
            response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"
        return response

    app.add_exception_handler(ApiError, api_error_handler)

    @app.exception_handler(RequestValidationError)
    async def validation_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
        fields = [
            {
                "field": ".".join(str(p) for p in e["loc"][1:]),
                "message": e["msg"].removeprefix("Value error, "),
            }
            for e in exc.errors()
        ]
        first = fields[0] if fields else {"field": "", "message": "Invalid request."}
        message = f"{first['field']}: {first['message']}" if first["field"] else first["message"]
        return JSONResponse(
            status_code=422,
            content={
                "error": {
                    "code": "invalid_request",
                    "message": message,
                    "details": {"fields": fields},
                }
            },
        )

    prefix = "/api/v1"
    for module in (
        auth,
        passwords,
        projects,
        findings,
        disclosures,
        dependencies,
        scans,
        audit,
        members,
        ai,
    ):
        app.include_router(module.router, prefix=prefix)

    @app.get("/api/health", tags=["meta"])
    def health() -> dict[str, str]:
        with engine.connect() as conn:
            conn.execute(text("select 1"))
        return {"status": "ok"}

    return app


def _error(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(status_code=status, content={"error": {"code": code, "message": message}})


app = create_app()
