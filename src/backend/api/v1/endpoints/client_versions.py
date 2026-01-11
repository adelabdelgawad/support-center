"""
Client Version API endpoints.

Provides CRUD operations for the version registry.
All write operations require admin privileges.
"""

from typing import List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Request, Response, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_session
from core.dependencies import require_admin
from models import User
from schemas.version import (
    ClientVersionCreate,
    ClientVersionListItem,
    ClientVersionRead,
    ClientVersionUpdate,
)
from services.client_version_service import ClientVersionService

router = APIRouter()


@router.get("", response_model=List[ClientVersionListItem])
async def list_client_versions(
    platform: Optional[str] = None,
    active_only: bool = True,
    db: AsyncSession = Depends(get_session),
):
    """
    List all client versions.

    - **platform**: Filter by platform (optional: 'desktop', 'web', 'mobile')
    - **active_only**: Only return active versions (default: true)

    Returns versions ordered by order_index descending (newest first).
    """
    versions = await ClientVersionService.list_versions(
        db=db,
        platform=platform,
        active_only=active_only,
    )
    return versions


@router.get("/{version_id}", response_model=ClientVersionRead)
async def get_client_version(
    version_id: int,
    db: AsyncSession = Depends(get_session),
):
    """Get a client version by ID."""
    version = await ClientVersionService.get_version(
        db=db,
        version_id=version_id,
    )

    if not version:
        raise HTTPException(status_code=404, detail="Version not found")

    return version


@router.post("", response_model=ClientVersionRead, status_code=201)
async def create_client_version(
    version_data: ClientVersionCreate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_admin),
):
    """
    Create a new client version (admin only).

    - **version_string**: Version string as reported by client (e.g., '1.0.0')
    - **platform**: Platform identifier ('desktop', 'web', 'mobile')
    - **order_index**: Server-defined order for comparison (higher = newer)
    - **is_latest**: Whether this is the current latest version for its platform
    - **is_enforced**: Whether outdated versions should show enforced update status
    - **is_active**: Whether this version entry is active in the registry
    - **release_notes**: Optional release notes or changelog
    - **released_at**: When this version was released

    If is_latest is True, the previous latest version for the platform
    will be automatically unset.
    """
    try:
        version = await ClientVersionService.create_version(
            db=db,
            version_data=version_data,
        )
        return version
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{version_id}", response_model=ClientVersionRead)
async def update_client_version(
    version_id: int,
    update_data: ClientVersionUpdate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_admin),
):
    """
    Update a client version (admin only).

    All fields are optional. Only provided fields will be updated.

    If is_latest is set to True, the previous latest version for the platform
    will be automatically unset.
    """
    version = await ClientVersionService.update_version(
        db=db,
        version_id=version_id,
        update_data=update_data,
    )

    if not version:
        raise HTTPException(status_code=404, detail="Version not found")

    return version


@router.post("/{version_id}/set-latest", response_model=ClientVersionRead)
async def set_as_latest_version(
    version_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_admin),
):
    """
    Set a version as the latest for its platform (admin only).

    This atomically:
    1. Unsets is_latest on all versions for the platform
    2. Sets is_latest on the specified version
    """
    version = await ClientVersionService.set_latest_version(
        db=db,
        version_id=version_id,
    )

    if not version:
        raise HTTPException(status_code=404, detail="Version not found")

    return version


@router.delete("/{version_id}", status_code=204)
async def delete_client_version(
    version_id: int,
    hard_delete: bool = False,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_admin),
):
    """
    Delete or deactivate a client version (admin only).

    - **hard_delete**: If True, permanently delete. If False (default),
      soft delete (set is_active=False)

    Soft delete is recommended to maintain audit trail.
    """
    success = await ClientVersionService.delete_version(
        db=db,
        version_id=version_id,
        hard_delete=hard_delete,
    )

    if not success:
        raise HTTPException(status_code=404, detail="Version not found")

    return None


# =============================================================================
# INSTALLER FILE ENDPOINTS
# =============================================================================


@router.post("/{version_id}/installer", response_model=ClientVersionRead)
async def upload_installer(
    version_id: int,
    request: Request,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_admin),
):
    """
    Upload installer file for a client version (admin only).

    - **file**: Installer file (.exe or .msi, max 50MB)

    The file is stored in MinIO and the download URL is updated
    to point to the backend download endpoint.

    Existing installers will be replaced.
    """
    # Build base URL from request
    # Check for X-Forwarded headers (reverse proxy)
    forwarded_proto = request.headers.get("x-forwarded-proto", "http")
    forwarded_host = request.headers.get("x-forwarded-host")

    if forwarded_host:
        base_url = f"{forwarded_proto}://{forwarded_host}"
    else:
        # Fallback to request URL
        base_url = str(request.base_url).rstrip("/")

    try:
        version = await ClientVersionService.upload_installer(
            db=db,
            version_id=version_id,
            file=file,
            base_url=base_url,
        )
        return version
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")


@router.get("/{version_id}/installer/download")
async def download_installer(
    version_id: int,
    db: AsyncSession = Depends(get_session),
):
    """
    Download installer file for a client version.

    This endpoint is PUBLIC (no authentication required) so that
    desktop clients can download installers during silent upgrades.

    Returns the installer file with appropriate Content-Disposition header.
    """
    result = await ClientVersionService.download_installer(
        db=db,
        version_id=version_id,
    )

    if not result:
        raise HTTPException(
            status_code=404,
            detail="Installer not found for this version"
        )

    content, filename, content_type = result

    return Response(
        content=content,
        media_type=content_type,
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Content-Length": str(len(content)),
        },
    )
