# File Upload Pattern Reference

Handle file uploads with FastAPI using `UploadFile`, `File`, validation, and storage options.

## Key Principles

1. **Always validate file type** - Check `content_type` against allowed list
2. **Always validate file size** - Read contents and check length
3. **Use background tasks for processing** - Don't block requests
4. **Generate unique filenames** - Prevent overwrites and path traversal
5. **Support multiple storage backends** - Local, S3, MinIO

## Basic File Upload

```python
# api/routers/files.py
"""File upload endpoints."""

from fastapi import APIRouter, UploadFile, File, HTTPException, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession
import uuid
from pathlib import Path

from api.deps import get_session
from api.schemas.file_schemas import FileResponse
from api.services.file_service import FileService

router = APIRouter(prefix="/files", tags=["files"])

# Configuration
UPLOAD_DIR = Path("uploads")
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB
ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"]
ALLOWED_DOCUMENT_TYPES = ["application/pdf", "application/msword",
                          "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]


@router.post(
    "/upload",
    response_model=FileResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Upload a single file",
    description="Upload a file with validation for type and size.",
)
async def upload_file(
    file: UploadFile = File(..., description="File to upload"),
    session: SessionDep,
):
    """
    Upload a single file.

    - Validates file type against allowed list
    - Validates file size (max 10MB)
    - Generates unique filename
    - Stores file and returns metadata
    """
    # Validate file type
    if file.content_type not in ALLOWED_IMAGE_TYPES + ALLOWED_DOCUMENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File type '{file.content_type}' not allowed. "
                   f"Allowed types: {ALLOWED_IMAGE_TYPES + ALLOWED_DOCUMENT_TYPES}"
        )

    # Read and validate file size
    contents = await file.read()
    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File too large. Maximum size: {MAX_FILE_SIZE // (1024*1024)}MB"
        )

    # Reset file position for potential re-read
    await file.seek(0)

    # Generate unique filename
    extension = Path(file.filename).suffix
    unique_filename = f"{uuid.uuid4()}{extension}"

    # Save file
    service = FileService()
    saved_file = await service.save_file(
        session,
        filename=unique_filename,
        original_name=file.filename,
        content_type=file.content_type,
        size=len(contents),
        contents=contents,
    )

    return FileResponse.model_validate(saved_file)
```

## Multiple File Upload

```python
from typing import List

@router.post(
    "/upload/multiple",
    response_model=List[FileResponse],
    status_code=status.HTTP_201_CREATED,
)
async def upload_multiple_files(
    files: List[UploadFile] = File(..., description="Files to upload (max 10)"),
    session: SessionDep,
):
    """
    Upload multiple files at once.

    - Maximum 10 files per request
    - Each file validated independently
    - Returns list of uploaded file metadata
    """
    if len(files) > 10:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Maximum 10 files per upload"
        )

    service = FileService()
    results = []

    for file in files:
        # Validate each file
        if file.content_type not in ALLOWED_IMAGE_TYPES:
            continue  # Skip invalid files (or raise error)

        contents = await file.read()
        if len(contents) > MAX_FILE_SIZE:
            continue  # Skip oversized files

        extension = Path(file.filename).suffix
        unique_filename = f"{uuid.uuid4()}{extension}"

        saved_file = await service.save_file(
            session,
            filename=unique_filename,
            original_name=file.filename,
            content_type=file.content_type,
            size=len(contents),
            contents=contents,
        )
        results.append(FileResponse.model_validate(saved_file))

    return results
```

## File Upload with Form Data

```python
from fastapi import Form

@router.post(
    "/upload/with-metadata",
    response_model=FileResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_file_with_metadata(
    file: UploadFile = File(...),
    title: str = Form(..., max_length=100),
    description: str = Form(None, max_length=500),
    category_id: int = Form(...),
    session: SessionDep,
):
    """
    Upload file with additional form data.

    Combines file upload with structured metadata.
    """
    contents = await file.read()

    service = FileService()
    saved_file = await service.save_file_with_metadata(
        session,
        filename=f"{uuid.uuid4()}{Path(file.filename).suffix}",
        original_name=file.filename,
        content_type=file.content_type,
        size=len(contents),
        contents=contents,
        title=title,
        description=description,
        category_id=category_id,
    )

    return FileResponse.model_validate(saved_file)
```

## File Upload Service

```python
# api/services/file_service.py
"""File upload service with storage abstraction."""

from pathlib import Path
import aiofiles
from typing import Optional

from api.crud import files as files_crud
from core.exceptions import ValidationError


class FileService:
    """Service for file operations with storage abstraction."""

    def __init__(self):
        self.repository = FileRepository()
        self.upload_dir = Path("uploads")
        self.upload_dir.mkdir(parents=True, exist_ok=True)

    async def save_file(
        self,
        session,
        filename: str,
        original_name: str,
        content_type: str,
        size: int,
        contents: bytes,
    ):
        """Save file to local storage and create database record."""
        # Save to filesystem
        file_path = self.upload_dir / filename
        async with aiofiles.open(file_path, "wb") as f:
            await f.write(contents)

        # Create database record
        file_record = await self.repository.create(
            session,
            filename=filename,
            original_name=original_name,
            content_type=content_type,
            size=size,
            storage_path=str(file_path),
        )

        return file_record

    async def delete_file(self, session, file_id: int):
        """Delete file from storage and database."""
        file_record = await self.repository.get_by_id(session, file_id)

        # Delete from filesystem
        file_path = Path(file_record.storage_path)
        if file_path.exists():
            file_path.unlink()

        # Delete database record
        await self.repository.delete(session, file_id)
```

