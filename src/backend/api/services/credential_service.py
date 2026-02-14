"""
Credential service for the Deployment Control Plane.

Handles credential metadata management. Actual secrets are stored
in an external vault - this service only manages metadata.
"""

import logging
from typing import List, Optional
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from core.decorators import (
    log_database_operation,
    safe_database_query,
    transactional_database_operation,
)
from db.models import Credential
from api.repositories.management.credential_repository import CredentialRepository
from api.schemas.credential import CredentialCreate, CredentialUpdate

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
        return await CredentialRepository.find_all(db, enabled_only)

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
        return await CredentialRepository.find_by_id(db, credential_id)

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
        credential_data = data.model_dump()
        credential_data["created_by"] = created_by
        credential = await CredentialRepository.create(
            db, obj_in=credential_data, commit=True
        )
        logger.info(
            f"Credential created: {credential.name} (type: {credential.credential_type})"
        )
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
        credential = await CredentialRepository.update(
            db,
            id_value=credential_id,
            obj_in=data.model_dump(exclude_unset=True),
            commit=True,
        )
        if credential:
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
        credential = await CredentialRepository.update(
            db, id_value=credential_id, obj_in={"enabled": False}, commit=True
        )
        if credential:
            logger.info(f"Credential disabled: {credential.name}")
            return True
        return False

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
        return await CredentialRepository.find_vault_ref(db, credential_id)

    @staticmethod
    @safe_database_query("count_credentials", default_return=0)
    async def count_credentials(
        db: AsyncSession,
        enabled_only: bool = True,
    ) -> int:
        """Count credentials."""
        return await CredentialRepository.count(db, enabled_only)
