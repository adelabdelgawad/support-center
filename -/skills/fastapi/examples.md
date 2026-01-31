# FastAPI Template Examples

Real-world examples for FastAPI backend patterns.

## Example 1: Complete CRUD Router

```python
# api/routes/users.py
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional

from db.session import get_db
from api.services.user_service import UserService
from api.schemas.user import UserCreate, UserUpdate, UserResponse, UsersResponse

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/", response_model=UsersResponse)
async def list_users(
    limit: int = Query(default=10, ge=1, le=100),
    skip: int = Query(default=0, ge=0),
    search: Optional[str] = None,
    is_active: Optional[bool] = None,
    db: AsyncSession = Depends(get_db),
):
    """List users with pagination and filtering."""
    service = UserService(db)
    filters = {}
    if search:
        filters["search"] = search
    if is_active is not None:
        filters["is_active"] = is_active
    
    items, total = await service.list(limit=limit, skip=skip, filters=filters)
    return UsersResponse(items=items, total=total, limit=limit, skip=skip)


@router.get("/{user_id}", response_model=UserResponse)
async def get_user(user_id: str, db: AsyncSession = Depends(get_db)):
    """Get user by ID."""
    service = UserService(db)
    user = await service.get_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.post("/", response_model=UserResponse, status_code=201)
async def create_user(data: UserCreate, db: AsyncSession = Depends(get_db)):
    """Create a new user."""
    service = UserService(db)
    
    # Check for duplicate email
    existing = await service.get_by_email(data.email)
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    user = await service.create(data)
    return user


@router.put("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: str, 
    data: UserUpdate, 
    db: AsyncSession = Depends(get_db)
):
    """Update user."""
    service = UserService(db)
    user = await service.update(user_id, data)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.delete("/{user_id}", status_code=204)
async def delete_user(user_id: str, db: AsyncSession = Depends(get_db)):
    """Delete user."""
    service = UserService(db)
    deleted = await service.delete(user_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="User not found")


@router.put("/{user_id}/status")
async def toggle_user_status(
    user_id: str,
    is_active: bool,
    db: AsyncSession = Depends(get_db)
):
    """Toggle user active status."""
    service = UserService(db)
    user = await service.update_status(user_id, is_active)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {"status": "updated", "is_active": user.is_active}
```

## Example 2: Service Layer

```python
# api/services/user_service.py
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_
from typing import Optional, Tuple, List
from uuid import uuid4
from datetime import datetime

from models.user import User
from api.crud import users as users_crud
from api.schemas.user import UserCreate, UserUpdate


class UserService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.repository = UserRepository(db)
    
    async def list(
        self,
        limit: int = 10,
        skip: int = 0,
        filters: dict = None
    ) -> Tuple[List[User], int]:
        """List users with filters."""
        return await self.repository.list(limit=limit, skip=skip, filters=filters)
    
    async def get_by_id(self, user_id: str) -> Optional[User]:
        """Get user by ID."""
        return await self.repository.get_by_id(user_id)
    
    async def get_by_email(self, email: str) -> Optional[User]:
        """Get user by email."""
        return await self.repository.get_by_email(email)
    
    async def create(self, data: UserCreate) -> User:
        """Create new user."""
        user = User(
            id=str(uuid4()),
            name=data.name,
            email=data.email,
            role=data.role or "user",
            is_active=True,
            created_at=datetime.utcnow(),
        )
        return await self.repository.create(user)
    
    async def update(self, user_id: str, data: UserUpdate) -> Optional[User]:
        """Update user."""
        user = await self.repository.get_by_id(user_id)
        if not user:
            return None
        
        update_data = data.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(user, field, value)
        
        user.updated_at = datetime.utcnow()
        return await self.repository.update(user)
    
    async def delete(self, user_id: str) -> bool:
        """Delete user."""
        return await self.repository.delete(user_id)
    
    async def update_status(self, user_id: str, is_active: bool) -> Optional[User]:
        """Update user status."""
        user = await self.repository.get_by_id(user_id)
        if not user:
            return None
        
        user.is_active = is_active
        user.updated_at = datetime.utcnow()
        return await self.repository.update(user)
```

## Example 3: Repository Pattern