## S3 Storage Backend

```python
# api/services/s3_file_service.py
"""File service with S3 storage backend."""

import boto3
from botocore.exceptions import ClientError
from typing import Optional
import uuid

from core.config import settings


class S3FileService:
    """Service for file operations with S3 storage."""

    def __init__(self):
        self.s3_client = boto3.client(
            "s3",
            aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
            aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
            region_name=settings.AWS_REGION,
        )
        self.bucket_name = settings.S3_BUCKET_NAME

    async def upload_to_s3(
        self,
        file_contents: bytes,
        filename: str,
        content_type: str,
    ) -> str:
        """Upload file to S3 and return URL."""
        key = f"uploads/{uuid.uuid4()}/{filename}"

        try:
            self.s3_client.put_object(
                Bucket=self.bucket_name,
                Key=key,
                Body=file_contents,
                ContentType=content_type,
            )
        except ClientError as e:
            raise Exception(f"S3 upload failed: {e}")

        return f"https://{self.bucket_name}.s3.amazonaws.com/{key}"

    async def generate_presigned_url(
        self,
        key: str,
        expiration: int = 3600,
    ) -> str:
        """Generate presigned URL for secure file access."""
        try:
            url = self.s3_client.generate_presigned_url(
                "get_object",
                Params={"Bucket": self.bucket_name, "Key": key},
                ExpiresIn=expiration,
            )
            return url
        except ClientError as e:
            raise Exception(f"Failed to generate presigned URL: {e}")

    async def delete_from_s3(self, key: str):
        """Delete file from S3."""
        try:
            self.s3_client.delete_object(
                Bucket=self.bucket_name,
                Key=key,
            )
        except ClientError as e:
            raise Exception(f"S3 delete failed: {e}")
```

## File Upload Schemas

```python
# api/schemas/file_schema.py
"""File upload schemas."""

from datetime import datetime
from typing import Optional
from api.schemas._base import CamelModel


class FileBase(CamelModel):
    """Base file schema."""
    original_name: str
    content_type: str
    size: int


class FileCreate(FileBase):
    """Schema for file upload metadata."""
    title: Optional[str] = None
    description: Optional[str] = None
    category_id: Optional[int] = None


class FileResponse(FileBase):
    """File response schema."""
    id: int
    filename: str
    url: str
    title: Optional[str] = None
    description: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True
```

## File Model

```python
# db/models.py (add to existing models)

class UploadedFile(Base):
    """Uploaded file metadata."""
    __tablename__ = "uploaded_file"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    filename: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    original_name: Mapped[str] = mapped_column(String(255), nullable=False)
    content_type: Mapped[str] = mapped_column(String(100), nullable=False)
    size: Mapped[int] = mapped_column(Integer, nullable=False)
    storage_path: Mapped[str] = mapped_column(String(500), nullable=False)
    storage_backend: Mapped[str] = mapped_column(String(50), default="local")  # local, s3, minio

    # Optional metadata
    title: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    # Audit fields
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), onupdate=func.now())

    @property
    def url(self) -> str:
        """Generate file URL based on storage backend."""
        if self.storage_backend == "s3":
            return self.storage_path  # Already a URL
        return f"/setting/files/{self.id}/download"
```

## Security Considerations

```python
# IMPORTANT: Security patterns for file uploads

# 1. NEVER trust the filename from the client
original_filename = file.filename
safe_filename = f"{uuid.uuid4()}{Path(original_filename).suffix}"

# 2. Validate file extension matches content type
EXTENSION_CONTENT_TYPE_MAP = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".pdf": "application/pdf",
}

extension = Path(file.filename).suffix.lower()
expected_content_type = EXTENSION_CONTENT_TYPE_MAP.get(extension)
if expected_content_type and file.content_type != expected_content_type:
    raise HTTPException(400, "File extension does not match content type")

# 3. Scan files for malware (if critical)
# Consider integrating ClamAV or similar

# 4. Store files outside web root
# Never store in static/ or public/ directories

# 5. Use signed URLs for sensitive files
# Don't expose direct file paths

# 6. Rate limit uploads
from slowapi import Limiter
limiter = Limiter(key_func=get_remote_address)

@router.post("/upload")
@limiter.limit("10/minute")
async def upload_file(...): ...
```

## Key Points

1. **Always validate** - Check type, size, and extension
2. **Generate unique names** - Prevent overwrites and path traversal
3. **Abstract storage** - Support local, S3, MinIO backends
4. **Use async I/O** - `aiofiles` for non-blocking file operations
5. **Track metadata** - Store original name, type, size in database
6. **Secure downloads** - Use signed URLs or authenticated endpoints
7. **Rate limit** - Prevent upload abuse
