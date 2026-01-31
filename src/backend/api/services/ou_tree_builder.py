"""
OU Tree Builder Service

Converts flat list of OUs into hierarchical tree structure for frontend display.
"""

import logging
from typing import Dict, List, Optional, Set, Tuple

from pydantic import BaseModel

logger = logging.getLogger(__name__)


class OUTreeNode(BaseModel):
    """Represents a node in the OU tree hierarchy."""

    ou_name: str
    ou_dn: str
    children: List['OUTreeNode'] = []
    already_exists: bool = False
    user_count: int = 0

    class Config:
        from_attributes = True


def parse_parent_dn(ou_dn: str) -> Optional[str]:
    """
    Extract parent DN from a full OU DN.

    Examples:
        OU=HR,OU=Users,OU=SMH,OU=Andalusia,DC=andalusia,DC=loc
        → OU=Users,OU=SMH,OU=Andalusia,DC=andalusia,DC=loc

        OU=SMH,OU=Andalusia,DC=andalusia,DC=loc
        → OU=Andalusia,DC=andalusia,DC=loc

        OU=Andalusia,DC=andalusia,DC=loc
        → DC=andalusia,DC=loc (root - no OU parent)

    Args:
        ou_dn: Full distinguished name

    Returns:
        Parent DN or None if this is a root-level OU
    """
    # Split by comma to get components
    components = ou_dn.split(',')

    if len(components) <= 1:
        return None

    # Parent is everything after the first component
    parent_components = components[1:]
    parent_dn = ','.join(parent_components)

    # Check if parent still contains OU components
    # If parent is just DC components, this is a root OU
    if not any(comp.startswith('OU=') for comp in parent_components):
        return None

    return parent_dn


def build_ou_tree(
    ou_list: List[Tuple[str, str]],
    existing_ou_dns: Set[str],
    base_dn: str
) -> List[OUTreeNode]:
    """
    Build hierarchical OU tree from flat list.

    Args:
        ou_list: List of (dn, short_name) tuples from LDAP
        existing_ou_dns: Set of OU DNs already in database
        base_dn: Base DN to identify root level OUs

    Returns:
        List of root-level OUTreeNode objects with children populated
    """
    # Case-insensitive DN lookup since LDAP DNs are case-insensitive
    existing_dns_lower = {dn.lower() for dn in existing_ou_dns}

    # Create a mapping of DN -> OUTreeNode
    node_map: Dict[str, OUTreeNode] = {}

    # First pass: Create all nodes
    for ou_dn, ou_name in ou_list:
        node = OUTreeNode(
            ou_name=ou_name,
            ou_dn=ou_dn,
            children=[],
            already_exists=(ou_dn.lower() in existing_dns_lower),
            user_count=0  # Can be populated later if needed
        )
        node_map[ou_dn] = node

    # Second pass: Build parent-child relationships
    root_nodes: List[OUTreeNode] = []

    for ou_dn, node in node_map.items():
        parent_dn = parse_parent_dn(ou_dn)

        if parent_dn is None or parent_dn == base_dn:
            # This is a root-level OU (direct child of base DN)
            root_nodes.append(node)
        elif parent_dn in node_map:
            # Add this node as a child of its parent
            parent_node = node_map[parent_dn]
            parent_node.children.append(node)
        else:
            # Parent not in our list - might be a container or non-OU object
            # Treat as root node (this is expected for some AD structures)
            logger.debug(
                f"OU {ou_dn} has parent {parent_dn} not in tree. "
                f"Adding as root node."
            )
            root_nodes.append(node)

    # Sort children alphabetically for consistent display
    def sort_tree(nodes: List[OUTreeNode]):
        nodes.sort(key=lambda n: n.ou_name.lower())
        for node in nodes:
            if node.children:
                sort_tree(node.children)

    sort_tree(root_nodes)

    logger.info(
        f"Built OU tree with {len(root_nodes)} root nodes, "
        f"{len(node_map)} total nodes"
    )

    return root_nodes


def domain_name_to_base_dn(domain_name: str) -> str:
    """
    Convert domain name to LDAP Base DN.

    Examples:
        'andalusia.loc' → 'DC=andalusia,DC=loc'
        'corp.example.com' → 'DC=corp,DC=example,DC=com'
        'ANDALUSIA' → 'DC=ANDALUSIA'

    Args:
        domain_name: Domain name (FQDN or simple name)

    Returns:
        Properly formatted Base DN
    """
    if not domain_name:
        raise ValueError("Domain name cannot be empty")

    # Strip whitespace
    domain_name = domain_name.strip()

    # Split by dots and create DC components
    parts = domain_name.split('.')
    dc_components = [f"DC={part}" for part in parts if part]

    if not dc_components:
        raise ValueError(f"Invalid domain name: {domain_name}")

    return ','.join(dc_components)
