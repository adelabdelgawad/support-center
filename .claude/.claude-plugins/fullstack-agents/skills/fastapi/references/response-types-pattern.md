# Response Types Pattern Reference

Handle different response types in FastAPI: HTML, files, streams, redirects, and custom responses.

## Key Principles

1. **Use `response_class`** - Specify response type at endpoint level
2. **Set proper headers** - Content-Type, Content-Disposition for downloads
3. **Stream large files** - Use `StreamingResponse` for memory efficiency
4. **Handle errors gracefully** - Return appropriate error responses

## Response Types Overview

| Response Type | Use Case | Import |
|---------------|----------|--------|
| `JSONResponse` | API responses (default) | `fastapi.responses` |
| `HTMLResponse` | HTML pages | `fastapi.responses` |
| `PlainTextResponse` | Plain text | `fastapi.responses` |
| `FileResponse` | File downloads | `fastapi.responses` |
| `StreamingResponse` | Large files, SSE | `fastapi.responses` |
| `RedirectResponse` | URL redirects | `fastapi.responses` |

## HTML Response

```python
# api/routers/pages.py
"""HTML page endpoints."""

from fastapi import APIRouter
from fastapi.responses import HTMLResponse

router = APIRouter(prefix="/pages", tags=["pages"])


@router.get("/", response_class=HTMLResponse)
async def get_home_page():
    """Return HTML home page."""
    return """
    <!DOCTYPE html>
    <html>
    <head>
        <title>Home</title>
    </head>
    <body>
        <h1>Welcome to My API</h1>
        <p>Visit <a href="/docs">API Documentation</a></p>
    </body>
    </html>
    """


@router.get("/dashboard", response_class=HTMLResponse)
async def get_dashboard(username: str = "Guest"):
    """Return dynamic HTML page."""
    return f"""
    <!DOCTYPE html>
    <html>
    <head>
        <title>Dashboard</title>
    </head>
    <body>
        <h1>Hello, {username}!</h1>
        <p>Your dashboard content here.</p>
    </body>
    </html>
    """
```

## File Download Response

```python
# api/routers/downloads.py
"""File download endpoints."""

from pathlib import Path
from fastapi import APIRouter, HTTPException, Depends, status
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_session
from api.services.file_service import FileService

router = APIRouter(prefix="/downloads", tags=["downloads"])


@router.get("/{file_id}")
async def download_file(
    file_id: int,
    session: SessionDep,
):
    """
    Download a file by ID.

    Returns the file with proper Content-Disposition header.
    """
    service = FileService()
    file_record = await service.get_file(session, file_id)

    file_path = Path(file_record.storage_path)
    if not file_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File not found on disk",
        )

    return FileResponse(
        path=file_path,
        filename=file_record.original_name,
        media_type=file_record.content_type,
        # Force download (not inline display)
        headers={"Content-Disposition": f'attachment; filename="{file_record.original_name}"'},
    )


@router.get("/reports/{report_id}/pdf")
async def download_report_pdf(
    report_id: int,
    session: SessionDep,
):
    """Download report as PDF."""
    service = FileService()
    pdf_path = await service.generate_report_pdf(session, report_id)

    return FileResponse(
        path=pdf_path,
        filename=f"report_{report_id}.pdf",
        media_type="application/pdf",
    )
```

## Streaming Response

```python
# api/routers/stream.py
"""Streaming response endpoints."""

import asyncio
from typing import AsyncGenerator
from fastapi import APIRouter
from fastapi.responses import StreamingResponse

router = APIRouter(prefix="/stream", tags=["streaming"])


async def generate_large_file() -> AsyncGenerator[bytes, None]:
    """Generate large file content in chunks."""
    for i in range(1000):
        yield f"Line {i}: {'x' * 100}\n".encode()
        await asyncio.sleep(0.01)  # Simulate work


@router.get("/large-file")
async def stream_large_file():
    """
    Stream a large file without loading into memory.

    Perfect for:
    - Large CSV exports
    - Log file downloads
    - Generated content
    """
    return StreamingResponse(
        generate_large_file(),
        media_type="text/plain",
        headers={
            "Content-Disposition": "attachment; filename=large_file.txt",
        },
    )


# Server-Sent Events (SSE)
async def event_generator() -> AsyncGenerator[str, None]:
    """Generate SSE events."""
    for i in range(10):
        yield f"data: Message {i}\n\n"
        await asyncio.sleep(1)
    yield "data: [DONE]\n\n"


@router.get("/events")
async def stream_events():
    """
    Server-Sent Events endpoint.

    Client can connect with:
    ```javascript
    const eventSource = new EventSource('/setting/stream/events');
    eventSource.onmessage = (e) => console.log(e.data);
    ```
    """
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    )


# Stream database query results
async def stream_query_results(session, query) -> AsyncGenerator[str, None]:
    """Stream query results as JSON lines."""
    import json

    result = await session.execute(query)

    for row in result.scalars():
        yield json.dumps(row.to_dict()) + "\n"


@router.get("/export/items")
async def export_items_stream(
    session: SessionDep,
):
    """Export items as JSON lines (streaming)."""
    from sqlalchemy import select
    from db.models import Item

    async def generate():
        query = select(Item).where(Item.is_active == True)
        result = await session.execute(query)

        for item in result.scalars():
            yield item.to_json() + "\n"

    return StreamingResponse(
        generate(),
        media_type="application/x-ndjson",
        headers={
            "Content-Disposition": "attachment; filename=items_export.jsonl",
        },
    )
```

## Redirect Response

