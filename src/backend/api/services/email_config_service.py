"""Service layer for Email configuration management."""
import logging
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import List, Optional, Tuple
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from core.encryption import decrypt_value, encrypt_value
from crud import email_config_crud as email_crud
from crud import base_crud
from db.models import EmailConfig
from api.schemas.email_config import (
    EmailConfigCreate,
    EmailConfigRead,
    EmailConfigUpdate,
    TestEmailRequest,
    TestEmailResponse,
)

logger = logging.getLogger(__name__)


class EmailConfigService:
    """Service for managing Email configurations."""

    @staticmethod
    async def get_all_configs(
        db: AsyncSession,
        skip: int = 0,
        limit: int = 100,
    ) -> Tuple[List[EmailConfigRead], int]:
        """
        Get all email configurations with pagination.

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

        configs, total = await base_crud.find_paginated(db, EmailConfig,
            db, page=page, per_page=per_page
        )

        # Convert to read schemas (excludes encrypted password)
        read_configs = [EmailConfigRead.from_model(config) for config in configs]

        return read_configs, total

    @staticmethod
    async def get_config_by_id(
        db: AsyncSession, config_id: UUID
    ) -> Optional[EmailConfigRead]:
        """
        Get email configuration by ID.

        Args:
            db: Database session
            config_id: Configuration ID

        Returns:
            Configuration or None if not found
        """
        config = await base_crud.find_by_id(db, EmailConfig, config_id)
        if not config:
            return None

        return EmailConfigRead.from_model(config)

    @staticmethod
    async def get_active_config(
        db: AsyncSession,
    ) -> Optional[EmailConfigRead]:
        """
        Get the currently active email configuration.

        Args:
            db: Database session

        Returns:
            Active configuration or None if no active config exists
        """
        config = await email_crud.get_active_config(db)
        if not config:
            return None

        return EmailConfigRead.from_model(config)

    @staticmethod
    async def create_config(
        db: AsyncSession, config_data: EmailConfigCreate
    ) -> EmailConfigRead:
        """
        Create a new email configuration.

        Args:
            db: Database session
            config_data: Configuration data

        Returns:
            Created configuration

        Raises:
            ValueError: If encryption fails or config creation fails
        """
        try:
            # Encrypt the password
            encrypted_password = encrypt_value(config_data.password)

            # Prepare data for database (exclude password, add encrypted_password)
            config_dict = config_data.model_dump(exclude={"password"})
            config_dict["encrypted_password"] = encrypted_password

            # If this config is set to active, deactivate all others first
            if config_data.is_active:
                await email_crud.deactivate_all(db)

            # Create the configuration
            config = await base_crud.create(db, EmailConfig, obj_in=config_dict)

            return EmailConfigRead.from_model(config)

        except Exception as e:
            logger.error(f"Failed to create email configuration: {e}")
            raise ValueError(f"Failed to create email configuration: {str(e)}")

    @staticmethod
    async def update_config(
        db: AsyncSession, config_id: UUID, config_data: EmailConfigUpdate
    ) -> Optional[EmailConfigRead]:
        """
        Update an email configuration.

        Args:
            db: Database session
            config_id: Configuration ID
            config_data: Update data

        Returns:
            Updated configuration or None if not found

        Raises:
            ValueError: If encryption fails or update fails
        """
        try:
            # Get existing config
            config = await base_crud.find_by_id(db, EmailConfig, config_id)
            if not config:
                return None

            # Prepare update data
            update_dict = config_data.model_dump(exclude_unset=True, exclude={"password"})

            # Handle password update if provided
            if config_data.password:
                encrypted_password = encrypt_value(config_data.password)
                update_dict["encrypted_password"] = encrypted_password

            # If activating this config, deactivate all others first
            if config_data.is_active and not config.is_active:
                await email_crud.deactivate_all(db)

            # Update the configuration
            updated_config = await base_crud.update(db, EmailConfig, db_obj=config, obj_in=update_dict)
            if not updated_config:
                return None

            return EmailConfigRead.from_model(updated_config)

        except Exception as e:
            logger.error(f"Failed to update email configuration: {e}")
            raise ValueError(f"Failed to update email configuration: {str(e)}")

    @staticmethod
    async def delete_config(db: AsyncSession, config_id: UUID) -> bool:
        """
        Delete an email configuration.

        Args:
            db: Database session
            config_id: Configuration ID

        Returns:
            True if deleted, False if not found
        """
        config = await base_crud.find_by_id(db, EmailConfig, config_id)
        if not config:
            return False

        await base_crud.delete(db, EmailConfig, config_id)
        return True

    @staticmethod
    async def test_connection(
        db: AsyncSession, config_id: UUID, test_request: TestEmailRequest
    ) -> TestEmailResponse:
        """
        Test email configuration by sending a test email.

        Args:
            db: Database session
            config_id: Configuration ID to test
            test_request: Test request with recipient email

        Returns:
            Test result with success status and message
        """
        try:
            # Get the configuration
            config = await base_crud.find_by_id(db, EmailConfig, config_id)
            if not config:
                return TestEmailResponse(
                    success=False,
                    message="Configuration not found",
                )

            # Decrypt the password
            try:
                password = decrypt_value(config.encrypted_password)
            except Exception as e:
                logger.error(f"Failed to decrypt password: {e}")
                return TestEmailResponse(
                    success=False,
                    message="Failed to decrypt password",
                    details=str(e),
                )

            # Create test message
            msg = MIMEMultipart()
            msg["From"] = config.smtp_from
            msg["To"] = test_request.recipient
            msg["Subject"] = "Support Center - Email Configuration Test"

            body = f"""
