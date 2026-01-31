"""
File upload API endpoints with MinIO storage and Celery async uploads.

Provides endpoints for managing file attachments (screenshots and documents)
for service requests. Files are stored in MinIO with asynchronous upload
via Celery to avoid blocking API responses.

**Key Features:**
- Async file upload with Celery (non-blocking)
- Screenshot upload with auto-compression
- MinIO object storage integration
- Presigned URL downloads (302 redirect)
- Direct streaming downloads
- Upload status tracking
- Stuck upload detection and recovery
- Corrupted file handling
- Thumbnail generation for images
"""

from typing import List, Optional
from uuid import UUID

from celery.result import AsyncResult
from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    Query,
    Response,
    UploadFile,
)
from sqlalchemy.ext.asyncio import AsyncSession

from celery_app import celery_app
from db.database import get_session
from core.dependencies import get_current_user, require_technician
from db import User
from api.schemas import ScreenshotRead
from api.services.file_service import FileService

router = APIRouter()


@router.post("/upload", response_model=ScreenshotRead, status_code=202)
async def upload_file(
    request_id: UUID,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Upload a file attachment (async with Celery).

    Uploads a file and queues it for MinIO storage via Celery.
    Returns immediately with 202 Accepted. Images are automatically compressed.

    Args:
        request_id: Service request ID
        file: File to upload (max configured size)
        db: Database session
        current_user: Authenticated user

    Returns:
        ScreenshotRead: Attachment record with upload_status='pending'
            and celery_task_id for tracking

    Raises:
        HTTPException 400: Invalid file or validation error
        HTTPException 500: Upload failed

    **Permissions:** Authenticated users
    """
    try:
        attachment = await FileService.upload_file(
            db=db,
            request_id=request_id,
            user_id=current_user.id,
            file=file.file,
            filename=file.filename,
        )
        return attachment
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        raise HTTPException(status_code=500, detail="File upload failed")


@router.get("/stuck", response_model=List[ScreenshotRead])
async def get_stuck_attachments(
    db: AsyncSession = Depends(get_session),
    minutes_threshold: int = Query(5, description="Consider uploads stuck after this many minutes"),
    current_user: User = Depends(require_technician),
):
    """
    Admin endpoint: List all attachments stuck in pending status.

    Returns attachments that have been in 'pending' status for longer than
    the specified threshold. Useful for monitoring and recovery operations.

    Args:
        db: Database session
        minutes_threshold: Minutes in pending before considering stuck (default: 5)
        current_user: Authenticated technician

    Returns:
        List[ScreenshotRead]: Stuck attachments

    **Permissions:** Technicians and above
    """
    from datetime import datetime, timedelta
    from sqlalchemy import select
    from db import Screenshot

    # Use naive datetime since database stores naive timestamps
    threshold_time = datetime.utcnow() - timedelta(minutes=minutes_threshold)

    stmt = (
        select(Screenshot)
        .where(Screenshot.upload_status == "pending")
        .where(Screenshot.created_at < threshold_time)
        .order_by(Screenshot.created_at.asc())
    )

    result = await db.execute(stmt)
    stuck_attachments = result.scalars().all()

    return stuck_attachments


@router.get("/request/{request_id}", response_model=List[ScreenshotRead])
async def get_request_attachments(
    request_id: UUID,
    db: AsyncSession = Depends(get_session),
):
    """
    Get all attachments for a request.

    Returns all file attachments associated with a service request.

    Args:
        request_id: Service request ID
        db: Database session

    Returns:
        List[ScreenshotRead]: List of attachments

    **Permissions:** No authentication required
    """
    return await FileService.get_request_attachments(
        db=db, request_id=request_id
    )


@router.get("/{attachment_id}", response_model=ScreenshotRead)
async def get_attachment_info(
    attachment_id: int, db: AsyncSession = Depends(get_session)
):
    """
    Get attachment metadata.

    Returns attachment information including upload status.

    Args:
        attachment_id: Attachment ID
        db: Database session

    Returns:
        ScreenshotRead: Attachment metadata

    Raises:
        HTTPException 404: Screenshot not found

    **Permissions:** No authentication required
    """
    attachment = await FileService.get_attachment(
        db=db, attachment_id=attachment_id
    )

    if not attachment:
        raise HTTPException(status_code=404, detail="Screenshot not found")

    return attachment


@router.get("/{attachment_id}/download")
async def download_file(
    attachment_id: int,
    thumbnail: bool = Query(False, description="Download thumbnail instead of full file"),
    use_presigned: bool = Query(True, description="Use presigned URL redirect (default: true)"),
    expiry_seconds: Optional[int] = Query(None, description="Presigned URL expiry time in seconds"),
    db: AsyncSession = Depends(get_session),
):
    """
    Download an attachment file from MinIO storage.

    Two modes:
    1. **Presigned URL (default)**: Returns 302 redirect to MinIO presigned URL
       (offloads download bandwidth from backend)
    2. **Direct stream**: Returns file content directly (use_presigned=false)

    Args:
        attachment_id: Attachment ID
        thumbnail: Download thumbnail instead of full file (images only)
        use_presigned: Use presigned URL redirect (default: true)
        expiry_seconds: Custom expiry time for presigned URL (default: 24 hours)
        db: Database session

    Returns:
        Response: 302 redirect to MinIO or file content

    Raises:
        HTTPException 404: Screenshot record doesn't exist
        HTTPException 410: File is corrupted or upload failed
        HTTPException 425: File upload still in progress
        HTTPException 503: Upload appears stuck

    **Permissions:** No authentication required
    """
    attachment = await FileService.get_attachment(
        db=db, attachment_id=attachment_id
    )

    if not attachment:
        raise HTTPException(
            status_code=404,
            detail="Screenshot not found"
        )

    # Check if file is already flagged as corrupted
    if attachment.is_corrupted:
        raise HTTPException(
            status_code=410,  # 410 Gone - resource permanently unavailable
            detail="File is corrupted and cannot be downloaded",
        )

    # Check upload status
    if attachment.upload_status == "pending":
        # Check if upload is stuck (created more than 5 minutes ago)
        from datetime import datetime, timedelta

        # Use naive datetime since database stores naive timestamps
        time_since_creation = datetime.utcnow() - attachment.created_at

        if time_since_creation > timedelta(minutes=5):
            # Upload is likely stuck - provide helpful error
            raise HTTPException(
                status_code=503,  # 503 Service Unavailable
                detail={
                    "message": "File upload appears to be stuck",
                    "attachment_id": attachment_id,
                    "filename": attachment.filename,
                    "created_at": attachment.created_at.isoformat(),
                    "time_elapsed_minutes": int(time_since_creation.total_seconds() / 60),
                    "celery_task_id": attachment.celery_task_id,
                    "suggestion": "The upload task may have failed. Please check Celery worker logs or contact support. You can check the task status at /api/v1/files/tasks/{task_id}"
                }
            )
        else:
            # Upload is recent and likely still in progress
            raise HTTPException(
                status_code=425,  # 425 Too Early
                detail={
                    "message": "File upload is still in progress",
                    "attachment_id": attachment_id,
                    "filename": attachment.filename,
                    "celery_task_id": attachment.celery_task_id,
                    "suggestion": "Please wait a few moments and try again. Check upload status at /api/v1/files/tasks/{task_id}"
                }
            )

    elif attachment.upload_status == "failed":
        raise HTTPException(
            status_code=410,
            detail={
                "message": "File upload failed and file is not available",
                "attachment_id": attachment_id,
                "filename": attachment.filename,
                "celery_task_id": attachment.celery_task_id,
                "suggestion": "Please re-upload the file"
            }
        )

    if use_presigned:
        # Default: Redirect to presigned URL (offload download from backend)
        presigned_url = await FileService.get_presigned_download_url(
            attachment, thumbnail=thumbnail, expiry_seconds=expiry_seconds
        )

        if not presigned_url:
            raise HTTPException(
                status_code=404,
                detail="File not found in storage",
            )

        return Response(
            status_code=302,
            headers={"Location": presigned_url},
        )
    else:
        # Stream file directly (legacy mode)
        file_content = await FileService.download_file_from_minio(
            attachment, thumbnail=thumbnail, db=db
        )

        if not file_content:
            # Refresh attachment to check if it was just flagged as corrupted
            await db.refresh(attachment)
            if attachment.is_corrupted:
                raise HTTPException(
                    status_code=410,
                    detail="File is corrupted and cannot be downloaded",
                )
            raise HTTPException(
                status_code=404, detail="File not found in storage"
            )

        return Response(
            content=file_content,
            media_type=attachment.mime_type,
            headers={
                "Content-Disposition": f'attachment; filename="{attachment.filename}"'
            },
        )


@router.get("/tasks/{task_id}")
async def get_task_status(task_id: str):
    """
    Get Celery task status for file upload.

    Returns the current state of an async file upload task and its result
    if completed.

    Args:
        task_id: Celery task ID

    Returns:
        Dict with keys:
            - task_id: Task ID
            - state: Task state (PENDING, STARTED, SUCCESS, FAILURE, etc.)
            - ready: Whether task has completed
            - result: Task result if successful
            - error: Error message if failed

    **Permissions:** No authentication required
    """
    task = AsyncResult(task_id, app=celery_app)

    response = {
        "task_id": task_id,
        "state": task.state,
        "ready": task.ready(),
    }

    if task.ready():
        if task.successful():
            response["result"] = task.result
        else:
            response["error"] = str(task.info)

    return response


@router.delete("/{attachment_id}", status_code=204)
async def delete_attachment(
    attachment_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_technician),
):
    """
    Delete an attachment and its files from MinIO.

    Removes the attachment record and dispatches an async Celery task to
    delete files from MinIO. Returns immediately.

    Args:
        attachment_id: Attachment ID
        db: Database session
        current_user: Authenticated technician

    Returns:
        None (204 No Content)

    Raises:
        HTTPException 404: Screenshot not found

    **Permissions:** Technicians and above
    """
    success = await FileService.delete_attachment(
        db=db, attachment_id=attachment_id
    )

    if not success:
        raise HTTPException(status_code=404, detail="Screenshot not found")

    return Response(status_code=204)


@router.post("/screenshot/upload", status_code=201)
async def upload_screenshot(
    request_id: UUID,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Upload a screenshot for a chat message.

    Uploads a screenshot image directly (synchronously) and returns the
    MinIO object key to be stored in ChatMessage.screenshot_file_name.

    Args:
        request_id: Service request ID
        file: Screenshot image file (max configured size, images only)
        db: Database session
        current_user: Authenticated user

    Returns:
        Dict with key:
            - screenshot_path: MinIO object key

    Raises:
        HTTPException 400: Invalid file or validation error
        HTTPException 500: Upload failed

    **Permissions:** Authenticated users
    """
    try:
        object_key = await FileService.upload_screenshot(
            db=db,
            request_id=request_id,
            file=file.file,
            filename=file.filename,
        )
        return {"screenshot_path": object_key}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        raise HTTPException(status_code=500, detail="Screenshot upload failed")


@router.get("/screenshot/download")
async def download_screenshot(screenshot_path: str):
    """
    Download a screenshot from MinIO storage.

    Downloads a screenshot by its MinIO object key. Screenshots are
    stored as compressed JPEG images.

    Args:
        screenshot_path: MinIO object key (e.g., screenshots/2025/12/uuid_filename.jpg)

    Returns:
        Response: Image content with MIME type

    Raises:
        HTTPException 404: Screenshot not found in storage

    **Permissions:** No authentication required
    """
    screenshot_content = await FileService.download_screenshot(screenshot_path)

    if not screenshot_content:
        raise HTTPException(
            status_code=404, detail="Screenshot not found in storage"
        )

    return Response(
        content=screenshot_content,
        media_type="image/jpeg",  # Screenshots are compressed to JPEG
        headers={"Content-Disposition": 'inline; filename="screenshot.jpg"'},
    )


@router.post("/{attachment_id}/mark-failed", status_code=200)
async def mark_attachment_failed(
    attachment_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_technician),
):
    """
    Admin endpoint: Mark a stuck upload as failed.

    Use this when a file upload is stuck in 'pending' status and the Celery
    task has failed or never started. This allows users to re-upload the file.

    Args:
        attachment_id: Attachment ID
        db: Database session
        current_user: Authenticated technician

    Returns:
        Dict with keys:
            - message: Success message
            - attachment_id: Attachment ID
            - filename: Original filename
            - old_status: Previous status
            - new_status: New status ('failed')
            - celery_task_id: Celery task ID

    Raises:
        HTTPException 400: Attachment not in pending status
        HTTPException 404: Screenshot not found

    **Permissions:** Technicians and above
    """
    from sqlalchemy import update

    # Check if attachment exists
    attachment = await FileService.get_attachment(db=db, attachment_id=attachment_id)

    if not attachment:
        raise HTTPException(status_code=404, detail="Screenshot not found")

    # Only allow marking pending uploads as failed
    if attachment.upload_status != "pending":
        raise HTTPException(
            status_code=400,
            detail=f"Screenshot is not in pending status (current: {attachment.upload_status})"
        )

    # Update status to failed
    from db import Screenshot
    stmt = (
        update(Screenshot)
        .where(Screenshot.id == attachment_id)
        .values(upload_status="failed")
    )
    await db.execute(stmt)
    await db.commit()

    # Refresh to get updated data
    await db.refresh(attachment)

    return {
        "message": "Screenshot marked as failed",
        "attachment_id": attachment_id,
        "filename": attachment.filename,
        "old_status": "pending",
        "new_status": "failed",
        "celery_task_id": attachment.celery_task_id,
    }