```python
# api/routers/redirects.py
"""Redirect endpoints."""

from fastapi import APIRouter, status
from fastapi.responses import RedirectResponse

router = APIRouter(prefix="/redirect", tags=["redirects"])


@router.get("/old-path")
async def redirect_old_path():
    """Permanent redirect (301) to new path."""
    return RedirectResponse(
        url="/setting/new-path",
        status_code=status.HTTP_301_MOVED_PERMANENTLY,
    )


@router.get("/temporary")
async def redirect_temporary():
    """Temporary redirect (302)."""
    return RedirectResponse(
        url="/setting/target",
        status_code=status.HTTP_302_FOUND,
    )


@router.post("/after-create")
async def redirect_after_create():
    """Redirect after POST (303 See Other)."""
    # Create resource...
    new_id = 123

    return RedirectResponse(
        url=f"/setting/items/{new_id}",
        status_code=status.HTTP_303_SEE_OTHER,
    )


@router.get("/external")
async def redirect_external():
    """Redirect to external URL."""
    return RedirectResponse(
        url="https://example.com/page",
        status_code=status.HTTP_302_FOUND,
    )
```

## Custom Response with Headers

```python
# api/routers/custom.py
"""Custom response examples."""

from fastapi import APIRouter, Response
from fastapi.responses import JSONResponse

router = APIRouter(prefix="/custom", tags=["custom"])


@router.get("/with-headers")
async def response_with_custom_headers(response: Response):
    """Add custom headers to response."""
    response.headers["X-Custom-Header"] = "custom-value"
    response.headers["X-Request-ID"] = "abc-123"

    return {"message": "Response with custom headers"}


@router.get("/with-cookie")
async def response_with_cookie(response: Response):
    """Set cookie in response."""
    response.set_cookie(
        key="session_id",
        value="abc123",
        httponly=True,
        secure=True,
        samesite="lax",
        max_age=3600,  # 1 hour
    )

    return {"message": "Cookie set"}


@router.get("/clear-cookie")
async def clear_cookie(response: Response):
    """Clear a cookie."""
    response.delete_cookie(key="session_id")
    return {"message": "Cookie cleared"}


@router.get("/custom-json")
async def custom_json_response():
    """Return custom JSONResponse with headers."""
    content = {"message": "Custom response", "data": [1, 2, 3]}

    return JSONResponse(
        content=content,
        status_code=200,
        headers={
            "X-Total-Count": "3",
            "X-Custom-Header": "value",
        },
    )


@router.get("/no-cache")
async def no_cache_response():
    """Response with cache control headers."""
    return JSONResponse(
        content={"timestamp": "2024-01-01T00:00:00Z"},
        headers={
            "Cache-Control": "no-store, no-cache, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0",
        },
    )
```

## Multiple Response Status Codes

```python
# api/routers/items.py
"""Items with documented multiple responses."""

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_session
from api.schemas.item_schema import ItemCreate, ItemResponse
from api.schemas.error_schema import ErrorResponse
from api.services.item_service import ItemService

router = APIRouter(prefix="/items", tags=["items"])


@router.post(
    "",
    response_model=ItemResponse,
    status_code=status.HTTP_201_CREATED,
    responses={
        201: {
            "model": ItemResponse,
            "description": "Item created successfully",
        },
        400: {
            "model": ErrorResponse,
            "description": "Validation error",
            "content": {
                "application/json": {
                    "example": {"detail": "Name is required"}
                }
            },
        },
        409: {
            "model": ErrorResponse,
            "description": "Item already exists",
            "content": {
                "application/json": {
                    "example": {"detail": "Item with this name already exists"}
                }
            },
        },
    },
    summary="Create a new item",
    description="Create a new item with the provided data. Returns 409 if item with same name exists.",
)
async def create_item(
    item_create: ItemCreate,
    session: SessionDep,
):
    """Create a new item."""
    service = ItemService()
    item = await service.create_item(session, item_create)
    return ItemResponse.model_validate(item)


@router.get(
    "/{item_id}",
    response_model=ItemResponse,
    responses={
        200: {"model": ItemResponse, "description": "Item found"},
        404: {
            "model": ErrorResponse,
            "description": "Item not found",
            "content": {
                "application/json": {
                    "example": {"detail": "Item with ID 123 not found"}
                }
            },
        },
    },
)
async def get_item(
    item_id: int,
    session: SessionDep,
):
    """Get item by ID."""
    service = ItemService()
    item = await service.get_item(session, item_id)
    return ItemResponse.model_validate(item)
```

## Error Response Schema

```python
# api/schemas/error_schema.py
"""Error response schemas for OpenAPI documentation."""

from typing import Optional, List, Any
from api.schemas._base import CamelModel


class ErrorResponse(CamelModel):
    """Standard error response."""
    detail: str
    code: Optional[str] = None


class ValidationErrorItem(CamelModel):
    """Single validation error."""
    loc: List[str]
    msg: str
    type: str


class ValidationErrorResponse(CamelModel):
    """Validation error response (422)."""
    detail: List[ValidationErrorItem]
```

## Key Points

1. **Use `response_class`** - Specify non-JSON response types
2. **Set proper headers** - Content-Type, Content-Disposition
3. **Stream large content** - Use `StreamingResponse` for memory efficiency
4. **Document responses** - Use `responses` parameter for OpenAPI docs
5. **Handle redirects properly** - Use correct status codes (301, 302, 303)
6. **Custom headers via `Response`** - Inject via dependency
7. **Multiple status codes** - Document all possible responses
