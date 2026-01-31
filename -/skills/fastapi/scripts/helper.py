#!/usr/bin/env python3
"""
FastAPI Template Helper Script

Utilities for generating FastAPI components.

Usage:
    python helper.py validate           # Validate project structure
    python helper.py generate NAME      # Generate full CRUD for entity
    python helper.py router NAME        # Generate router only
    python helper.py service NAME       # Generate service only
    python helper.py repository NAME    # Generate repository only
    python helper.py schema NAME        # Generate schemas only
    python helper.py model NAME         # Generate model only
"""

import sys
import os
import re

def to_pascal(name: str) -> str:
    """Convert to PascalCase."""
    return ''.join(word.capitalize() for word in name.split('_'))

def to_snake(name: str) -> str:
    """Convert to snake_case."""
    return re.sub(r'(?<!^)(?=[A-Z])', '_', name).lower()

def validate_structure():
    """Validate FastAPI project structure."""
    print("Validating FastAPI project structure...")
    
    required_dirs = [
        'api/routes',
        'api/services',
        'api/repositories',
        'api/schemas',
        'models',
        'db',
    ]
    
    required_files = [
        'main.py',
        'settings.py',
        'db/session.py',
        'db/base.py',
    ]
    
    issues = []
    
    for dir_path in required_dirs:
        if os.path.isdir(dir_path):
            print(f"✓ {dir_path}/")
        else:
            issues.append(f"✗ Missing directory: {dir_path}/")
    
    for file_path in required_files:
        if os.path.exists(file_path):
            print(f"✓ {file_path}")
        else:
            issues.append(f"✗ Missing file: {file_path}")
    
    if issues:
        print("\nIssues found:")
        for issue in issues:
            print(f"  {issue}")
    else:
        print("\n✓ Project structure is valid!")

def generate_router(name: str):
    """Generate router file."""
    pascal = to_pascal(name)
    snake = to_snake(name)
    
    os.makedirs('api/routes', exist_ok=True)
    
    template = f'''from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional

from db.session import get_db
from api.services.{snake}_service import {pascal}Service
from api.schemas.{snake} import {pascal}Create, {pascal}Update, {pascal}Response, {pascal}sResponse

router = APIRouter(prefix="/{snake}s", tags=["{snake}s"])


@router.get("/", response_model={pascal}sResponse)
async def list_{snake}s(
    limit: int = Query(default=10, ge=1, le=100),
    skip: int = Query(default=0, ge=0),
    search: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    """List {snake}s with pagination."""
    service = {pascal}Service(db)
    filters = {{"search": search}} if search else {{}}
    items, total = await service.list(limit=limit, skip=skip, filters=filters)
    return {pascal}sResponse(items=items, total=total, limit=limit, skip=skip)


@router.get("/{{{snake}_id}}", response_model={pascal}Response)
async def get_{snake}({snake}_id: str, db: AsyncSession = Depends(get_db)):
    """Get {snake} by ID."""
    service = {pascal}Service(db)
    item = await service.get_by_id({snake}_id)
    if not item:
        raise HTTPException(status_code=404, detail="{pascal} not found")
    return item


@router.post("/", response_model={pascal}Response, status_code=201)
async def create_{snake}(data: {pascal}Create, db: AsyncSession = Depends(get_db)):
    """Create a new {snake}."""
    service = {pascal}Service(db)
    return await service.create(data)


@router.put("/{{{snake}_id}}", response_model={pascal}Response)
async def update_{snake}(
    {snake}_id: str, 
    data: {pascal}Update, 
    db: AsyncSession = Depends(get_db)
):
    """Update {snake}."""
    service = {pascal}Service(db)
    item = await service.update({snake}_id, data)
    if not item:
        raise HTTPException(status_code=404, detail="{pascal} not found")
    return item


@router.delete("/{{{snake}_id}}", status_code=204)
async def delete_{snake}({snake}_id: str, db: AsyncSession = Depends(get_db)):
    """Delete {snake}."""
    service = {pascal}Service(db)
    deleted = await service.delete({snake}_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="{pascal} not found")
'''
    
    filepath = f"api/routes/{snake}.py"
    with open(filepath, 'w') as f:
        f.write(template)
    print(f"✓ Created {filepath}")

def generate_service(name: str):
    """Generate service file."""
    pascal = to_pascal(name)
    snake = to_snake(name)
    
    os.makedirs('api/services', exist_ok=True)
    
    template = f'''from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional, Tuple, List
from uuid import uuid4
from datetime import datetime

from models.{snake} import {pascal}
from api.repositories.{snake}_repository import {pascal}Repository
from api.schemas.{snake} import {pascal}Create, {pascal}Update


class {pascal}Service:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.repository = {pascal}Repository(db)
    
    async def list(
        self,
        limit: int = 10,
        skip: int = 0,
        filters: dict = None
    ) -> Tuple[List[{pascal}], int]:
        """List with filters."""
        return await self.repository.list(limit=limit, skip=skip, filters=filters)
    
    async def get_by_id(self, id: str) -> Optional[{pascal}]:
        """Get by ID."""
        return await self.repository.get_by_id(id)
    
    async def create(self, data: {pascal}Create) -> {pascal}:
        """Create new record."""
        item = {pascal}(
            id=str(uuid4()),
            **data.model_dump(),
            created_at=datetime.utcnow(),
        )
        return await self.repository.create(item)
    
    async def update(self, id: str, data: {pascal}Update) -> Optional[{pascal}]:
        """Update record."""
        item = await self.repository.get_by_id(id)
        if not item:
            return None
        
        update_data = data.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(item, field, value)
        
        item.updated_at = datetime.utcnow()
        return await self.repository.update(item)
    
    async def delete(self, id: str) -> bool:
        """Delete record."""
        return await self.repository.delete(id)
'''
    
    filepath = f"api/services/{snake}_service.py"
    with open(filepath, 'w') as f:
        f.write(template)
    print(f"✓ Created {filepath}")

