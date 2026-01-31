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

from ldap3 import Server, Connection, ALL, SUBTREE, LEVEL, BASE
from ldap3.core.exceptions import LDAPException, LDAPBindError, LDAPSocketOpenError

from api.schemas.domain_user import DomainUser

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
        self,
        ad_config: object,
        username: Optional[str] = None,
        password: Optional[str] = None
    ) -> None:
        """
        Initialize LDAP service using database configuration.

        Args:
            ad_config: ActiveDirectoryConfig object from database (REQUIRED)
            username: Optional username for authentication
            password: Optional password for authentication
        """
        if not ad_config:
            raise ValueError("Active Directory configuration is required")

        # Use database config
        self.AD_BIND_USERNAME = ad_config.ldap_username
        domain_name = ad_config.domain_name
        base_dn = ad_config.base_dn
        ldap_path = ad_config.path
        ldap_port = ad_config.port
        use_ssl = ad_config.use_ssl

        # Decrypt password
        from core.encryption import decrypt_value
        self.AD_BIND_PASSWORD = decrypt_value(ad_config.encrypted_password)

        self.username = (
            f"{username}@{domain_name}"
            if username
            else f"{self.AD_BIND_USERNAME}@{domain_name}"
        )
        self.password = password or self.AD_BIND_PASSWORD
        self.domain_base = base_dn

        logger.debug(f"Initializing LDAP server: {ldap_path}:{ldap_port}")

        # LDAP server setup
        self.server = Server(
            ldap_path,
            port=ldap_port,
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
        """Fetch child OUs from the base DN (first level only)."""
        try:
            conn = await self.connect()

            def _search():
                conn.search(
                    search_base=self.domain_base,
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

    async def fetch_all_ous_recursive(self) -> List[Tuple[str, str]]:
        """
        Fetch ALL OUs from base DN using SUBTREE search (recursive).

        This returns the complete OU hierarchy for tree building,
        unlike fetch_child_ous() which only returns first-level OUs.

        Returns:
            List of (full_dn, ou_name) tuples for all OUs in the tree
        """
        try:
            conn = await self.connect()

            def _search_ous():
                # Search for organizational units
                conn.search(
                    search_base=self.domain_base,
                    search_filter="(objectClass=organizationalUnit)",
                    search_scope=SUBTREE,
                    attributes=["distinguishedName", "name"]
                )
                return list(conn.entries)

            def _search_containers():
                # Search for containers (some intermediate OUs like "Users" might be containers)
                conn.search(
                    search_base=self.domain_base,
                    search_filter="(&(objectClass=container)(ou=*))",  # Only containers with OU attribute
                    search_scope=SUBTREE,
                    attributes=["distinguishedName", "name"]
                )
                return list(conn.entries)

            # Fetch both OUs and relevant containers
            ou_entries = await asyncio.to_thread(_search_ous)
            container_entries = await asyncio.to_thread(_search_containers)

            # Merge and deduplicate entries
            all_entries = ou_entries + container_entries
            seen_dns = set()
            result: List[Tuple[str, str]] = []

            for entry in all_entries:
                dn = str(entry.distinguishedName)

                # Skip if we've already seen this DN
                if dn in seen_dns:
                    continue
                seen_dns.add(dn)

                # Only include entries that have OU= in their DN (not system containers like CN=Users)
                if 'OU=' not in dn:
                    continue

                # Try to use 'name' attribute if available, otherwise parse from DN
                if hasattr(entry, 'name') and entry.name:
                    ou_name = str(entry.name)
                else:
                    ou_name = dn.split(",", 1)[0].split("=", 1)[1]
                result.append((dn, ou_name))

            conn.unbind()
            logger.debug(f"Successfully fetched {len(result)} OUs recursively from base DN")
            return result

        except LDAPException as e:
            error_msg = str(e)
            if "referral" in error_msg.lower() or "operations error" in error_msg.lower():
                logger.warning(
                    f"LDAP referral/operations error encountered when fetching OUs recursively: {error_msg}"
                )
                return []
            else:
                logger.error(f"Failed to fetch OUs recursively: {e}", exc_info=True)
                raise
        except Exception as e:
            logger.error(f"Failed to fetch OUs recursively: {e}", exc_info=True)
            raise

    def _parse_user_entry(self, entry) -> Optional[DomainUser]:
        """Parse an LDAP entry into a DomainUser schema."""
        try:
            phone = None
            if hasattr(entry, 'telephoneNumber') and str(entry.telephoneNumber):
                phone = str(entry.telephoneNumber)
            elif hasattr(entry, 'mobile') and str(entry.mobile):
                phone = str(entry.mobile)

            manager_name = None
            if hasattr(entry, 'manager') and entry.manager:
                manager_dn = str(entry.manager)
                if manager_dn and "CN=" in manager_dn:
                    manager_name = manager_dn.split(",")[0].split("=", 1)[1]

            return DomainUser(
                username=str(entry.sAMAccountName) if hasattr(entry, 'sAMAccountName') else "",
                full_name=str(entry.displayName) if hasattr(entry, 'displayName') else None,
                email=str(entry.mail) if hasattr(entry, 'mail') else None,
                title=str(entry.title) if hasattr(entry, 'title') else None,
                office=str(entry.physicalDeliveryOfficeName) if hasattr(entry, 'physicalDeliveryOfficeName') else None,
                phone_number=phone,
                direct_manager_name=manager_name,
            )
        except Exception as entry_error:
            logger.debug(f"Skipping entry due to error: {entry_error}")
            return None

    async def fetch_enabled_users_for_ou(
        self, ou_dn: str, short_name: str
    ) -> Tuple[str, List[DomainUser]]:
        """Fetch enabled users from a specific OU and all its sub-OUs."""
        try:
            conn = await self.connect()

            def _paged_search():
                users = []
                logger.info(f"LDAP search: base='{ou_dn}', scope=SUBTREE, filter='{self.USER_FILTER}'")
                conn.search(
                    search_base=ou_dn,
                    search_filter=self.USER_FILTER,
                    search_scope=SUBTREE,
                    attributes=self.USER_DETAIL_ATTRS,
                    paged_size=self.PAGE_SIZE
                )
                logger.info(
                    f"LDAP search result: status='{conn.result.get('description')}', "
                    f"entries={len(conn.entries)}, controls={list(conn.result.get('controls', {}).keys())}"
                )

                for entry in conn.entries:
                    user = self._parse_user_entry(entry)
                    if user:
                        users.append(user)

                # Continue fetching pages if available
                controls = conn.result.get('controls', {})
                paging_control = controls.get('1.2.840.113556.1.4.319')
                if not paging_control:
                    logger.info(f"No paging control in response, returning {len(users)} users from first page")
                    return users
                cookie = paging_control['value']['cookie']
                while cookie:
                    conn.search(
                        search_base=ou_dn,
                        search_filter=self.USER_FILTER,
                        search_scope=SUBTREE,
                        attributes=self.USER_DETAIL_ATTRS,
                        paged_size=self.PAGE_SIZE,
                        paged_cookie=cookie
                    )
                    for entry in conn.entries:
                        user = self._parse_user_entry(entry)
                        if user:
                            users.append(user)
                    next_controls = conn.result.get('controls', {})
                    next_paging = next_controls.get('1.2.840.113556.1.4.319')
                    if not next_paging:
                        break
                    cookie = next_paging['value']['cookie']

                return users

            users = await asyncio.to_thread(_paged_search)
            conn.unbind()

            logger.debug(f"Successfully fetched {len(users)} users from OU '{short_name}'")
            return short_name, users

        except Exception as e:
            logger.warning(f"Failed to fetch users from OU '{short_name}' ({ou_dn}): {type(e).__name__}: {e}", exc_info=True)
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

    @staticmethod
    def _prune_covered_ous(targets: List[Tuple[str, str]]) -> List[Tuple[str, str]]:
        """
        Remove OUs whose DN is already under another selected OU.

        Since each OU uses SUBTREE search, a parent OU already covers all its
        children. E.g. if both "OU=SMH,DC=..." and "OU=IT,OU=SMH,DC=..." are
        selected, the IT one is redundant because the SMH SUBTREE covers it.
        """
        # Use case-insensitive comparison since LDAP DNs are case-insensitive
        target_dns = {dn.lower() for dn, _ in targets}
        pruned = []
        for dn, sn in targets:
            dn_lower = dn.lower()
            is_covered = any(
                dn_lower != other_dn and dn_lower.endswith("," + other_dn)
                for other_dn in target_dns
            )
            if not is_covered:
                pruned.append((dn, sn))
        return pruned

    async def get_enabled_users(self, enabled_ou_dns: Optional[List[str]] = None):
        """
        Fetch all enabled users from configured OUs.

        Each selected OU is searched with SUBTREE scope (includes all sub-OUs).
        If a parent OU is selected, its children are automatically included —
        no need to select them individually.

        Args:
            enabled_ou_dns: Optional list of OU distinguished names to sync.
                           If None or empty list, syncs all OUs.
                           Otherwise, syncs only the specified OUs by DN.
        """
        if not enabled_ou_dns:
            # Fallback: fetch all OUs from AD tree
            ous = await self.fetch_all_ous_recursive()
            targets = ous
            logger.info(f"No DNs specified: syncing all {len(targets)} OUs")
        else:
            # Build targets from the provided DNs
            # Extract short name from DN (first OU= component)
            targets = []
            for dn in enabled_ou_dns:
                # Extract short name from "OU=ShortName,OU=Parent,DC=..."
                parts = dn.split(",")
                sn = parts[0].split("=", 1)[1] if "=" in parts[0] else dn
                targets.append((dn, sn))
            logger.info(f"Using {len(targets)} OUs from database DNs")

        if not targets:
            logger.warning("No OUs to search. Returning empty user list.")
            return []

        # Prune child OUs already covered by a selected parent's SUBTREE search
        pruned_targets = self._prune_covered_ous(targets)
        if len(pruned_targets) < len(targets):
            logger.info(
                f"Pruned {len(targets) - len(pruned_targets)} redundant child OUs, "
                f"searching {len(pruned_targets)} top-level OUs"
            )

        # Fetch users from each OU in parallel
        logger.info(f"Searching {len(pruned_targets)} OUs: {[sn for _, sn in pruned_targets]}")
        fetch_tasks = [
            asyncio.create_task(self.fetch_enabled_users_for_ou(dn, sn))
            for dn, sn in pruned_targets
        ]
        results = await asyncio.gather(*fetch_tasks, return_exceptions=True)

        # Collect users, deduplicate by username
        seen: dict[str, DomainUser] = {}
        successful_ous = 0
        failed_ous = 0

        for result in results:
            if isinstance(result, Exception):
                failed_ous += 1
                logger.error(f"OU fetch failed: {result}")
                continue

            ou_name, users = result
            successful_ous += 1
            logger.info(f"Found {len(users)} users in OU '{ou_name}'")
            for user in users:
                if user.username and user.username not in seen:
                    seen[user.username] = user

        unique_users = list(seen.values())
        logger.info(
            f"Total unique users: {len(unique_users)} from "
            f"{successful_ous}/{len(pruned_targets)} OUs"
            + (f" ({failed_ous} failed)" if failed_ous > 0 else "")
        )
        return unique_users

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
            # Server is already configured in __init__, no need to validate
            logger.debug(f"Attempting authentication for {username}")

            # Try to bind with user credentials
            def _authenticate():
                try:
                    # Extract domain from username (e.g., "user@DOMAIN")
                    domain = self.username.split('@')[1] if '@' in self.username else ''
                    conn = Connection(
                        self.server,
                        user=f"{username}@{domain}",
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


async def get_ldap_service(db=None):
    """
    Get LdapService instance from active DB config or fallback to env vars.

    Args:
        db: Optional database session. If provided, will try to load config from DB first.

    Returns:
        LdapService instance configured from DB or env vars
    """
    if db is not None:
        try:
            from crud import active_directory_config_crud as ad_crud

            # Try to get active config from DB
            config = await ad_crud.get_active_config(db)
            if config:
                logger.info(f"Using AD config from database: {config.name}")
                return LdapService(ad_config=config)
        except Exception as e:
            logger.warning(f"Failed to load AD config from DB, falling back to env vars: {e}")

    raise ValueError(
        "No Active Directory configuration found. "
        "Please configure AD settings in the admin panel."
    )


class ActiveDirectoryService:
    """
    Service for testing and managing Active Directory/LDAP connections.
    Used for validating configuration before saving.
    """

    def __init__(
        self,
        path: str,
        domain_name: str,
        port: int,
        use_ssl: bool,
        ldap_username: str,
        ldap_password: str,
        base_dn: str,
    ):
        self.path = path
        self.domain_name = domain_name
        self.port = port
        self.use_ssl = use_ssl
        self.ldap_username = ldap_username
        self.ldap_password = ldap_password
        self.base_dn = base_dn

    async def test_connection(self) -> dict:
        """
        Test connection to Active Directory/LDAP server.

        Returns:
            Dict with 'success' (bool), 'message' (str), and optional 'details' (str)
        """
        try:
            # Create LDAP server
            server = Server(
                self.path,
                port=self.port,
                use_ssl=self.use_ssl,
                get_info=ALL,
                connect_timeout=10
            )

            # Try to connect and bind
            def _test_bind():
                try:
                    # Build full username for binding
                    full_username = f"{self.ldap_username}@{self.domain_name}"

                    conn = Connection(
                        server,
                        user=full_username,
                        password=self.ldap_password,
                        auto_bind=True,
                        receive_timeout=5
                    )

                    # Try a simple search to verify the search base is valid
                    search_success = False
                    search_error = None
                    try:
                        conn.search(
                            search_base=self.base_dn,
                            search_filter="(objectClass=*)",
                            search_scope=BASE
                        )
                        search_success = True
                    except Exception as e:
                        search_error = str(e)
                        # Connection is successful even if search fails (might be permissions)

                    conn.unbind()

                    if search_success:
                        return {
                            "success": True,
                            "message": "Connection successful and base DN is accessible"
                        }
                    else:
                        return {
                            "success": True,
                            "message": "Connection successful but base DN search failed",
                            "details": search_error
                        }

                except LDAPBindError as e:
                    return {
                        "success": False,
                        "message": "Authentication failed",
                        "details": str(e)
                    }
                except LDAPSocketOpenError as e:
                    return {
                        "success": False,
                        "message": "Cannot connect to LDAP server",
                        "details": str(e)
                    }
                except Exception as e:
                    return {
                        "success": False,
                        "message": "Connection failed",
                        "details": str(e)
                    }

            result = await asyncio.to_thread(_test_bind)
            return result

        except Exception as e:
            logger.error(f"LDAP connection test failed: {e}")
            return {
                "success": False,
                "message": "Connection test failed",
                "details": str(e)
            }
