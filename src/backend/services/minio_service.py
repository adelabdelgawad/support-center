"""
MinIO Object Storage Service

Provides file upload, download, deletion, and presigned URL generation
with automatic bucket creation and retry logic.
"""

import asyncio
import hashlib
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from io import BytesIO
from typing import AsyncGenerator, Optional
from uuid import UUID

from minio import Minio
from minio.error import S3Error
from urllib3.exceptions import MaxRetryError

from core.config import settings

logger = logging.getLogger(__name__)


class MinIOStorageService:
    """Service for managing files in MinIO object storage."""

    _client: Optional[Minio] = None
    _bucket_initialized: bool = False

    @classmethod
    def get_client(cls) -> Minio:
        """
        Get or create MinIO client instance (singleton pattern).

        Returns:
            Minio: Configured MinIO client
        """
        if cls._client is None:
            cls._client = Minio(
                endpoint=settings.minio.endpoint,
                access_key=settings.minio.access_key,
                secret_key=settings.minio.secret_key,
                secure=settings.minio.secure,
                region=settings.minio.region,
            )
            logger.info(f"MinIO client initialized: {settings.minio.endpoint}")

        return cls._client

    @classmethod
    async def ensure_bucket_exists(cls) -> None:
        """
        Ensure the configured bucket exists, create if it doesn't.
        Called on application startup.
        """
        if cls._bucket_initialized:
            return

        client = cls.get_client()
        bucket_name = settings.minio.bucket_name

        try:
            # Check if bucket exists
            if not client.bucket_exists(bucket_name):
                # Create bucket
                client.make_bucket(bucket_name, location=settings.minio.region)
                logger.info(f"Created MinIO bucket: {bucket_name}")
            else:
                logger.info(f"MinIO bucket already exists: {bucket_name}")

            cls._bucket_initialized = True

        except S3Error as e:
            logger.error(f"Failed to ensure bucket exists: {e}")
            raise

    @classmethod
    def build_object_key(
        cls, storage_type: str, request_id: UUID, filename: str
    ) -> str:
        """
        Build MinIO object key with organized prefix structure.

        Format: {type}/{year}/{month}/{uuid}_{filename}
        Example: attachments/2025/12/123e4567-e89b-12d3-a456-426614174000_document.pdf

        Args:
            storage_type: Type of storage (avatars, attachments, documents, tickets, screenshots)
            request_id: Service request UUID
            filename: Original or unique filename

        Returns:
            str: Object key path
        """
        now = datetime.now()
        year = now.strftime("%Y")
        month = now.strftime("%m")

        # Format: type/year/month/requestid_filename
        object_key = f"{storage_type}/{year}/{month}/{request_id}_{filename}"

        return object_key

    @classmethod
    def upload_file_sync(
        cls,
        object_key: str,
        content: bytes,
        content_type: str = "application/octet-stream",
        metadata: Optional[dict] = None,
    ) -> str:
        """
        Upload file to MinIO synchronously (for use in Celery tasks).

        Args:
            object_key: Object key (path in bucket)
            content: File content bytes
            content_type: MIME type
            metadata: Optional metadata dict

        Returns:
            str: Object key of uploaded file

        Raises:
            S3Error: If upload fails after retries
        """
        # Ensure bucket exists (sync operation)
        if not cls._bucket_initialized:
            client = cls.get_client()
            bucket_name = settings.minio.bucket_name
            if not client.bucket_exists(bucket_name):
                client.make_bucket(bucket_name, location=settings.minio.region)
                logger.info(f"Created MinIO bucket: {bucket_name}")
            cls._bucket_initialized = True

        client = cls.get_client()
        bucket_name = settings.minio.bucket_name

        # Convert bytes to BytesIO
        data = BytesIO(content)
        data_length = len(content)

        # Retry logic (without asyncio)
        import time
        for attempt in range(settings.minio.max_retries):
            try:
                client.put_object(
                    bucket_name=bucket_name,
                    object_name=object_key,
                    data=data,
                    length=data_length,
                    content_type=content_type,
                    metadata=metadata or {},
                )

                logger.info(
                    f"Uploaded file to MinIO: {bucket_name}/{object_key} "
                    f"({data_length} bytes, attempt {attempt + 1})"
                )

                return object_key

            except (S3Error, MaxRetryError) as e:
                if attempt < settings.minio.max_retries - 1:
                    wait_time = settings.minio.retry_backoff_factor ** attempt
                    logger.warning(
                        f"Upload failed (attempt {attempt + 1}), "
                        f"retrying in {wait_time}s: {e}"
                    )
                    time.sleep(wait_time)  # Use sync sleep instead of asyncio.sleep
                else:
                    logger.error(
                        f"Upload failed after {settings.minio.max_retries} attempts: {e}"
                    )
                    raise

            # Reset BytesIO position for retry
            data.seek(0)

        # Should not reach here, but for type safety
        raise RuntimeError("Upload failed unexpectedly")

    @classmethod
    async def upload_file(
        cls,
        object_key: str,
        content: bytes,
        content_type: str = "application/octet-stream",
        metadata: Optional[dict] = None,
    ) -> str:
        """
        Upload file to MinIO with retry logic.

        Args:
            object_key: Object key (path in bucket)
            content: File content bytes
            content_type: MIME type
            metadata: Optional metadata dict

        Returns:
            str: Object key of uploaded file

        Raises:
            S3Error: If upload fails after retries
        """
        await cls.ensure_bucket_exists()

        client = cls.get_client()
        bucket_name = settings.minio.bucket_name

        # Convert bytes to BytesIO
        data = BytesIO(content)
        data_length = len(content)

        # Retry logic
        for attempt in range(settings.minio.max_retries):
            try:
                client.put_object(
                    bucket_name=bucket_name,
                    object_name=object_key,
                    data=data,
                    length=data_length,
                    content_type=content_type,
                    metadata=metadata or {},
                )

                logger.info(
                    f"Uploaded file to MinIO: {bucket_name}/{object_key} "
                    f"({data_length} bytes, attempt {attempt + 1})"
                )

                return object_key

            except (S3Error, MaxRetryError) as e:
                if attempt < settings.minio.max_retries - 1:
                    wait_time = settings.minio.retry_backoff_factor**attempt
                    logger.warning(
                        f"Upload failed (attempt {attempt + 1}), "
                        f"retrying in {wait_time}s: {e}"
                    )
                    await asyncio.sleep(wait_time)
                else:
                    logger.error(
                        f"Upload failed after {settings.minio.max_retries} attempts: {e}"
                    )
                    raise

            # Reset BytesIO position for retry
            data.seek(0)

    @classmethod
    def download_file_sync(cls, object_key: str) -> Optional[bytes]:
        """
        Download file from MinIO synchronously (for use in Celery tasks).

        Args:
            object_key: Object key (path in bucket)

        Returns:
            bytes: File content or None if not found
        """
        client = cls.get_client()
        bucket_name = settings.minio.bucket_name

        # Retry logic (without asyncio)
        import time
        for attempt in range(settings.minio.max_retries):
            try:
                response = client.get_object(bucket_name, object_key)
                content = response.read()
                response.close()
                response.release_conn()

                logger.info(
                    f"Downloaded file from MinIO: {bucket_name}/{object_key} "
                    f"({len(content)} bytes)"
                )

                return content

            except S3Error as e:
                if e.code == "NoSuchKey":
                    logger.warning(
                        f"File not found in MinIO: {bucket_name}/{object_key}"
                    )
                    return None

                if attempt < settings.minio.max_retries - 1:
                    wait_time = settings.minio.retry_backoff_factor ** attempt
                    logger.warning(
                        f"Download failed (attempt {attempt + 1}), "
                        f"retrying in {wait_time}s: {e}"
                    )
                    time.sleep(wait_time)  # Use sync sleep instead of asyncio.sleep
                else:
                    logger.error(
                        f"Download failed after {settings.minio.max_retries} attempts: {e}"
                    )
                    raise

        return None  # Should not reach here, but for type safety

    @classmethod
    async def download_file(cls, object_key: str) -> Optional[bytes]:
        """
        Download file from MinIO with retry logic.

        Args:
            object_key: Object key (path in bucket)

        Returns:
            bytes: File content or None if not found
        """
        client = cls.get_client()
        bucket_name = settings.minio.bucket_name

        # Retry logic
        for attempt in range(settings.minio.max_retries):
            try:
                response = client.get_object(bucket_name, object_key)
                content = response.read()
                response.close()
                response.release_conn()

                logger.info(
                    f"Downloaded file from MinIO: {bucket_name}/{object_key} "
                    f"({len(content)} bytes)"
                )

                return content

            except S3Error as e:
                if e.code == "NoSuchKey":
                    logger.warning(
                        f"File not found in MinIO: {bucket_name}/{object_key}"
                    )
                    return None

                if attempt < settings.minio.max_retries - 1:
                    wait_time = settings.minio.retry_backoff_factor**attempt
                    logger.warning(
                        f"Download failed (attempt {attempt + 1}), "
                        f"retrying in {wait_time}s: {e}"
                    )
                    await asyncio.sleep(wait_time)
                else:
                    logger.error(
                        f"Download failed after {settings.minio.max_retries} attempts: {e}"
                    )
                    raise

    @classmethod
    async def delete_file(cls, object_key: str) -> bool:
        """
        Delete file from MinIO.

        Args:
            object_key: Object key (path in bucket)

        Returns:
            bool: True if deleted, False if not found
        """
        client = cls.get_client()
        bucket_name = settings.minio.bucket_name

        try:
            client.remove_object(bucket_name, object_key)
            logger.info(f"Deleted file from MinIO: {bucket_name}/{object_key}")
            return True

        except S3Error as e:
            if e.code == "NoSuchKey":
                logger.warning(
                    f"File not found for deletion: {bucket_name}/{object_key}"
                )
                return False

            logger.error(f"Failed to delete file: {e}")
            raise

    @classmethod
    def generate_presigned_url(
        cls, object_key: str, expiry_seconds: Optional[int] = None
    ) -> str:
        """
        Generate presigned URL for file download.

        Args:
            object_key: Object key (path in bucket)
            expiry_seconds: URL expiry time (default: from config)

        Returns:
            str: Presigned download URL
        """
        client = cls.get_client()
        bucket_name = settings.minio.bucket_name

        expiry = expiry_seconds or settings.minio.presigned_url_expiry_seconds

        try:
            url = client.presigned_get_object(
                bucket_name, object_key, expires=timedelta(seconds=expiry)
            )

            logger.debug(
                f"Generated presigned URL for {bucket_name}/{object_key} "
                f"(expires in {expiry}s)"
            )

            return url

        except S3Error as e:
            logger.error(f"Failed to generate presigned URL: {e}")
            raise

    @classmethod
    async def file_exists(cls, object_key: str) -> bool:
        """
        Check if file exists in MinIO.

        Args:
            object_key: Object key (path in bucket)

        Returns:
            bool: True if exists, False otherwise
        """
        client = cls.get_client()
        bucket_name = settings.minio.bucket_name

        try:
            client.stat_object(bucket_name, object_key)
            return True
        except S3Error as e:
            if e.code == "NoSuchKey":
                return False
            raise

    @classmethod
    async def health_check(cls) -> bool:
        """
        Perform MinIO health check.

        Returns:
            bool: True if healthy, False otherwise
        """
        try:
            await cls.ensure_bucket_exists()
            client = cls.get_client()

            # Test bucket access
            client.bucket_exists(settings.minio.bucket_name)

            logger.info("MinIO health check passed")
            return True

        except Exception as e:
            logger.error(f"MinIO health check failed: {e}")
            return False