def generate_repository(name: str):
    """Generate repository file."""
    pascal = to_pascal(name)
    snake = to_snake(name)
    
    os.makedirs('api/repositories', exist_ok=True)
    
    template = f'''from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, delete
from typing import Optional, Tuple, List

from models.{snake} import {pascal}


class {pascal}Repository:
    def __init__(self, db: AsyncSession):
        self.db = db
    
    async def list(
        self,
        limit: int = 10,
        skip: int = 0,
        filters: dict = None
    ) -> Tuple[List[{pascal}], int]:
        """List with pagination and filters."""
        query = select({pascal})
        count_query = select(func.count({pascal}.id))
        
        # Apply filters
        if filters and "search" in filters and filters["search"]:
            search = f"%{{filters['search']}}%"
            query = query.where({pascal}.name.ilike(search))
            count_query = count_query.where({pascal}.name.ilike(search))
        
        total = await self.db.scalar(count_query)
        query = query.offset(skip).limit(limit).order_by({pascal}.created_at.desc())
        
        result = await self.db.execute(query)
        items = result.scalars().all()
        
        return list(items), total or 0
    
    async def get_by_id(self, id: str) -> Optional[{pascal}]:
        """Get by ID."""
        query = select({pascal}).where({pascal}.id == id)
        result = await self.db.execute(query)
        return result.scalar_one_or_none()
    
    async def create(self, item: {pascal}) -> {pascal}:
        """Create new record."""
        self.db.add(item)
        await self.db.commit()
        await self.db.refresh(item)
        return item
    
    async def update(self, item: {pascal}) -> {pascal}:
        """Update record."""
        await self.db.commit()
        await self.db.refresh(item)
        return item
    
    async def delete(self, id: str) -> bool:
        """Delete record."""
        query = delete({pascal}).where({pascal}.id == id)
        result = await self.db.execute(query)
        await self.db.commit()
        return result.rowcount > 0
'''
    
    filepath = f"api/repositories/{snake}_repository.py"
    with open(filepath, 'w') as f:
        f.write(template)
    print(f"✓ Created {filepath}")

def generate_schema(name: str):
    """Generate schema file."""
    pascal = to_pascal(name)
    snake = to_snake(name)
    
    os.makedirs('api/schemas', exist_ok=True)
    
    template = f'''from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


class {pascal}Base(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    # Add more fields here


class {pascal}Create({pascal}Base):
    """Schema for creating."""
    pass


class {pascal}Update(BaseModel):
    """Schema for updating."""
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    # Add more optional fields here


class {pascal}Response({pascal}Base):
    """Schema for response."""
    id: str
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True


class {pascal}sResponse(BaseModel):
    """Schema for paginated response."""
    items: List[{pascal}Response]
    total: int
    limit: int
    skip: int
'''
    
    filepath = f"api/schemas/{snake}.py"
    with open(filepath, 'w') as f:
        f.write(template)
    print(f"✓ Created {filepath}")

def generate_model(name: str):
    """Generate model file."""
    pascal = to_pascal(name)
    snake = to_snake(name)
    
    os.makedirs('models', exist_ok=True)
    
    template = f'''from sqlalchemy import Column, String, DateTime
from datetime import datetime

from db.base import Base


class {pascal}(Base):
    __tablename__ = "{snake}s"
    
    id = Column(String, primary_key=True)
    name = Column(String(100), nullable=False)
    # Add more columns here
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, onupdate=datetime.utcnow)
    
    def __repr__(self):
        return f"<{pascal} {{self.id}}>"
'''
    
    filepath = f"models/{snake}.py"
    with open(filepath, 'w') as f:
        f.write(template)
    print(f"✓ Created {filepath}")

def generate_all(name: str):
    """Generate all components for an entity."""
    print(f"Generating CRUD components for: {name}")
    generate_model(name)
    generate_schema(name)
    generate_repository(name)
    generate_service(name)
    generate_router(name)
    print(f"\n✓ All components generated for {name}")
    print(f"\nDon't forget to:")
    print(f"  1. Import router in main.py")
    print(f"  2. Import model in models/__init__.py")
    print(f"  3. Run migrations")

def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    
    command = sys.argv[1]
    
    if command == 'validate':
        validate_structure()
    elif command in ['generate', 'router', 'service', 'repository', 'schema', 'model']:
        if len(sys.argv) < 3:
            print(f"Usage: python helper.py {command} NAME")
            sys.exit(1)
        
        name = sys.argv[2]
        
        if command == 'generate':
            generate_all(name)
        elif command == 'router':
            generate_router(name)
        elif command == 'service':
            generate_service(name)
        elif command == 'repository':
            generate_repository(name)
        elif command == 'schema':
            generate_schema(name)
        elif command == 'model':
            generate_model(name)
    else:
        print(f"Unknown command: {command}")
        print(__doc__)
        sys.exit(1)

if __name__ == '__main__':
    main()
