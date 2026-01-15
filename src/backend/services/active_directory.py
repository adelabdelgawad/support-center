"""
Active Directory / LDAP Service for user authentication and data retrieval.

Provides methods to:
- Authenticate users against Active Directory
- Fetch user details (email, full_name, phone_number, manager)
- Parse manager DN to extract username

Uses ldap3 library with async support via asyncio.to_thread()
"""

import asyncio
import logging
import re
from typing import List, Optional, Tuple
from functools import partial

from ldap3 import Server, Connection, ALL, SUBTREE, LEVEL, BASE
from ldap3.core.exceptions import LDAPException, LDAPBindError, LDAPSocketOpenError

from core.config import settings
from schemas.user.domain_user import DomainUser

# Module-level logger
logger = logging.getLogger(__name__)


class LdapService:
    OU_FILTER = "(objectClass=organizationalUnit)"
    USER_FILTER = (
        "(&(objectCategory=Person)(objectClass=User)"
        "(!(userAccountControl:1.2.840.113556.1.4.803:=2)))"
    )
    USER_ATTRS = [
        "sAMAccountName",
        "displayName",
        "mail",
        "title",
        "physicalDeliveryOfficeName",
    ]
    # Extended attributes for user details
    USER_DETAIL_ATTRS = [
        "sAMAccountName",
        "displayName",
        "mail",
        "title",
        "telephoneNumber",
        "mobile",
        "department",
        "manager",
        "physicalDeliveryOfficeName",
    ]
    PAGE_SIZE = 500
    TIMEOUT = 30

    def __init__(
        self, username: Optional[str] = None, password: Optional[str] = None
    ) -> None:

        self.AD_BIND_USERNAME = settings.active_directory.ldap_username
        self.AD_BIND_PASSWORD = settings.active_directory.ldap_password
        self.username = (
            f"{username}@{settings.active_directory.domain_name}"
            if username
            else f"{self.AD_BIND_USERNAME}@{settings.active_directory.domain_name}"
        )
        self.password = password or self.AD_BIND_PASSWORD

        self.domain_base = settings.active_directory.base_dn

        # Build LDAP URL
        use_ssl = (
            settings.active_directory.use_ssl
            if settings.active_directory.use_ssl is not None
            else False
        )

        logger.debug(f"Initializing LDAP server: {settings.active_directory.path}:{settings.active_directory.port}")

        # LDAP server setup
        self.server = Server(
            settings.active_directory.path,
            port=settings.active_directory.port,
            use_ssl=use_ssl,
            get_info=ALL,
            connect_timeout=self.TIMEOUT
        )

    async def connect(self) -> Connection:
        """Establish connection to LDAP server."""
        def _connect():
            conn = Connection(
                self.server,
                user=self.username,
                password=self.password,
                auto_bind=True,
                receive_timeout=self.TIMEOUT
            )
            return conn

        return await asyncio.to_thread(_connect)

    async def fetch_child_ous(self) -> List[Tuple[str, str]]:
        """Fetch child OUs from the base DN."""
        try:
            conn = await self.connect()

            def _search():
                conn.search(
                    search_base=settings.active_directory.base_dn,
                    search_filter=self.OU_FILTER,
                    search_scope=LEVEL,
                    attributes=["distinguishedName"]
                )
                return conn.entries

            entries = await asyncio.to_thread(_search)

            result: List[Tuple[str, str]] = []
            for entry in entries:
                dn = str(entry.distinguishedName)
                short = dn.split(",", 1)[0].split("=", 1)[1]
                result.append((dn, short))

            conn.unbind()
            logger.debug(f"Successfully fetched {len(result)} OUs from base DN")
            return result

        except LDAPException as e:
            error_msg = str(e)
            # Check for referral or operations errors
            if "referral" in error_msg.lower() or "operations error" in error_msg.lower():
                logger.warning(
                    f"LDAP referral/operations error encountered when fetching OUs: {error_msg}. "
                    "Falling back to full base DN search without OU filtering."
                )
                return []
            else:
                logger.error(f"Failed to fetch child OUs: {e}", exc_info=True)
                raise
        except Exception as e:
            logger.error(f"Failed to fetch child OUs: {e}", exc_info=True)
            raise

    async def fetch_enabled_users_for_ou(
        self, ou_dn: str, short_name: str
    ) -> Tuple[str, List[DomainUser]]:
        """Fetch enabled users from a specific OU."""
        try:
            conn = await self.connect()

            def _paged_search():
                users = []
                conn.search(
                    search_base=ou_dn,
                    search_filter=self.USER_FILTER,
                    search_scope=SUBTREE,
                    attributes=self.USER_ATTRS,
                    paged_size=self.PAGE_SIZE
                )

                for entry in conn.entries:
                    try:
                        user = DomainUser(
                            username=str(entry.sAMAccountName) if hasattr(entry, 'sAMAccountName') else "",
                            full_name=str(entry.displayName) if hasattr(entry, 'displayName') else None,
                            email=str(entry.mail) if hasattr(entry, 'mail') else None,
                            title=str(entry.title) if hasattr(entry, 'title') else None,
                            office=str(entry.physicalDeliveryOfficeName) if hasattr(entry, 'physicalDeliveryOfficeName') else None,
                        )
                        users.append(user)
                    except Exception as entry_error:
                        logger.debug(f"Skipping entry due to error: {entry_error}")
                        continue

                # Continue fetching pages if available
                cookie = conn.result['controls']['1.2.840.113556.1.4.319']['value']['cookie']
                while cookie:
                    conn.search(
                        search_base=ou_dn,
                        search_filter=self.USER_FILTER,
                        search_scope=SUBTREE,
                        attributes=self.USER_ATTRS,
                        paged_size=self.PAGE_SIZE,
                        paged_cookie=cookie
                    )
                    for entry in conn.entries:
                        try:
                            user = DomainUser(
                                username=str(entry.sAMAccountName) if hasattr(entry, 'sAMAccountName') else "",
                                full_name=str(entry.displayName) if hasattr(entry, 'displayName') else None,
                                email=str(entry.mail) if hasattr(entry, 'mail') else None,
                                title=str(entry.title) if hasattr(entry, 'title') else None,
                                office=str(entry.physicalDeliveryOfficeName) if hasattr(entry, 'physicalDeliveryOfficeName') else None,
                            )
                            users.append(user)
                        except Exception as entry_error:
                            logger.debug(f"Skipping entry due to error: {entry_error}")
                            continue
                    cookie = conn.result['controls']['1.2.840.113556.1.4.319']['value']['cookie']

                return users

            users = await asyncio.to_thread(_paged_search)
            conn.unbind()

            logger.debug(f"Successfully fetched {len(users)} users from OU '{short_name}'")
            return short_name, users

        except Exception as e:
            logger.warning(f"Failed to fetch users from OU '{short_name}' ({ou_dn}): {e}")
            return short_name, []

    async def get_connected_user(self) -> DomainUser:
        """Get details of the currently connected user."""
        conn = await self.connect()

        def _search():
            conn.search(
                search_base=self.domain_base,
                search_filter=f"(&(objectClass=user)(sAMAccountName={self.AD_BIND_USERNAME}))",
                search_scope=SUBTREE,
                attributes=self.USER_ATTRS
            )
            return conn.entries

        entries = await asyncio.to_thread(_search)

        if not entries:
            conn.unbind()
            raise RuntimeError(
                f"user {self.AD_BIND_USERNAME!r} not found under {self.domain_base!r}"
            )

        entry = entries[0]
        conn.unbind()

        return DomainUser(
            username=str(entry.sAMAccountName) if hasattr(entry, 'sAMAccountName') else "",
            full_name=str(entry.displayName) if hasattr(entry, 'displayName') else None,
            email=str(entry.mail) if hasattr(entry, 'mail') else None,
            title=str(entry.title) if hasattr(entry, 'title') else None,
            office=str(entry.physicalDeliveryOfficeName) if hasattr(entry, 'physicalDeliveryOfficeName') else None,
        )

    async def get_enabled_users(self, enabled_ou_names: Optional[List[str]] = None):
        """
        Fetch all enabled users from configured OUs.

        Args:
            enabled_ou_names: Optional list of OU names to sync.
                            If None, reads from config (deprecated).
                            If empty list, syncs all OUs.
                            If ["*"], syncs all OUs.
        """
        ous = await self.fetch_child_ous()
        logger.info(f"Found {len(ous)} OUs under base DN: {[sn for _, sn in ous]}")

        # Determine which OUs to target
        if enabled_ou_names is None:
            # Legacy: Read from config (deprecated)
            logger.warning("Using deprecated config-based OU selection. Please configure OUs in database.")
            if "*" in settings.active_directory.desired_ous or not settings.active_directory.desired_ous:
                targets = ous
                logger.info(f"Wildcard detected: syncing all {len(targets)} OUs")
            else:
                targets = [
                    (dn, sn)
                    for dn, sn in ous
                    if sn in settings.active_directory.desired_ous
                ]
        elif "*" in enabled_ou_names:
            # Sync all OUs (explicit wildcard)
            targets = ous
            logger.info(f"Wildcard detected: syncing all {len(targets)} OUs")
        elif enabled_ou_names:
            # Sync only specified OUs from database (non-empty list)
            targets = [
                (dn, sn)
                for dn, sn in ous
                if sn in enabled_ou_names
            ]
            logger.info(f"Database configuration: syncing {len(targets)} OUs: {[sn for _, sn in targets]}")
        else:
            # Empty list [] - sync nothing
            targets = []
            logger.info("Empty OU list provided - syncing no OUs")

        if not targets:
            logger.warning(
                f"No OUs matched enabled_ou_names={enabled_ou_names}. "
                f"Found OUs in AD: {[sn for _, sn in ous]}. "
                f"Returning empty user list."
            )
            return []

        # Pull specified OUs in parallel
        logger.info(f"Searching {len(targets)} matching OUs: {[sn for _, sn in targets]}")
        tasks = [
            asyncio.create_task(self.fetch_enabled_users_for_ou(dn, sn))
            for dn, sn in targets
        ]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        # Collect users (skip exceptions)
        refactored_users = []
        successful_ous = 0
        failed_ous = 0

        for result in results:
            if isinstance(result, Exception):
                failed_ous += 1
                logger.error(f"OU fetch task failed: {result}")
                continue

            ou_name, users = result
            successful_ous += 1
            logger.info(f"Found {len(users)} users in OU '{ou_name}'")
            refactored_users.extend(users)

        logger.info(
            f"Total users found across {successful_ous}/{len(targets)} OUs: {len(refactored_users)}"
            + (f" ({failed_ous} OUs failed)" if failed_ous > 0 else "")
        )
        return refactored_users

    async def authenticate_user(self, username: str, password: str) -> bool:
        """
        Authenticate a user against Active Directory.

        Args:
            username: sAMAccountName (without domain)
            password: User's password

        Returns:
            True if authentication successful, False otherwise
        """
        try:
            # Validate settings
            if (
                not settings.active_directory.path
                or not settings.active_directory.port
            ):
                logger.error(
                    "AD configuration incomplete: AD_PATH or AD_PORT not set"
                )
                return False

            logger.debug(f"Attempting authentication for {username}")

            # Try to bind with user credentials
            def _authenticate():
                try:
                    conn = Connection(
                        self.server,
                        user=f"{username}@{settings.active_directory.domain_name}",
                        password=password,
                        auto_bind=True,
                        receive_timeout=self.TIMEOUT
                    )
                    conn.unbind()
                    return True
                except (LDAPBindError, LDAPSocketOpenError) as e:
                    logger.debug(f"Authentication failed: {e}")
                    return False

            result = await asyncio.to_thread(_authenticate)

            if result:
                logger.info(f"Successfully authenticated user: {username}")
            else:
                logger.warning(f"Authentication failed for user {username}")

            return result

        except Exception as e:
            logger.warning(
                f"Authentication failed for user {username}: {str(e)}",
                exc_info=True,
            )
            return False

    async def get_user_by_username(
        self, username: str
    ) -> Optional[DomainUser]:
        """
        Fetch user details from Active Directory by username.

        Args:
            username: sAMAccountName (without domain)

        Returns:
            DomainUser object if found, None otherwise
        """
        try:
            conn = await self.connect()

            # Search for user in AD
            def _search_user():
                conn.search(
                    search_base=self.domain_base,
                    search_filter=f"(&(objectClass=user)(sAMAccountName={username}))",
                    search_scope=SUBTREE,
                    attributes=self.USER_DETAIL_ATTRS
                )
                return conn.entries

            entries = await asyncio.to_thread(_search_user)

            if not entries:
                conn.unbind()
                logger.warning(
                    f"User {username} not found in Active Directory"
                )
                return None

            # Parse first entry
            entry = entries[0]

            # Extract phone number (prefer mobile, fallback to telephone)
            phone_number = None
            if hasattr(entry, 'mobile') and entry.mobile:
                phone_number = str(entry.mobile)
            elif hasattr(entry, 'telephoneNumber') and entry.telephoneNumber:
                phone_number = str(entry.telephoneNumber)

            # Extract and parse manager DN to get username and full name
            manager_dn = None
            manager_username = None
            direct_manager_name = None

            if hasattr(entry, 'manager') and entry.manager:
                manager_dn = str(entry.manager)

                # Parse CN=Username from DN
                match = re.search(r"CN=([^,]+)", manager_dn)
                if match:
                    manager_username = match.group(1)

                # Fetch manager's full name from AD
                try:
                    def _search_manager():
                        conn.search(
                            search_base=manager_dn,
                            search_filter="(objectClass=user)",
                            search_scope=BASE,
                            attributes=["displayName"]
                        )
                        return conn.entries

                    manager_entries = await asyncio.to_thread(_search_manager)

                    if manager_entries and hasattr(manager_entries[0], 'displayName'):
                        direct_manager_name = str(manager_entries[0].displayName)

                except Exception as manager_error:
                    logger.debug(
                        f"Could not fetch manager display name: {manager_error}"
                    )

            conn.unbind()

            # Create DomainUser object
            domain_user = DomainUser(
                username=str(entry.sAMAccountName) if hasattr(entry, 'sAMAccountName') else username,
                email=str(entry.mail) if hasattr(entry, 'mail') else None,
                full_name=str(entry.displayName) if hasattr(entry, 'displayName') else None,
                phone_number=phone_number,
                manager_username=manager_username,
                direct_manager_name=direct_manager_name,
                title=str(entry.title) if hasattr(entry, 'title') else None,
                office=str(entry.physicalDeliveryOfficeName) if hasattr(entry, 'physicalDeliveryOfficeName') else None,
                department=str(entry.department) if hasattr(entry, 'department') else None,
            )

            logger.info(f"Successfully retrieved user details for: {username}")
            return domain_user

        except Exception as e:
            logger.error(f"Failed to fetch user {username} from AD: {str(e)}")
            return None


