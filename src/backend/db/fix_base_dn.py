"""
Fix the base DN for the Active Directory configuration
"""
import asyncio
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select
from core.config import settings
from db.models import ActiveDirectoryConfig

async def main():
    # Connect to database
    engine = create_async_engine(str(settings.database.url), echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        # Get active AD config
        result = await session.execute(
            select(ActiveDirectoryConfig).where(ActiveDirectoryConfig.is_active)
        )
        config = result.scalar_one_or_none()

        if not config:
            print("No active AD config found")
            return

        print("Current Config:")
        print(f"  Name: {config.name}")
        print(f"  Domain: {config.domain_name}")
        print(f"  Current Base DN: {config.base_dn}")
        print()

        # Compute correct base DN from domain name
        domain_parts = config.domain_name.split('.')
        correct_base_dn = ','.join([f"DC={part}" for part in domain_parts])

        print(f"  Correct Base DN: {correct_base_dn}")
        print()

        if config.base_dn == correct_base_dn:
            print("Base DN is already correct!")
            return

        # Update base DN
        config.base_dn = correct_base_dn
        session.add(config)
        await session.commit()

        print(f"✓ Updated base DN to: {correct_base_dn}")

if __name__ == "__main__":
    asyncio.run(main())
