"""Initialize database tables from SQLModel models."""
import asyncio
from sqlmodel import SQLModel
from core.database import engine

async def init_db():
    """Create all tables."""
    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)
    print("Database tables created successfully!")

if __name__ == "__main__":
    asyncio.run(init_db())
