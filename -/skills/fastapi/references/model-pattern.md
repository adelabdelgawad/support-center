# Model Pattern Reference

SQLAlchemy ORM models with async support.

## Base Class

```python
# db/models.py
from sqlalchemy.orm import DeclarativeBase

class Base(DeclarativeBase):
    """Base class for all models."""
    pass
```

## Basic Model Structure

```python
import uuid
from datetime import datetime
from typing import Optional, List

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.mysql import CHAR
from sqlalchemy.orm import Mapped, mapped_column, relationship

from db.models import Base


class Item(Base):
    """Item model with bilingual support."""
    
    __tablename__ = "item"

    # Primary key
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    
    # Bilingual name fields
    name_en: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    name_ar: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    
    # Bilingual description fields
    description_en: Mapped[Optional[str]] = mapped_column(String(256), nullable=True)
    description_ar: Mapped[Optional[str]] = mapped_column(String(256), nullable=True)
    
    # Status
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    
    # Timestamps (auto-managed)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
    
    # Helper methods
    def get_name(self, locale: Optional[str] = None) -> str:
        """Get name for specified locale."""
        return self.name_ar if locale == "ar" else self.name_en
    
    def get_description(self, locale: Optional[str] = None) -> Optional[str]:
        """Get description for specified locale."""
        return self.description_ar if locale == "ar" else self.description_en
    
    def __repr__(self) -> str:
        return f"<Item(id={self.id}, name_en='{self.name_en}')>"
```

## UUID Primary Key

```python
from sqlalchemy.dialects.mysql import CHAR

def uuid_column(
    primary_key: bool = False,
    nullable: bool = False,
    index: bool = False,
):
    """Create UUID column compatible with MySQL/MariaDB."""
    return mapped_column(
        CHAR(36),
        primary_key=primary_key,
        nullable=nullable,
        index=index,
        default=lambda: str(uuid.uuid4()) if primary_key else None,
    )


class User(Base):
    """User model with UUID primary key."""
    
    __tablename__ = "user"
    
    # UUID primary key (stored as CHAR(36))
    id: Mapped[str] = uuid_column(primary_key=True)
    
    username: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    email: Mapped[Optional[str]] = mapped_column(String(128), unique=True, nullable=True)
    full_name: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_blocked: Mapped[bool] = mapped_column(Boolean, default=False)
    
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )
```

## Foreign Key Relationships

```python
class Category(Base):
    """Category model."""
    
    __tablename__ = "category"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name_en: Mapped[str] = mapped_column(String(64), nullable=False)
    name_ar: Mapped[str] = mapped_column(String(64), nullable=False)
    
    # One-to-many: Category has many Items
    items: Mapped[List["Item"]] = relationship(back_populates="category")


class Item(Base):
    """Item model with category relationship."""
    
    __tablename__ = "item"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name_en: Mapped[str] = mapped_column(String(64), nullable=False)
    name_ar: Mapped[str] = mapped_column(String(64), nullable=False)
    
    # Foreign key
    category_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("category.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    
    # Many-to-one: Item belongs to Category
    category: Mapped[Optional["Category"]] = relationship(back_populates="items")
```

## Self-Referencing (Tree Structure)

```python
class Page(Base):
    """Page model with parent-child hierarchy."""
    
    __tablename__ = "page"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name_en: Mapped[str] = mapped_column(String(64), nullable=False)
    name_ar: Mapped[str] = mapped_column(String(64), nullable=False)
    
    # Self-referencing foreign key
    parent_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("page.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    order: Mapped[int] = mapped_column(Integer, default=100)
    
    # Self-referencing relationships
    parent: Mapped[Optional["Page"]] = relationship(
        "Page",
        remote_side=[id],
        back_populates="children",
    )
    children: Mapped[List["Page"]] = relationship(
        "Page",
        back_populates="parent",
        cascade="all, delete-orphan",
    )
```

## Many-to-Many (Association Table)

```python
class Role(Base):
    """Role model."""
    
    __tablename__ = "role"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name_en: Mapped[str] = mapped_column(String(64), nullable=False)
    name_ar: Mapped[str] = mapped_column(String(64), nullable=False)
    
    # Many-to-many via association
    page_permissions: Mapped[List["PagePermission"]] = relationship(
        back_populates="role"
    )


class PagePermission(Base):
    """Association table for Role-Page many-to-many."""
    
    __tablename__ = "page_permission"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    
    role_id: Mapped[int] = mapped_column(
        ForeignKey("role.id", ondelete="CASCADE"),
        nullable=False,
    )
    page_id: Mapped[int] = mapped_column(
        ForeignKey("page.id", ondelete="CASCADE"),
        nullable=False,
    )
    created_by_id: Mapped[str] = mapped_column(
        CHAR(36),
        ForeignKey("user.id"),
        nullable=False,
    )
    
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    
    # Relationships
    role: Mapped["Role"] = relationship(back_populates="page_permissions")
    page: Mapped["Page"] = relationship(back_populates="page_permissions")
    created_by: Mapped["User"] = relationship()
```

## Indexes and Constraints

```python
from sqlalchemy import Index, UniqueConstraint

class Item(Base):
    __tablename__ = "item"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name_en: Mapped[str] = mapped_column(String(64), nullable=False)
    name_ar: Mapped[str] = mapped_column(String(64), nullable=False)
    category_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("category.id"),
        nullable=True,
    )
    
    # Table-level constraints
    __table_args__ = (
        # Unique constraint on composite columns
        UniqueConstraint("name_en", "category_id", name="uq_item_name_category"),
        
        # Composite index for common queries
        Index("ix_item_category_active", "category_id", "is_active"),
        
        # Full-text search index (MySQL)
        Index("ix_item_name_fulltext", "name_en", "name_ar", mysql_prefix="FULLTEXT"),
    )
```

## Enum Columns

```python
import enum
from sqlalchemy import Enum

class StatusEnum(str, enum.Enum):
    """Status enumeration."""
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class Request(Base):
    __tablename__ = "request"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    
    status: Mapped[StatusEnum] = mapped_column(
        Enum(StatusEnum),
        nullable=False,
        default=StatusEnum.PENDING,
    )
```

## JSON Columns

```python
from sqlalchemy import JSON

class Config(Base):
    __tablename__ = "config"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    key: Mapped[str] = mapped_column(String(64), unique=True)
    
    # JSON data (dict or list)
    settings: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
```

## Audit Fields Pattern

```python
class AuditMixin:
    """Mixin for audit fields."""
    
    created_by_id: Mapped[Optional[str]] = mapped_column(
        CHAR(36),
        ForeignKey("user.id"),
        nullable=True,
    )
    updated_by_id: Mapped[Optional[str]] = mapped_column(
        CHAR(36),
        ForeignKey("user.id"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )


class Item(AuditMixin, Base):
    """Item with audit fields."""
    
    __tablename__ = "item"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name_en: Mapped[str] = mapped_column(String(64), nullable=False)
    # ... audit fields inherited from mixin
```

## Key Points

1. **Use Mapped[] type hints** - SQLAlchemy 2.0 style
2. **mapped_column() for all columns** - Explicit column definitions
3. **server_default for timestamps** - Database handles defaults
4. **onupdate for updated_at** - Auto-update on modification
5. **Use func.now()** - Database-level timestamp
6. **CHAR(36) for UUIDs** - MySQL/MariaDB compatible
7. **Bilingual fields** - name_en, name_ar pattern
8. **Index foreign keys** - Performance optimization
9. **Cascade delete** - Define in ForeignKey or relationship
