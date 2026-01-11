"""DeploymentJob schemas package."""
from .deployment_job import (
    DeploymentConstraints,
    DeploymentJobClaim,
    DeploymentJobCreate,
    DeploymentJobListItem,
    DeploymentJobListResponse,
    DeploymentJobRead,
    DeploymentJobResult,
    InstallerInfo,
    NetSupportInstallPayload,
    PerTargetResult,
    TargetDevice,
)

__all__ = [
    "DeploymentJobCreate",
    "DeploymentJobRead",
    "DeploymentJobListItem",
    "DeploymentJobListResponse",
    "DeploymentJobClaim",
    "DeploymentJobResult",
    "PerTargetResult",
    "InstallerInfo",
    "TargetDevice",
    "DeploymentConstraints",
    "NetSupportInstallPayload",
]
