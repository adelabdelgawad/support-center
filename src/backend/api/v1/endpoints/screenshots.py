"""
Screenshot upload and download API endpoints.

Screenshots are stored as Attachments with storage_type='screenshot'.
Uses Celery for asynchronous MinIO uploads.
"""

from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_session
from core.dependencies import get_current_user
from models.database_models import User
from schemas.screenshot import (
    ScreenshotListItem,
    ScreenshotRead,
    ScreenshotUploadResponse,
)
from services.screenshot_service import ScreenshotService

router = APIRouter()


@router.post("/upload", response_model=ScreenshotUploadResponse, status_code=201)
async def upload_screenshot(
    request_id: UUID,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Upload a screenshot.

    - **request_id**: Service request ID to associate screenshot with
    - **file**: Screenshot image file (max 50MB, images only)

    Returns attachment record with upload_status='pending'.
    MinIO upload happens asynchronously via Celery.

    Screenshots are automatically compressed and resized to max 1920x1080.
    """
    try:
        attachment = await ScreenshotService.upload_screenshot(
            db=db,
            request_id=request_id,
            user_id=current_user.id,
            file=file.file,
            filename=file.filename,
        )

        # Convert Screenshot to ScreenshotRead
        screenshot = ScreenshotRead(
            id=attachment.id,
            request_id=attachment.request_id,
            uploaded_by=attachment.uploaded_by,
            filename=attachment.filename,
            file_size=attachment.file_size,
            mime_type=attachment.mime_type,
            minio_object_key=attachment.minio_object_key,
            upload_status=attachment.upload_status,
            file_hash=attachment.file_hash,
            is_corrupted=attachment.is_corrupted,
            created_at=attachment.created_at,
            updated_at=attachment.updated_at,
        )

        return ScreenshotUploadResponse(
            screenshot=screenshot,
            upload_status=attachment.upload_status,
            message=(
                "Screenshot uploaded successfully. MinIO upload in progress."
                if attachment.upload_status == "pending"
                else "Screenshot uploaded and stored successfully."
            ),
        )

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail="Screenshot upload failed")


@router.get("/{screenshot_id}", response_model=ScreenshotRead)
async def get_screenshot_info(
    screenshot_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Get screenshot metadata by ID.

    Returns attachment information including upload status.
    """
    screenshot = await ScreenshotService.get_screenshot(
        db=db, screenshot_id=screenshot_id
    )

    if not screenshot:
        raise HTTPException(status_code=404, detail="Screenshot not found")

    return ScreenshotRead(
        id=screenshot.id,
        request_id=screenshot.request_id,
        uploaded_by=screenshot.uploaded_by,
        filename=screenshot.filename,
        file_size=screenshot.file_size,
        mime_type=screenshot.mime_type,
        minio_object_key=screenshot.minio_object_key,
        upload_status=screenshot.upload_status,
        file_hash=screenshot.file_hash,
        is_corrupted=screenshot.is_corrupted,
        created_at=screenshot.created_at,
        updated_at=screenshot.updated_at,
    )


@router.get("/{screenshot_id}/download")
async def download_screenshot(
    screenshot_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Download screenshot file.

    - If upload_status='pending', downloads from temporary local storage
    - If upload_status='completed', downloads from MinIO storage
    - Returns 410 Gone if file is corrupted AND temp file unavailable

    Returns screenshot image with appropriate MIME type.
    """
    import logging
    from pathlib import Path

    logger = logging.getLogger(__name__)

    screenshot = await ScreenshotService.get_screenshot(
        db=db, screenshot_id=screenshot_id
    )

    if not screenshot:
        raise HTTPException(status_code=404, detail="Screenshot not found")

    # CRITICAL FIX: Try to serve from temp storage FIRST, even if marked as failed/corrupted
    # This ensures screenshots are always served if the temp file exists
    if screenshot.temp_local_path:
        temp_path = Path(screenshot.temp_local_path)
        if temp_path.exists():
            try:
                with open(temp_path, "rb") as f:
                    screenshot_content = f.read()
                logger.info(
                    f"Serving screenshot from temp storage: {temp_path} "
                    f"(upload_status={screenshot.upload_status}, is_corrupted={screenshot.is_corrupted})"
                )
                return Response(
                    content=screenshot_content,
                    media_type=screenshot.mime_type or "image/jpeg",
                    headers={
                        "Content-Disposition": f'inline; filename="{screenshot.filename}"',
                        "Cache-Control": "public, max-age=60",  # Shorter cache for temp files
                    },
                )
            except Exception as e:
                logger.warning(f"Failed to read from temp storage {temp_path}: {e}")

    # Check if corrupted (only after temp storage check)
    if screenshot.is_corrupted and screenshot.upload_status == "failed":
        raise HTTPException(
            status_code=410,  # 410 Gone - resource permanently unavailable
            detail="Screenshot is corrupted and cannot be downloaded",
        )

    # Download screenshot content from MinIO
    screenshot_content = await ScreenshotService.download_screenshot(screenshot)

    if not screenshot_content:
        # Check if upload failed
        await db.refresh(screenshot)
        if screenshot.is_corrupted or screenshot.upload_status == "failed":
            raise HTTPException(
                status_code=410,
                detail="Screenshot upload failed or file is corrupted",
            )
        elif screenshot.upload_status == "pending":
            raise HTTPException(
                status_code=202,  # 202 Accepted - still processing
                detail="Screenshot upload is still in progress. Please try again later.",
            )
        else:
            raise HTTPException(
                status_code=404, detail="Screenshot file not found in storage"
            )

    return Response(
        content=screenshot_content,
        media_type=screenshot.mime_type or "image/jpeg",
        headers={
            "Content-Disposition": f'inline; filename="{screenshot.filename}"',
            "Cache-Control": "public, max-age=3600",  # Cache for 1 hour
        },
    )


@router.get("/request/{request_id}", response_model=List[ScreenshotListItem])
async def get_request_screenshots(
    request_id: UUID,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Get all screenshots for a service request.

    Returns list of screenshot metadata sorted by creation date (newest first).
    """
    screenshots = await ScreenshotService.get_request_screenshots(
        db=db, request_id=request_id
    )

    return [
        ScreenshotListItem(
            id=s.id,
            filename=s.filename,
            file_size=s.file_size,
            mime_type=s.mime_type,
            upload_status=s.upload_status,
            is_corrupted=s.is_corrupted,
            created_at=s.created_at,
        )
        for s in screenshots
    ]


@router.get("/by-filename/{filename}")
async def download_screenshot_by_filename(
    filename: str,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Download screenshot by filename (used in ChatMessage.screenshot_file_name).

    This endpoint allows frontends to download screenshots using the filename
    stored in chat messages, without needing to know the screenshot ID.

    - **filename**: Screenshot filename (e.g., 'abc123.jpg')

    Returns screenshot image with appropriate MIME type.
    """
    import logging
    from pathlib import Path
    from sqlalchemy import select
    from models.database_models import Screenshot

    logger = logging.getLogger(__name__)

    # Find screenshot by filename (use LIMIT 1 to handle duplicates)
    # Order by created_at DESC to get the most recent one if duplicates exist
    stmt = (
        select(Screenshot)
        .where(Screenshot.filename == filename)
        .order_by(Screenshot.created_at.desc())
        .limit(1)
    )
    result = await db.execute(stmt)
    screenshot = result.scalar_one_or_none()

    if not screenshot:
        raise HTTPException(status_code=404, detail="Screenshot not found")

    # CRITICAL FIX: Try to serve from temp storage FIRST, even if marked as failed/corrupted
    # This ensures screenshots are always served if the temp file exists
    if screenshot.temp_local_path:
        temp_path = Path(screenshot.temp_local_path)
        if temp_path.exists():
            try:
                with open(temp_path, "rb") as f:
                    screenshot_content = f.read()
                logger.info(
                    f"Serving screenshot from temp storage: {temp_path} "
                    f"(upload_status={screenshot.upload_status}, is_corrupted={screenshot.is_corrupted})"
                )
                return Response(
                    content=screenshot_content,
                    media_type=screenshot.mime_type or "image/jpeg",
                    headers={
                        "Content-Disposition": f'inline; filename="{screenshot.filename}"',
                        "Cache-Control": "public, max-age=60",  # Shorter cache for temp files
                    },
                )
            except Exception as e:
                logger.warning(f"Failed to read from temp storage {temp_path}: {e}")

    # Check if corrupted (only after temp storage check)
    if screenshot.is_corrupted and screenshot.upload_status == "failed":
        raise HTTPException(
            status_code=410,
            detail="Screenshot is corrupted and cannot be downloaded",
        )

    # Download screenshot content from MinIO
    screenshot_content = await ScreenshotService.download_screenshot(screenshot)

    if not screenshot_content:
        # Check if upload failed
        await db.refresh(screenshot)
        if screenshot.is_corrupted or screenshot.upload_status == "failed":
            raise HTTPException(
                status_code=410,
                detail="Screenshot upload failed or file is corrupted",
            )
        elif screenshot.upload_status == "pending":
            raise HTTPException(
                status_code=202,
                detail="Screenshot upload is still in progress. Please try again later.",
            )
        else:
            raise HTTPException(
                status_code=404, detail="Screenshot file not found in storage"
            )

    return Response(
        content=screenshot_content,
        media_type=screenshot.mime_type or "image/jpeg",
        headers={
            "Content-Disposition": f'inline; filename="{screenshot.filename}"',
            "Cache-Control": "public, max-age=3600",
        },
    )


@router.delete("/{screenshot_id}", status_code=204)
async def delete_screenshot(
    screenshot_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Delete a screenshot and its files.

    Deletes:
    - Screenshot record from database
    - File from MinIO storage (if uploaded)
    - Temporary local file (if still pending)
    """
    from services.file_service import FileService

    success = await FileService.delete_attachment(db=db, attachment_id=screenshot_id)

    if not success:
        raise HTTPException(status_code=404, detail="Screenshot not found")

    return Response(status_code=204)


@router.post("/bulk-upload", response_model=List[ScreenshotUploadResponse])
async def bulk_upload_screenshots(
    request_id: UUID,
    files: List[UploadFile] = File(...),
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Upload multiple screenshots at once.

    - **request_id**: Service request ID
    - **files**: List of screenshot image files (max 10 files)

    Returns list of upload responses with upload status for each file.
    All uploads happen asynchronously via Celery.
    """
    if len(files) > 50:
        raise HTTPException(
            status_code=400, detail="Maximum 50 screenshots can be uploaded at once"
        )

    results = []

    for file in files:
        try:
            attachment = await ScreenshotService.upload_screenshot(
                db=db,
                request_id=request_id,
                user_id=current_user.id,
                file=file.file,
                filename=file.filename,
            )

            screenshot = ScreenshotRead(
                id=attachment.id,
                request_id=attachment.request_id,
                uploaded_by=attachment.uploaded_by,
                filename=attachment.filename,
                file_size=attachment.file_size,
                mime_type=attachment.mime_type,
                minio_object_key=attachment.minio_object_key,
                upload_status=attachment.upload_status,
                file_hash=attachment.file_hash,
                is_corrupted=attachment.is_corrupted,
                created_at=attachment.created_at,
                updated_at=attachment.updated_at,
            )

            results.append(
                ScreenshotUploadResponse(
                    screenshot=screenshot,
                    upload_status=attachment.upload_status,
                    message=f"Screenshot '{file.filename}' uploaded successfully.",
                )
            )

        except ValueError as e:
            # Continue with other files even if one fails
            results.append(
                ScreenshotUploadResponse(
                    screenshot=None,
                    upload_status="failed",
                    message=f"Failed to upload '{file.filename}': {str(e)}",
                )
            )

    return results
