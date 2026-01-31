# Schema Pattern Reference

Pydantic DTOs (Data Transfer Objects) for request/response validation.

## Schema File Locations

- **Domain schemas**: `api/schemas/product_schema.py` - Shared/domain-level schemas
- **HTTP schemas**: `api/http_schema/product_schema.py` - Request/response schemas for endpoints
- **Base class**: `api/schemas/_base.py` - CamelModel base class

## Base Class: CamelModel

All schemas MUST inherit from `CamelModel` for automatic camelCase JSON serialization:

```python
# api/schemas/_base.py
from datetime import datetime
from typing import Any
from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

class CamelModel(BaseModel):
    """Base model with camelCase aliases and UTC datetime handling."""

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True,      # Enable ORM mode
        serialize_by_alias=True,   # Always output camelCase
    )
```

## Schema Types

### 1. Base Schema (shared fields)

```python
from pydantic import Field
from api.schemas._base import CamelModel

class ItemBase(CamelModel):
    """Base item schema with shared fields."""

    name_en: str = Field(min_length=1, max_length=64, description="Name in English")
    name_ar: str = Field(min_length=1, max_length=64, description="Name in Arabic")
    description_en: Optional[str] = Field(None, max_length=256)
    description_ar: Optional[str] = Field(None, max_length=256)
```

### 2. Create Schema (input for POST)

```python
class ItemCreate(ItemBase):
    """Schema for creating a new item."""

    # Optional legacy field mapping
    name: Optional[str] = Field(None, description="Legacy name field")

    @model_validator(mode='after')
    def map_legacy_fields(self):
        """Map legacy fields to bilingual fields."""
        if self.name and not self.name_en:
            self.name_en = self.name
            self.name_ar = self.name
        return self
```

### 3. Update Schema (input for PUT/PATCH)

```python
class ItemUpdate(CamelModel):
    """Schema for updating an item. All fields optional."""

    name_en: Optional[str] = Field(None, min_length=1, max_length=64)
    name_ar: Optional[str] = Field(None, min_length=1, max_length=64)
    description_en: Optional[str] = Field(None, max_length=256)
    description_ar: Optional[str] = Field(None, max_length=256)
    is_active: Optional[bool] = None
```

### 4. Response Schema (output for GET)

```python
from datetime import datetime

class ItemResponse(ItemBase):
    """Schema for returning item data in API responses."""

    id: int
    is_active: bool = Field(default=True)
    created_at: datetime
    updated_at: datetime

    # Computed field for backward compatibility
    name: Optional[str] = Field(None, description="Computed based on locale")
```

### 5. Status Update Schema

```python
class ItemStatusUpdate(CamelModel):
    """Schema for toggling item status."""

    is_active: bool = Field(description="New active status")
```

### 6. List Response (with pagination)

```python
from typing import List

class ItemListResponse(CamelModel):
    """Paginated list of items."""

    items: List[ItemResponse]
    total: int
    page: int
    per_page: int
    total_pages: int
```

### 7. Simple/Dropdown Schema

```python
class SimpleItem(CamelModel):
    """Minimal item schema for dropdowns."""

    id: int
    name: str
    name_en: Optional[str] = None
    name_ar: Optional[str] = None
```

## Field Validation

```python
from pydantic import Field, field_validator, model_validator

class ItemCreate(CamelModel):
    name: str = Field(
        min_length=1,
        max_length=100,
        description="Item name",
        examples=["My Item"]
    )
    quantity: int = Field(ge=0, le=1000, description="Quantity (0-1000)")
    email: str = Field(pattern=r"^[\w\.-]+@[\w\.-]+\.\w+$")

    @field_validator('name')
    @classmethod
    def validate_name(cls, v: str) -> str:
        """Custom name validation."""
        if v.lower() == 'admin':
            raise ValueError('Name cannot be "admin"')
        return v.strip()

    @model_validator(mode='after')
    def validate_model(self):
        """Cross-field validation."""
        if self.quantity == 0 and self.is_active:
            raise ValueError('Cannot activate item with zero quantity')
        return self
```

## Bilingual Support Pattern

```python
class BilingualEntity(CamelModel):
    """Entity with English and Arabic names."""

    name_en: str = Field(min_length=1, max_length=64)
    name_ar: str = Field(min_length=1, max_length=64)
    description_en: Optional[str] = None
    description_ar: Optional[str] = None

    def get_name(self, locale: str = 'en') -> str:
        """Get name for specified locale."""
        return self.name_ar if locale == 'ar' else self.name_en

    def get_description(self, locale: str = 'en') -> Optional[str]:
        """Get description for specified locale."""
        return self.description_ar if locale == 'ar' else self.description_en
```

## Complete Example

```python
# api/schemas/product_schema.py (domain schemas)
"""Product Domain Schemas."""

from api.schemas._base import CamelModel

class ProductBase(CamelModel):
    """Base product schema."""
    name_en: str
    name_ar: str


# api/http_schema/product_schema.py (request/response schemas)
"""Product HTTP Schemas - Pydantic DTOs for Product endpoints."""

from datetime import datetime
from typing import Optional, List
from pydantic import Field, model_validator
from api.schemas._base import CamelModel


class ProductBase(CamelModel):
    """Base product schema."""

    name_en: str = Field(min_length=1, max_length=128)
    name_ar: str = Field(min_length=1, max_length=128)
    description_en: Optional[str] = Field(None, max_length=512)
    description_ar: Optional[str] = Field(None, max_length=512)
    price: float = Field(gt=0, description="Price in USD")
    category_id: int


class ProductCreate(ProductBase):
    """Schema for creating a product."""
    pass


class ProductUpdate(CamelModel):
    """Schema for updating a product."""

    name_en: Optional[str] = Field(None, min_length=1, max_length=128)
    name_ar: Optional[str] = Field(None, min_length=1, max_length=128)
    description_en: Optional[str] = Field(None, max_length=512)
    description_ar: Optional[str] = Field(None, max_length=512)
    price: Optional[float] = Field(None, gt=0)
    category_id: Optional[int] = None
    is_active: Optional[bool] = None


class ProductResponse(ProductBase):
    """Schema for product API responses."""

    id: int
    is_active: bool = True
    created_at: datetime
    updated_at: datetime
    name: Optional[str] = None  # Computed based on locale


class ProductStatusUpdate(CamelModel):
    """Schema for toggling product status."""

    is_active: bool


class SimpleProduct(CamelModel):
    """Minimal product for dropdowns."""

    id: int
    name: str
    price: float
```

## Key Points

1. **Always inherit from CamelModel** - Never use raw BaseModel
2. **Use Field() for validation** - min_length, max_length, ge, le, pattern
3. **Separate Create/Update schemas** - Update has all optional fields
4. **Include timestamps in Response** - created_at, updated_at
5. **Add computed locale field** - For backward compatibility
6. **Use from_attributes=True** - Enables automatic ORM to Pydantic conversion
7. **Domain schemas** in `api/schemas/` - Shared across layers
8. **HTTP schemas** in `api/http_schema/` - Specific to endpoints
