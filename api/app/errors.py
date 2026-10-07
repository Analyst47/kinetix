from fastapi import Request
from fastapi.responses import JSONResponse


class ApiError(Exception):
    """An error safe to show to the client: a stable code plus a message that says what to do."""

    def __init__(self, status: int, code: str, message: str, details: dict | None = None):
        self.status = status
        self.code = code
        self.message = message
        self.details = details or {}


def not_found(what: str = "Resource") -> ApiError:
    # Same response whether the object does not exist or belongs to another tenant (no IDOR oracle).
    return ApiError(404, "not_found", f"{what} not found.")


def forbidden(message: str = "You don't have permission to do that.") -> ApiError:
    return ApiError(403, "forbidden", message)


async def api_error_handler(_: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, ApiError)
    body = {
        "error": {
            "code": exc.code,
            "message": exc.message,
            **({"details": exc.details} if exc.details else {}),
        }
    }
    return JSONResponse(status_code=exc.status, content=body)
