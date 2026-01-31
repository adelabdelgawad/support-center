"""
Chat file upload and download API endpoints.

Provides endpoints for managing non-image file attachments in chat messages.
Files are stored in MinIO with asynchronous upload via Celery.

**Key Features:**
- Async file upload with Celery (non-blocking)
- MinIO object storage integration
- Upload status tracking (pending, completed, failed)
- Temporary local storage during upload
- Corrupted file detection
- Download by ID or filename
- Per-request file listing
- File size limits and type validation
"""

import logging
from pathlib import Path
from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from db.database import get_session
from core.dependencies import get_current_user
from db.models import User
from api.schemas.chat_file import (
    ChatFileListItem,
    ChatFileRead,
    ChatFileUploadResponse,
)
from api.services.chat_file_service import ChatFileService

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/upload", response_model=ChatFileUploadResponse, status_code=201)
async def upload_chat_file(
    request_id: UUID,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Upload a chat file attachment (non-image).

    Uploads a document file and queues it for MinIO storage via Celery.
    Returns immediately with upload_status='pending'. For image files,
    use the /screenshots/upload endpoint instead.

    Args:
        request_id: Service request ID to associate file with
        file: File to upload (max 50MB, PDF, DOC, XLS, etc.)
        db: Database session
        current_user: Authenticated user

    Returns:
        ChatFileUploadResponse:
            - file: ChatFile record with metadata
            - upload_status: 'pending' or 'completed'
            - message: Status message

    Raises:
        HTTPException 400: Invalid file or validation error
        HTTPException 500: Upload failed

    **Permissions:** Authenticated users
    """
    try:
        chat_file = await ChatFileService.upload_file(
            db=db,
            request_id=request_id,
            user_id=current_user.id,
            file=file.file,
            filename=file.filename,
        )

        file_read = ChatFileRead(
            id=chat_file.id,
            request_id=chat_file.request_id,
            uploaded_by=chat_file.uploaded_by,
            original_filename=chat_file.original_filename,
            stored_filename=chat_file.stored_filename,
            file_size=chat_file.file_size,
            mime_type=chat_file.mime_type,
            minio_object_key=chat_file.minio_object_key,
            bucket_name=chat_file.bucket_name,
            celery_task_id=chat_file.celery_task_id,
            file_hash=chat_file.file_hash,
            upload_status=chat_file.upload_status,
            is_corrupted=chat_file.is_corrupted,
            created_at=chat_file.created_at,
            updated_at=chat_file.updated_at,
        )

        return ChatFileUploadResponse(
            file=file_read,
            upload_status=chat_file.upload_status,
            message=(
                "File uploaded successfully. MinIO upload in progress."
                if chat_file.upload_status == "pending"
                else "File uploaded and stored successfully."
            ),
        )

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Chat file upload failed: {e}")
        raise HTTPException(status_code=500, detail="File upload failed")


@router.get("/{file_id}", response_model=ChatFileRead)
async def get_chat_file_info(
    file_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Get chat file metadata by ID.

    Returns file information including upload status and metadata.

    Args:
        file_id: Chat file ID
        db: Database session
        current_user: Authenticated user

    Returns:
        ChatFileRead: File metadata

    Raises:
        HTTPException 404: File not found

    **Permissions:** Authenticated users
    """
    chat_file = await ChatFileService.get_file(db=db, file_id=file_id)

    if not chat_file:
        raise HTTPException(status_code=404, detail="File not found")

    return ChatFileRead(
        id=chat_file.id,
        request_id=chat_file.request_id,
        uploaded_by=chat_file.uploaded_by,
        original_filename=chat_file.original_filename,
        stored_filename=chat_file.stored_filename,
        file_size=chat_file.file_size,
        mime_type=chat_file.mime_type,
        minio_object_key=chat_file.minio_object_key,
        bucket_name=chat_file.bucket_name,
        celery_task_id=chat_file.celery_task_id,
        file_hash=chat_file.file_hash,
        upload_status=chat_file.upload_status,
        is_corrupted=chat_file.is_corrupted,
        created_at=chat_file.created_at,
        updated_at=chat_file.updated_at,
    )


@router.get("/{file_id}/download")
async def download_chat_file(
    file_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Download chat file by ID.

    Downloads file from temporary storage (if pending) or MinIO (if completed).

    Args:
        file_id: Chat file ID
        db: Database session
        current_user: Authenticated user

    Returns:
        Response: File content with MIME type and Content-Disposition

    Raises:
        HTTPException 404: File not found
        HTTPException 410: File is corrupted
        HTTPException 202: Upload still in progress

    **Permissions:** Authenticated users
    """
    chat_file = await ChatFileService.get_file(db=db, file_id=file_id)

    if not chat_file:
        raise HTTPException(status_code=404, detail="File not found")

    # Try to serve from temp storage first
    if chat_file.temp_local_path:
        temp_path = Path(chat_file.temp_local_path)
        if temp_path.exists():
            try:
                with open(temp_path, "rb") as f:
                    file_content = f.read()
                logger.info(
                    f"Serving chat file from temp storage: {temp_path} "
                    f"(upload_status={chat_file.upload_status})"
                )
                return Response(
                    content=file_content,
                    media_type=chat_file.mime_type,
                    headers={
                        "Content-Disposition": f'attachment; filename="{chat_file.original_filename}"',
                        "Cache-Control": "public, max-age=60",
                    },
                )
            except Exception as e:
                logger.warning(f"Failed to read from temp storage {temp_path}: {e}")

    # Check if corrupted
    if chat_file.is_corrupted and chat_file.upload_status == "failed":
        raise HTTPException(
            status_code=410,
            detail="File is corrupted and cannot be downloaded",
        )

    # Download from MinIO
    file_content = await ChatFileService.download_file(chat_file)

    if not file_content:
        await db.refresh(chat_file)
        if chat_file.is_corrupted or chat_file.upload_status == "failed":
            raise HTTPException(
                status_code=410,
                detail="File upload failed or file is corrupted",
            )
        elif chat_file.upload_status == "pending":
            raise HTTPException(
                status_code=202,
                detail="File upload is still in progress. Please try again later.",
            )
        else:
            raise HTTPException(
                status_code=404, detail="File not found in storage"
            )

    return Response(
        content=file_content,
        media_type=chat_file.mime_type,
        headers={
            "Content-Disposition": f'attachment; filename="{chat_file.original_filename}"',
            "Cache-Control": "public, max-age=3600",
        },
    )


@router.get("/by-filename/{filename}")
async def download_chat_file_by_filename(
    filename: str,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Download chat file by stored filename.

    This endpoint allows frontends to download files using the stored filename
    from chat messages, without needing to know the file ID.

    Args:
        filename: Stored filename (e.g., 'uuid.pdf')
        db: Database session
        current_user: Authenticated user

    Returns:
        Response: File content with MIME type and Content-Disposition

    Raises:
        HTTPException 404: File not found
        HTTPException 410: File is corrupted
        HTTPException 202: Upload still in progress

    **Permissions:** Authenticated users
    """
    chat_file = await ChatFileService.get_file_by_filename(db=db, stored_filename=filename)

    if not chat_file:
        raise HTTPException(status_code=404, detail="File not found")

    # Try to serve from temp storage first
    if chat_file.temp_local_path:
        temp_path = Path(chat_file.temp_local_path)
        if temp_path.exists():
            try:
                with open(temp_path, "rb") as f:
                    file_content = f.read()
                logger.info(
                    f"Serving chat file from temp storage: {temp_path}"
                )
                return Response(
                    content=file_content,
                    media_type=chat_file.mime_type,
                    headers={
                        "Content-Disposition": f'attachment; filename="{chat_file.original_filename}"',
                        "Cache-Control": "public, max-age=60",
                    },
                )
            except Exception as e:
                logger.warning(f"Failed to read from temp storage {temp_path}: {e}")

    # Check if corrupted
    if chat_file.is_corrupted and chat_file.upload_status == "failed":
        raise HTTPException(
            status_code=410,
            detail="File is corrupted and cannot be downloaded",
        )

    # Download from MinIO
    file_content = await ChatFileService.download_file(chat_file)

    if not file_content:
        await db.refresh(chat_file)
        if chat_file.is_corrupted or chat_file.upload_status == "failed":
            raise HTTPException(
                status_code=410,
                detail="File upload failed or file is corrupted",
            )
        elif chat_file.upload_status == "pending":
            raise HTTPException(
                status_code=202,
                detail="File upload is still in progress. Please try again later.",
            )
        else:
            raise HTTPException(
                status_code=404, detail="File not found in storage"
            )

    return Response(
        content=file_content,
        media_type=chat_file.mime_type,
        headers={
            "Content-Disposition": f'attachment; filename="{chat_file.original_filename}"',
            "Cache-Control": "public, max-age=3600",
        },
    )


@router.get("/request/{request_id}", response_model=List[ChatFileListItem])
async def get_request_chat_files(
    request_id: UUID,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Get all chat files for a service request.

    Returns list of file metadata sorted by creation date (newest first).

    Args:
        request_id: Service request ID
        db: Database session
        current_user: Authenticated user

    Returns:
        List[ChatFileListItem]: List of file metadata

    **Permissions:** Authenticated users
    """
    files = await ChatFileService.get_request_files(db=db, request_id=request_id)

    return [
        ChatFileListItem(
            id=f.id,
            original_filename=f.original_filename,
            stored_filename=f.stored_filename,
            file_size=f.file_size,
            mime_type=f.mime_type,
            upload_status=f.upload_status,
            is_corrupted=f.is_corrupted,
            created_at=f.created_at,
        )
        for f in files
    ]


@router.delete("/{file_id}", status_code=204)
async def delete_chat_file(
    file_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Delete a chat file and its stored files.

    Removes the file record from database and deletes the file from
    both MinIO (if uploaded) and temporary local storage (if pending).

    Args:
        file_id: Chat file ID
        db: Database session
        current_user: Authenticated user

    Returns:
        None (204 No Content)

    Raises:
        HTTPException 404: File not found

    **Permissions:** Authenticated users
    """
    success = await ChatFileService.delete_file(db=db, file_id=file_id)

    if not success:
        raise HTTPException(status_code=404, detail="File not found")

    return Response(status_code=204)
