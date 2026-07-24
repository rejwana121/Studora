from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse


class ApiError(Exception):
    """Raised anywhere in the app; rendered via the shared error envelope.

    Matches docs/phase1/10-api-contract.md §10.14:
    { "error": { "code": string, "message": string, "field": string|null } }
    """

    def __init__(self, status_code: int, code: str, message: str, field: str | None = None) -> None:
        self.status_code = status_code
        self.code = code
        self.message = message
        self.field = field
        super().__init__(message)

    def to_body(self) -> dict:
        return {"error": {"code": self.code, "message": self.message, "field": self.field}}


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def api_error_handler(_: Request, exc: ApiError) -> JSONResponse:
        return JSONResponse(status_code=exc.status_code, content=exc.to_body())

    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
        first = exc.errors()[0] if exc.errors() else None
        field = ".".join(str(p) for p in first["loc"] if p != "body") if first else None
        message = first["msg"] if first else "Validation failed"
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            content={
                "error": {"code": "VALIDATION_ERROR", "message": message, "field": field or None}
            },
        )
