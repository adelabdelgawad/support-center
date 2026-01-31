"""Service layer for Active Directory configuration management."""
import logging
from typing import List, Optional, Tuple
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from core.encryption import decrypt_value, encrypt_value
from crud import active_directory_config_crud as ad_crud
from crud import base_crud
from db.models import ActiveDirectoryConfig
from crud.organizational_unit_crud import OrganizationalUnitCRUD
from api.schemas.active_directory_config import (
    ActiveDirectoryConfigCreate,
    ActiveDirectoryConfigRead,
    ActiveDirectoryConfigUpdate,
    TestConnectionResponse,
)
from api.schemas.ou_tree import OUTreeNodeRead
from api.services.active_directory import ActiveDirectoryService, LdapService
from api.services.ou_tree_builder import build_ou_tree, domain_name_to_base_dn, OUTreeNode

logger = logging.getLogger(__name__)


class ActiveDirectoryConfigService:
    """Service for managing Active Directory configurations."""

    @staticmethod
    async def get_all_configs(
        db: AsyncSession,
        skip: int = 0,
        limit: int = 100,
    ) -> Tuple[List[ActiveDirectoryConfigRead], int]:
        """
        Get all AD configurations with pagination.

        Args:
            db: Database session
            skip: Number of records to skip
            limit: Maximum number of records to return

        Returns:
            Tuple of (list of configurations, total count)
        """
        # Convert skip/limit to page/per_page
        page = (skip // limit) + 1 if limit > 0 else 1
        per_page = limit if limit > 0 else 100

        configs, total = await base_crud.find_paginated(db, ActiveDirectoryConfig,
            db, page=page, per_page=per_page
        )

        # Convert to read schemas (excludes encrypted password)
        read_configs = [
            ActiveDirectoryConfigRead.from_model(config) for config in configs
        ]

        return read_configs, total

    @staticmethod
    async def get_config_by_id(
        db: AsyncSession, config_id: UUID
    ) -> Optional[ActiveDirectoryConfigRead]:
        """
        Get AD configuration by ID.

        Args:
            db: Database session
            config_id: Configuration ID

        Returns:
            Configuration or None if not found
        """
        config = await base_crud.find_by_id(db, ActiveDirectoryConfig, config_id)
        if not config:
            return None

        return ActiveDirectoryConfigRead.from_model(config)

    @staticmethod
    async def get_active_config(
        db: AsyncSession,
    ) -> Optional[ActiveDirectoryConfigRead]:
        """
        Get the currently active AD configuration.

        Args:
            db: Database session

        Returns:
            Active configuration or None if no active config exists
        """
        config = await ad_crud.get_active_config(db)
        if not config:
            return None

        return ActiveDirectoryConfigRead.from_model(config)

    @staticmethod
    async def create_config(
        db: AsyncSession, config_data: ActiveDirectoryConfigCreate
    ) -> ActiveDirectoryConfigRead:
        """
        Create a new AD configuration.

        Args:
            db: Database session
            config_data: Configuration data

        Returns:
            Created configuration
        """
        # If this is being set as active, deactivate all others first
        if config_data.is_active:
            await ad_crud.deactivate_all(db)

        # Encrypt the password before storing
        encrypted_password = encrypt_value(config_data.password)

        # Auto-compute base DN from domain name
        computed_base_dn = domain_name_to_base_dn(config_data.domain_name)

        # Create the config
        config_dict = config_data.model_dump(exclude={"password"})
        config_dict["encrypted_password"] = encrypted_password
        config_dict["base_dn"] = computed_base_dn  # Override with computed value

        config = await base_crud.create(db, ActiveDirectoryConfig, obj_in=config_dict)

        logger.info(f"Created AD configuration: {config.name} (ID: {config.id})")
        return ActiveDirectoryConfigRead.from_model(config)

    @staticmethod
    async def update_config(
        db: AsyncSession, config_id: UUID, config_data: ActiveDirectoryConfigUpdate
    ) -> Optional[ActiveDirectoryConfigRead]:
        """
        Update an AD configuration.

        Args:
            db: Database session
            config_id: Configuration ID
            config_data: Updated configuration data

        Returns:
            Updated configuration or None if not found
        """
        config = await base_crud.find_by_id(db, ActiveDirectoryConfig, config_id)
        if not config:
            return None

        # Prepare update data
        update_dict = config_data.model_dump(exclude_unset=True, exclude={"password"})

        # If activating this config, deactivate all others first
        if config_data.is_active and not config.is_active:
            await ad_crud.deactivate_all(db)

        # If password is being updated, encrypt it
        if config_data.password:
            update_dict["encrypted_password"] = encrypt_value(config_data.password)

        # If domain_name is being updated, recompute base_dn
        if config_data.domain_name:
            update_dict["base_dn"] = domain_name_to_base_dn(config_data.domain_name)

        # Update the config
        updated_config = await base_crud.update(
            db, db_obj=config, obj_in=update_dict
        )

        logger.info(f"Updated AD configuration: {updated_config.name} (ID: {config_id})")
        return ActiveDirectoryConfigRead.from_model(updated_config)

    @staticmethod
    async def delete_config(db: AsyncSession, config_id: UUID) -> bool:
        """
        Delete an AD configuration.

        Args:
            db: Database session
            config_id: Configuration ID

        Returns:
            True if deleted, False if not found
        """
        config = await base_crud.find_by_id(db, ActiveDirectoryConfig, config_id)
        if not config:
            return False

        # Don't allow deleting the active config
        if config.is_active:
            raise ValueError("Cannot delete the active AD configuration")

        await base_crud.delete(db, ActiveDirectoryConfig, id_value=config_id)

        logger.info(f"Deleted AD configuration: {config.name} (ID: {config_id})")
        return True

    @staticmethod
    async def test_connection(
        db: AsyncSession, config_id: UUID
    ) -> TestConnectionResponse:
        """
        Test connection to AD server using the specified configuration.

        Args:
            db: Database session
            config_id: Configuration ID to test

        Returns:
            Test result with success status and message
        """
        config = await base_crud.find_by_id(db, ActiveDirectoryConfig, config_id)
        if not config:
            return TestConnectionResponse(
                success=False, message="Configuration not found"
            )

        try:
            # Decrypt the password
            password = decrypt_value(config.encrypted_password)

            # Create a test AD service instance
            ad_service = ActiveDirectoryService(
                path=config.path,
                domain_name=config.domain_name,
                port=config.port,
                use_ssl=config.use_ssl,
                ldap_username=config.ldap_username,
                ldap_password=password,
                base_dn=config.base_dn,
            )

            # Test the connection
            result = await ad_service.test_connection()

            return TestConnectionResponse(
                success=result["success"],
                message=result["message"],
                details=result.get("details"),
            )

        except Exception as e:
            logger.error(f"Error testing AD connection: {e}")
            return TestConnectionResponse(
                success=False,
                message="Connection test failed",
                details=str(e),
            )

    @staticmethod
    async def get_ou_tree(
        db: AsyncSession, config_id: UUID
    ) -> List[OUTreeNodeRead]:
        """
        Fetch OU tree structure from Active Directory.

        Args:
            db: Database session
            config_id: Configuration ID

        Returns:
            List of root-level OU tree nodes with nested children

        Raises:
            ValueError: If configuration not found
        """
        # Get the AD configuration
        config = await base_crud.find_by_id(db, ActiveDirectoryConfig, config_id)
        if not config:
            raise ValueError(f"AD configuration {config_id} not found")

        # Create LDAP service instance
        ldap_service = LdapService(ad_config=config)

        try:
            # Fetch ALL OUs recursively using SUBTREE search
            all_ous = await ldap_service.fetch_all_ous_recursive()
            logger.info(f"Fetched {len(all_ous)} OUs from AD for tree building")

            # Get existing OU names from database
            existing_ous = await OrganizationalUnitCRUD.get_all(db)
            existing_ou_dns = {ou.ou_dn for ou in existing_ous if ou.ou_dn}

            # Build hierarchical tree structure
            tree_nodes = build_ou_tree(
                ou_list=all_ous,
                existing_ou_dns=existing_ou_dns,
                base_dn=config.base_dn
            )

            # Convert OUTreeNode (internal model) to OUTreeNodeRead (API schema)
            def convert_to_schema(node: OUTreeNode) -> OUTreeNodeRead:
                return OUTreeNodeRead(
                    ou_name=node.ou_name,
                    ou_dn=node.ou_dn,
                    children=[convert_to_schema(child) for child in node.children],
                    already_exists=node.already_exists,
                    user_count=node.user_count
                )

            schema_tree = [convert_to_schema(node) for node in tree_nodes]

            logger.info(f"Built OU tree with {len(schema_tree)} root nodes")
            return schema_tree

        except Exception as e:
            logger.error(f"Failed to fetch OU tree: {e}", exc_info=True)
            raise
