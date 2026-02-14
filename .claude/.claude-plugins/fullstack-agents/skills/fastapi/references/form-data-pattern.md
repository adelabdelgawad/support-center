# Form Data Pattern Reference

Handle HTML form submissions, OAuth2 password flow, headers, and cookies in FastAPI.

## Key Principles

1. **Use `Form()` for form data** - Not JSON body
2. **OAuth2 expects form data** - Password flow requires `application/x-www-form-urlencoded`
3. **Headers via `Header()`** - Read custom and standard headers
4. **Cookies via `Cookie()`** - Read cookies directly
5. **Combine sources** - Mix form, headers, cookies in one endpoint

## Basic Form Data

```python
# api/routers/forms.py
"""Form data handling endpoints."""

from fastapi import APIRouter, Form, status
from api.schemas.contact_schema import ContactResponse

router = APIRouter(prefix="/forms", tags=["forms"])


@router.post(
    "/contact",
    response_model=ContactResponse,
    status_code=status.HTTP_201_CREATED,
)
async def submit_contact_form(
    name: str = Form(..., min_length=2, max_length=100),
    email: str = Form(..., pattern=r"^[\w\.-]+@[\w\.-]+\.\w+$"),
    message: str = Form(..., min_length=10, max_length=1000),
    subscribe: bool = Form(False),
):
    """
    Handle contact form submission.

    Receives data as application/x-www-form-urlencoded.

    HTML form example:
    ```html
    <form action="/setting/forms/contact" method="POST">
        <input name="name" type="text" required>
        <input name="email" type="email" required>
        <textarea name="message" required></textarea>
        <input name="subscribe" type="checkbox">
        <button type="submit">Send</button>
    </form>
    ```
    """
    # Process form data
    return ContactResponse(
        name=name,
        email=email,
        message=message,
        subscribed=subscribe,
    )
```

## OAuth2 Password Flow (Form-Based Login)

```python
# api/routers/auth.py
"""Authentication with OAuth2 password flow."""

from fastapi import APIRouter, Form, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_session
from api.schemas.auth_schema import TokenResponse
from api.services.auth_service import AuthService
from core.security import verify_password

router = APIRouter(prefix="/auth", tags=["authentication"])

# OAuth2 scheme for token extraction
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/token")


@router.post(
    "/token",
    response_model=TokenResponse,
    summary="OAuth2 Token Endpoint",
    description="Standard OAuth2 password flow. Submit username and password as form data.",
)
async def login_for_access_token(
    form_data: OAuth2PasswordRequestForm = Depends(),
    session: SessionDep,
):
    """
    OAuth2 compatible token login.

    The OAuth2 password flow expects:
    - Content-Type: application/x-www-form-urlencoded
    - Body: username=...&password=...

    Returns:
    - access_token: JWT for API access
    - token_type: "bearer"

    Example with curl:
    ```bash
    curl -X POST "http://localhost:8000/auth/token" \
        -H "Content-Type: application/x-www-form-urlencoded" \
        -d "username=user@example.com&password=secret"
    ```
    """
    auth_service = AuthService()

    # Authenticate user
    user = await auth_service.authenticate_user(
        session,
        username=form_data.username,
        password=form_data.password,
    )

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Generate tokens
    tokens = auth_service.create_tokens(
        user_id=str(user.id),
        username=user.username,
        scopes=form_data.scopes,  # Optional scopes from form
    )

    return TokenResponse(
        access_token=tokens["access_token"],
        refresh_token=tokens["refresh_token"],
        token_type="bearer",
    )


@router.post("/login")
async def login_custom_form(
    username: str = Form(...),
    password: str = Form(...),
    remember_me: bool = Form(False),
    session: SessionDep,
):
    """
    Custom login form with additional fields.

    Same as OAuth2 but with custom fields like remember_me.
    """
    auth_service = AuthService()

    user = await auth_service.authenticate_user(
        session,
        username=username,
        password=password,
    )

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )

    # Adjust token lifetime based on remember_me
    token_lifetime = 30 * 24 * 60 if remember_me else 60  # 30 days or 1 hour

    tokens = auth_service.create_tokens(
        user_id=str(user.id),
        username=user.username,
        expires_minutes=token_lifetime,
    )

    return TokenResponse(
        access_token=tokens["access_token"],
        refresh_token=tokens["refresh_token"],
        token_type="bearer",
    )
```

