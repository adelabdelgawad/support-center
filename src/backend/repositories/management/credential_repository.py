from datetime import datetime
from typing import List, Optional
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID

from db.models import Credential
from repositories.base_repository import BaseRepository


class CredentialRepository(BaseRepository[Credential]):
    model = Credential

    @classmethod
    async def find_all(
        cls,
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
            stmt = stmt.where(Credential.enabled)

        result = await db.execute(stmt)
        credentials = result.scalars().all()

        return list(credentials)

    @classmethod
    async def find_vault_ref(
        cls,
        db: AsyncSession,
        credential_id: UUID,
    ) -> Optional[str]:
        """
        Get vault reference for a credential.

        Updates last_used_at timestamp when accessed.

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
        await db.flush()

        return credential.vault_ref

    @classmethod
    async def count(
        cls,
        db: AsyncSession,
        enabled_only: bool = True,
    ) -> int:
        """
        Count credentials.

        Args:
            db: Database session
            enabled_only: Only count enabled credentials

        Returns:
            Number of credentials
        """
        stmt = select(func.count(Credential.id))

        if enabled_only:
            stmt = stmt.where(Credential.enabled)

        result = await db.execute(stmt)
        return result.scalar() or 0