```python
# api/crud/users.py
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, delete
from sqlalchemy.orm import selectinload
from typing import Optional, Tuple, List

from models.user import User


class UserRepository:
    def __init__(self, db: AsyncSession):
        self.db = db
    
    async def list(
        self,
        limit: int = 10,
        skip: int = 0,
        filters: dict = None
    ) -> Tuple[List[User], int]:
        """List with pagination and filters."""
        query = select(User)
        count_query = select(func.count(User.id))
        
        # Apply filters
        if filters:
            if "search" in filters:
                search = f"%{filters['search']}%"
                query = query.where(
                    or_(
                        User.name.ilike(search),
                        User.email.ilike(search)
                    )
                )
                count_query = count_query.where(
                    or_(
                        User.name.ilike(search),
                        User.email.ilike(search)
                    )
                )
            
            if "is_active" in filters:
                query = query.where(User.is_active == filters["is_active"])
                count_query = count_query.where(User.is_active == filters["is_active"])
        
        # Get total count
        total = await self.db.scalar(count_query)
        
        # Apply pagination
        query = query.offset(skip).limit(limit).order_by(User.created_at.desc())
        
        result = await self.db.execute(query)
        items = result.scalars().all()
        
        return list(items), total or 0
    
    async def get_by_id(self, user_id: str) -> Optional[User]:
        """Get by ID."""
        query = select(User).where(User.id == user_id)
        result = await self.db.execute(query)
        return result.scalar_one_or_none()
    
    async def get_by_email(self, email: str) -> Optional[User]:
        """Get by email."""
        query = select(User).where(User.email == email)
        result = await self.db.execute(query)
        return result.scalar_one_or_none()
    
    async def create(self, user: User) -> User:
        """Create new record."""
        self.db.add(user)
        await self.db.commit()
        await self.db.refresh(user)
        return user
    
    async def update(self, user: User) -> User:
        """Update record."""
        await self.db.commit()
        await self.db.refresh(user)
        return user
    
    async def delete(self, user_id: str) -> bool:
        """Delete record."""
        query = delete(User).where(User.id == user_id)
        result = await self.db.execute(query)
        await self.db.commit()
        return result.rowcount > 0
```

## Example 4: Pydantic Schemas

```python
# api/schemas/user.py
from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List
from datetime import datetime


class UserBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    email: EmailStr
    role: Optional[str] = "user"


class UserCreate(UserBase):
    """Schema for creating a user."""
    pass


class UserUpdate(BaseModel):
    """Schema for updating a user."""
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    email: Optional[EmailStr] = None
    role: Optional[str] = None


class UserResponse(UserBase):
    """Schema for user response."""
    id: str
    is_active: bool
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True


class UsersResponse(BaseModel):
    """Schema for paginated users response."""
    items: List[UserResponse]
    total: int
    limit: int
    skip: int
```

## Example 5: SQLAlchemy Model

```python
# models/user.py
from sqlalchemy import Column, String, Boolean, DateTime, Text
from sqlalchemy.orm import relationship
from datetime import datetime

from db.base import Base


class User(Base):
    __tablename__ = "users"
    
    id = Column(String, primary_key=True)
    name = Column(String(100), nullable=False)
    email = Column(String(255), unique=True, nullable=False, index=True)
    role = Column(String(50), default="user")
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, onupdate=datetime.utcnow)
    
    # Relationships
    # profile = relationship("UserProfile", back_populates="user", uselist=False)
    # orders = relationship("Order", back_populates="user")
    
    def __repr__(self):
        return f"<User {self.email}>"
```

## Example 6: Database Session

```python
# db/session.py
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import sessionmaker
from contextlib import asynccontextmanager

from settings import settings

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)


async def get_db() -> AsyncSession:
    """FastAPI dependency for database sessions."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()


@asynccontextmanager
async def get_db_context() -> AsyncSession:
    """Context manager for database sessions."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()
```

## Example 7: Main Application

```python
# main.py
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routes import users, auth, health
from settings import settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    print("Starting application...")
    yield
    # Shutdown
    print("Shutting down...")


app = FastAPI(
    title=settings.PROJECT_NAME,
    version="1.0.0",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routes
app.include_router(health.router, tags=["health"])
app.include_router(auth.router, prefix="/api/v1")
app.include_router(users.router, prefix="/api/v1")
```

## Directory Structure

```
src/backend/
├── main.py
├── settings.py
├── celery_app.py
├── api/
│   ├── routes/
│   │   ├── __init__.py
│   │   ├── users.py
│   │   └── auth.py
│   ├── services/
│   │   ├── __init__.py
│   │   └── user_service.py
│   ├── repositories/
│   │   ├── __init__.py
│   │   └── user_repository.py
│   └── schemas/
│       ├── __init__.py
│       └── user.py
├── models/
│   ├── __init__.py
│   └── user.py
├── db/
│   ├── __init__.py
│   ├── base.py
│   └── session.py
└── tasks/
    ├── __init__.py
    └── celery_bridge.py
```