async def get_domain_enabled_users() -> List[DomainUser]:
    """
    Fetch enabled users from the configured OUs in the domain.
    """
    ldap_service = LdapService()
    try:
        return await ldap_service.get_enabled_users()
    except Exception as e:
        raise RuntimeError("Failed to fetch enabled users from LDAP") from e


class ActiveDirectoryService:
    """
    Service for testing and managing Active Directory/LDAP connections.
    Used for validating configuration before saving.
    """

    def __init__(
        self,
        server_url: str,
        port: int,
        bind_username: str,
        bind_password: str,
        search_base: str,
        use_ssl_tls: bool = True,
    ):
        self.server_url = server_url
        self.port = port
        self.bind_username = bind_username
        self.bind_password = bind_password
        self.search_base = search_base
        self.use_ssl_tls = use_ssl_tls

    async def test_connection(self) -> bool:
        """
        Test connection to Active Directory/LDAP server.

        Returns:
            True if connection successful, False otherwise
        """
        try:
            # Create LDAP server
            server = Server(
                self.server_url,
                port=self.port,
                use_ssl=self.use_ssl_tls,
                get_info=ALL,
                connect_timeout=10
            )

            # Try to connect and bind
            def _test_bind():
                try:
                    conn = Connection(
                        server,
                        user=self.bind_username,
                        password=self.bind_password,
                        auto_bind=True,
                        receive_timeout=5
                    )

                    # Try a simple search to verify the search base is valid
                    try:
                        conn.search(
                            search_base=self.search_base,
                            search_filter="(objectClass=*)",
                            search_scope=BASE
                        )
                    except Exception as search_error:
                        print(f"Search test failed: {search_error}")
                        # Connection is successful even if search fails (might be permissions)

                    conn.unbind()
                    return True
                except Exception as e:
                    print(f"Bind failed: {e}")
                    return False

            result = await asyncio.to_thread(_test_bind)
            return result

        except Exception as e:
            print(f"LDAP connection test failed: {e}")
            return False
