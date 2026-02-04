"""
Common types shared across multiple modules.
"""

from enum import Enum
from typing import Any, Dict, Optional

from pydantic import BaseModel, Field


class RiskTier(str, Enum):
    """Risk tier for action classification."""

    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class Intent(str, Enum):
    """Allowed intents for actions."""

    READ = "read"
    WRITE = "write"
    DELETE = "delete"
    EXECUTE = "execute"
    ADMIN = "admin"


class DataZone(str, Enum):
    """Data zones for resource isolation."""

    PUBLIC = "public"
    INTERNAL = "internal"
    CONFIDENTIAL = "confidential"
    RESTRICTED = "restricted"


class Permission(BaseModel):
    """Permission requirement for task execution and action authorization."""

    action: str = Field(..., description="Action identifier")
    resource: str = Field(..., description="Resource identifier")
    intent: Optional[Intent] = Field(None, description="Optional intent restriction")
    data_zone: Optional[DataZone] = Field(None, description="Optional data zone restriction")
    conditions: Optional[Dict[str, Any]] = Field(None, description="Additional conditions")
