"""Schemas for OU tree responses."""

from typing import List

from core.schema_base import HTTPSchemaModel


class OUTreeNodeRead(HTTPSchemaModel):
    """Represents a node in the OU tree hierarchy for frontend display."""

    ou_name: str
    ou_dn: str
    children: List['OUTreeNodeRead'] = []
    already_exists: bool = False
    user_count: int = 0

    class Config:
        json_schema_extra = {
            "example": {
                "ouName": "SMH",
                "ouDn": "OU=SMH,OU=Andalusia,DC=andalusia,DC=loc",
                "children": [
                    {
                        "ouName": "Users",
                        "ouDn": "OU=Users,OU=SMH,OU=Andalusia,DC=andalusia,DC=loc",
                        "children": [],
                        "alreadyExists": False,
                        "userCount": 0
                    }
                ],
                "alreadyExists": False,
                "userCount": 125
            }
        }