This is a test email from the Support Center application.

Configuration: {config.name}
SMTP Server: {config.smtp_host}:{config.smtp_port}
TLS: {'Enabled' if config.smtp_tls else 'Disabled'}

If you received this message, your email configuration is working correctly.
"""
            msg.attach(MIMEText(body, "plain"))

            # Connect to SMTP server and send
            try:
                if config.smtp_tls:
                    # Use STARTTLS (typically port 587)
                    server = smtplib.SMTP(config.smtp_host, config.smtp_port, timeout=10)
                    server.starttls()
                else:
                    # Use regular connection or SSL (port 25 or 465)
                    if config.smtp_port == 465:
                        server = smtplib.SMTP_SSL(
                            config.smtp_host, config.smtp_port, timeout=10
                        )
                    else:
                        server = smtplib.SMTP(
                            config.smtp_host, config.smtp_port, timeout=10
                        )

                # Login if credentials provided
                if config.smtp_user and password:
                    server.login(config.smtp_user, password)

                # Send the email
                server.send_message(msg)
                server.quit()

                logger.info(
                    f"Test email sent successfully to {test_request.recipient} "
                    f"using config {config.name}"
                )

                return TestEmailResponse(
                    success=True,
                    message=f"Test email sent successfully to {test_request.recipient}",
                )

            except smtplib.SMTPAuthenticationError as e:
                logger.error(f"SMTP authentication failed: {e}")
                return TestEmailResponse(
                    success=False,
                    message="SMTP authentication failed",
                    details="Please check your username and password",
                )

            except smtplib.SMTPConnectError as e:
                logger.error(f"SMTP connection failed: {e}")
                return TestEmailResponse(
                    success=False,
                    message="Failed to connect to SMTP server",
                    details=f"Could not connect to {config.smtp_host}:{config.smtp_port}",
                )

            except Exception as e:
                logger.error(f"SMTP error: {e}")
                return TestEmailResponse(
                    success=False, message="Failed to send test email", details=str(e)
                )

        except Exception as e:
            logger.error(f"Test connection failed: {e}")
            return TestEmailResponse(
                success=False, message="Test failed", details=str(e)
            )