## Header Parameters

```python
# api/routers/headers.py
"""Reading header parameters."""

from typing import Optional
from fastapi import APIRouter, Header, HTTPException, status

router = APIRouter(prefix="/headers", tags=["headers"])


@router.get("/info")
async def get_request_info(
    # Standard headers
    user_agent: Optional[str] = Header(None, alias="User-Agent"),
    accept_language: Optional[str] = Header(None, alias="Accept-Language"),

    # Custom headers (use alias for non-Python-friendly names)
    x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
    x_request_id: Optional[str] = Header(None, alias="X-Request-ID"),
    x_forwarded_for: Optional[str] = Header(None, alias="X-Forwarded-For"),
):
    """
    Read various headers from request.

    Headers are case-insensitive in HTTP but FastAPI uses
    lowercase parameter names with aliases for clarity.
    """
    return {
        "user_agent": user_agent,
        "accept_language": accept_language,
        "api_key": x_api_key,
        "request_id": x_request_id,
        "forwarded_for": x_forwarded_for,
    }


@router.get("/protected")
async def protected_endpoint(
    x_api_key: str = Header(..., alias="X-API-Key"),
):
    """
    Endpoint requiring API key in header.

    The `...` makes the header required.
    """
    # Validate API key
    valid_keys = ["secret-key-1", "secret-key-2"]

    if x_api_key not in valid_keys:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API key",
        )

    return {"message": "Access granted", "key_prefix": x_api_key[:8]}


@router.get("/locale")
async def get_locale_from_header(
    accept_language: str = Header("en", alias="Accept-Language"),
):
    """
    Determine locale from Accept-Language header.

    Example headers:
    - Accept-Language: en-US,en;q=0.9,ar;q=0.8
    - Accept-Language: ar
    """
    # Parse Accept-Language (simplified)
    if "ar" in accept_language.lower():
        locale = "ar"
    else:
        locale = "en"

    return {"detected_locale": locale, "raw_header": accept_language}
```

## Cookie Parameters

```python
# api/routers/cookies.py
"""Reading and setting cookies."""

from typing import Optional
from fastapi import APIRouter, Cookie, Response, HTTPException
from datetime import datetime, timedelta

router = APIRouter(prefix="/cookies", tags=["cookies"])


@router.get("/read")
async def read_cookies(
    session_id: Optional[str] = Cookie(None),
    preferences: Optional[str] = Cookie(None),
    locale: Optional[str] = Cookie(None, alias="user_locale"),
):
    """
    Read cookies from request.

    Cookies are sent automatically by browser.
    Use `alias` if cookie name differs from parameter name.
    """
    return {
        "session_id": session_id,
        "preferences": preferences,
        "locale": locale,
    }


@router.post("/set")
async def set_cookies(
    response: Response,
    theme: str = "light",
    locale: str = "en",
):
    """
    Set cookies in response.

    Cookies will be sent to browser and stored.
    """
    # Set theme cookie (1 year)
    response.set_cookie(
        key="theme",
        value=theme,
        max_age=365 * 24 * 60 * 60,  # 1 year in seconds
        httponly=False,  # Allow JavaScript access
        secure=False,  # Set True in production (HTTPS)
        samesite="lax",
    )

    # Set locale cookie
    response.set_cookie(
        key="user_locale",
        value=locale,
        max_age=365 * 24 * 60 * 60,
        httponly=False,
        samesite="lax",
    )

    return {"message": "Cookies set", "theme": theme, "locale": locale}


@router.post("/set-secure")
async def set_secure_cookie(
    response: Response,
    session_id: str,
):
    """
    Set a secure, HTTP-only cookie.

    Best practices for session cookies:
    - httponly=True: Prevents JavaScript access (XSS protection)
    - secure=True: Only sent over HTTPS
    - samesite="strict": Prevents CSRF
    """
    response.set_cookie(
        key="session_id",
        value=session_id,
        max_age=30 * 24 * 60 * 60,  # 30 days
        httponly=True,  # No JavaScript access
        secure=True,  # HTTPS only
        samesite="strict",  # Strict CSRF protection
        path="/",  # Available on all paths
    )

    return {"message": "Secure session cookie set"}


@router.post("/clear")
async def clear_cookies(response: Response):
    """Clear cookies by setting them to expire."""
    response.delete_cookie(key="session_id")
    response.delete_cookie(key="theme")
    response.delete_cookie(key="user_locale")

    return {"message": "Cookies cleared"}


@router.get("/validate-session")
async def validate_session(
    session_id: str = Cookie(...),  # Required cookie
):
    """
    Endpoint requiring valid session cookie.

    `...` makes the cookie required - returns 422 if missing.
    """
    # Validate session (example)
    if not session_id.startswith("sess_"):
        raise HTTPException(
            status_code=401,
            detail="Invalid session",
        )

    return {"message": "Session valid", "session_id": session_id[:8] + "..."}
```

