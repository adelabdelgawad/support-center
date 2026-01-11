"""
Credential service for the Deployment Control Plane.

Handles credential metadata management. Actual secrets are stored
in an external vault - this service only manages metadata.
"""
import logging
from datetime import datetime
from typing import List, Optional
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.decorators import (
    log_database_operation,
    safe_database_query,
    transactional_database_operation,
)
from models import Credential
from schemas.credential import CredentialCreate, CredentialUpdate

logger = logging.getLogger(__name__)


class CredentialService:
    """Service for managing credential metadata."""

    @staticmethod
    @safe_database_query("list_credentials", default_return=[])
    @log_database_operation("credential listing", level="debug")
    async def list_credentials(
        db: AsyncSession,
        enabled_only: bool = True,
    ) -> List[Credential]:
        """
        List credential metadata.

        Args:
            db: Database session
            enabled_only: Only return enabled credentials

        Returns:
            List of credentials (metadata only, no secrets)
        """
        stmt = select(Credential).order_by(Credential.name)

        if enabled_only:
            stmt = stmt.where(Credential.enabled == True)

        result = await db.execute(stmt)
        credentials = result.scalars().all()

        return list(credentials)

    @staticmethod
    @safe_database_query("get_credential")
    @log_database_operation("credential retrieval", level="debug")
    async def get_credential(
        db: AsyncSession,
        credential_id: UUID,
    ) -> Optional[Credential]:
        """
        Get a credential by ID.

        Args:
            db: Database session
            credential_id: Credential UUID

        Returns:
            Credential or None
        """
        stmt = select(Credential).where(Credential.id == credential_id)
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    @staticmethod
    @transactional_database_operation("create_credential")
    @log_database_operation("credential creation", level="info")
    async def create_credential(
        db: AsyncSession,
        data: CredentialCreate,
        created_by: Optional[UUID] = None,
    ) -> Credential:
        """
        Create a new credential.

        Args:
            db: Database session
            data: Credential creation data
            created_by: User who created the credential

        Returns:
            Created credential
        """
        credential = Credential(
            **data.model_dump(),
            created_by=created_by,
        )
        db.add(credential)
        await db.commit()
        await db.refresh(credential)

        logger.info(f"Credential created: {credential.name} (type: {credential.credential_type})")
        return credential

    @staticmethod
    @transactional_database_operation("update_credential")
    @log_database_operation("credential update", level="info")
    async def update_credential(
        db: AsyncSession,
        credential_id: UUID,
        data: CredentialUpdate,
    ) -> Optional[Credential]:
        """
        Update a credential.

        Args:
            db: Database session
            credential_id: Credential UUID
            data: Update data

        Returns:
            Updated credential or None
        """
        stmt = select(Credential).where(Credential.id == credential_id)
        result = await db.execute(stmt)
        credential = result.scalar_one_or_none()

        if not credential:
            return None

        update_dict = data.model_dump(exclude_unset=True)
        for field, value in update_dict.items():
            setattr(credential, field, value)

        await db.commit()
        await db.refresh(credential)

        logger.info(f"Credential updated: {credential.name}")
        return credential

    @staticmethod
    @transactional_database_operation("delete_credential")
    @log_database_operation("credential deletion", level="info")
    async def delete_credential(
        db: AsyncSession,
        credential_id: UUID,
    ) -> bool:
        """
        Soft delete a credential (disable it).

        Args:
            db: Database session
            credential_id: Credential UUID

        Returns:
            True if deleted, False if not found
        """
        stmt = select(Credential).where(Credential.id == credential_id)
        result = await db.execute(stmt)
        credential = result.scalar_one_or_none()

        if not credential:
            return False

        credential.enabled = False
        await db.commit()

        logger.info(f"Credential disabled: {credential.name}")
        return True

    @staticmethod
    @safe_database_query("get_vault_ref")
    async def get_vault_ref(
        db: AsyncSession,
        credential_id: UUID,
    ) -> Optional[str]:
        """
        Get vault reference for a credential.

        SECURITY: This method is for internal worker API only.
        Never expose vault_ref to the frontend.

        Args:
            db: Database session
            credential_id: Credential UUID

        Returns:
            Vault reference string or None
        """
        stmt = select(Credential).where(Credential.id == credential_id)
        result = await db.execute(stmt)
        credential = result.scalar_one_or_none()

        if not credential or not credential.enabled:
            return None

        # Update last_used_at timestamp
        credential.last_used_at = datetime.utcnow()
        await db.commit()

        return credential.vault_ref

    @staticmethod
    @safe_database_query("count_credentials", default_return=0)
    async def count_credentials(
        db: AsyncSession,
        enabled_only: bool = True,
    ) -> int:
        """Count credentials."""
        from sqlalchemy import func

        stmt = select(func.count(Credential.id))

        if enabled_only:
            stmt = stmt.where(Credential.enabled == True)

        result = await db.execute(stmt)
        return result.scalar() or 0