## Combining Form, Headers, and Cookies

```python
# api/routers/combined.py
"""Combining multiple input sources."""

from typing import Optional
from fastapi import APIRouter, Form, Header, Cookie, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_session

router = APIRouter(prefix="/combined", tags=["combined"])


@router.post("/submit")
async def combined_submission(
    # Form data
    title: str = Form(...),
    content: str = Form(...),

    # Headers
    x_api_key: str = Header(..., alias="X-API-Key"),
    user_agent: Optional[str] = Header(None, alias="User-Agent"),

    # Cookies
    session_id: Optional[str] = Cookie(None),
    locale: str = Cookie("en"),

    # Database session
    session: SessionDep,
):
    """
    Endpoint using form data, headers, and cookies together.

    This pattern is useful for:
    - API key in header + form data
    - Session cookie + form submission
    - Locale preference + form content
    """
    # Validate API key
    if x_api_key != "valid-key":
        raise HTTPException(status_code=401, detail="Invalid API key")

    # Process submission with locale awareness
    return {
        "title": title,
        "content": content,
        "locale": locale,
        "has_session": session_id is not None,
        "user_agent": user_agent,
    }
```

## HTTP Basic Authentication

```python
# api/routers/basic_auth.py
"""HTTP Basic Authentication."""

import secrets
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBasic, HTTPBasicCredentials

router = APIRouter(prefix="/basic", tags=["basic-auth"])

security = HTTPBasic()


def verify_credentials(credentials: HTTPBasicCredentials = Depends(security)):
    """
    Verify HTTP Basic credentials.

    Browser will show login dialog automatically.
    """
    # Use secrets.compare_digest to prevent timing attacks
    correct_username = secrets.compare_digest(
        credentials.username.encode("utf8"),
        b"admin"
    )
    correct_password = secrets.compare_digest(
        credentials.password.encode("utf8"),
        b"secret"
    )

    if not (correct_username and correct_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
            headers={"WWW-Authenticate": "Basic"},
        )

    return credentials.username


@router.get("/protected")
async def basic_protected_endpoint(
    username: str = Depends(verify_credentials),
):
    """
    Endpoint protected by HTTP Basic Auth.

    Browser will prompt for username/password.

    curl example:
    ```bash
    curl -u admin:secret http://localhost:8000/setting/basic/protected
    ```
    """
    return {"message": f"Hello, {username}!"}
```

## Form Data Schemas

```python
# api/schemas/form_schema.py
"""Schemas for form-based endpoints."""

from typing import Optional
from pydantic import EmailStr
from api.schemas._base import CamelModel


class ContactFormData(CamelModel):
    """Contact form data (for documentation)."""
    name: str
    email: EmailStr
    message: str
    subscribe: bool = False


class ContactResponse(CamelModel):
    """Contact form response."""
    name: str
    email: str
    message: str
    subscribed: bool


class TokenResponse(CamelModel):
    """OAuth2 token response."""
    access_token: str
    refresh_token: Optional[str] = None
    token_type: str = "bearer"
    expires_in: Optional[int] = None
```

## Key Points

1. **Use `Form()` for HTML forms** - Not Pydantic models for form data
2. **OAuth2 requires form data** - `application/x-www-form-urlencoded`
3. **Headers are case-insensitive** - Use `alias` for proper names
4. **Secure cookies properly** - `httponly`, `secure`, `samesite`
5. **Combine sources freely** - Form, headers, cookies in one endpoint
6. **Validate early** - Use FastAPI's built-in validation
7. **HTTP Basic for simple auth** - Browser handles login dialog
