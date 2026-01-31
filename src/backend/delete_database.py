#!/usr/bin/env python3
"""
Simple Database Deletion Module
===============================

This module provides a simple database deletion function with basic confirmation.
Only asks "Are you sure you want to delete? y/N"
"""
import asyncio
import logging

import asyncpg
from sqlalchemy import inspect, text

from core.config import settings
from db.database import engine

logger = logging.getLogger(__name__)


async def delete_database():
    """
    Simple database deletion with confirmation question.
    Only asks: "Are you sure you want to delete? y/N"
    """
    try:
        print("🗑️  Database Deletion")
        print("=" * 40)

        # Get database info
        db_info = await get_database_info()
        if db_info.get("error"):
            print(f"❌ Error: {db_info['error']}")
            return False

        print(f"Database: {db_info['database_name']}")
        print(f"Tables: {db_info['table_count']}")
        print(f"Size: {db_info['size_pretty']}")
        print("=" * 40)

        # Simple confirmation
        response = (
            input("Are you sure you want to delete? y/N: ").strip().lower()
        )

        if response != "y":
            print("❌ Deletion cancelled")
            return False

        print("🔄 Deleting database...")

        # Drop all tables
        success = await drop_all_tables()

        if success:
            print("✅ Database deleted successfully!")
            return True
        else:
            print("❌ Failed to delete database")
            return False

    except KeyboardInterrupt:
        print("\n❌ Deletion cancelled by user")
        return False
    except Exception as e:
        print(f"❌ Error: {e}")
        logger.error(f"Database deletion failed: {e}")
        return False


async def get_database_info():
    """Get basic database information."""
    try:
        database_url = str(settings.database.url)

        # Handle asyncpg URL format - remove the +asyncpg part
        if "+asyncpg" in database_url:
            base_url = database_url.replace("+asyncpg", "")
        else:
            base_url = database_url

        if "/" in base_url:
            db_name = base_url.split("/")[-1]
            postgres_url = "/".join(base_url.split("/")[:-1]) + "/postgres"
        else:
            return {"error": "Invalid database URL format"}

        conn = await asyncpg.connect(postgres_url)
        try:
            # Get database size
            size_result = await conn.fetchrow(
                "SELECT pg_size_pretty(pg_database_size($1)) as size", db_name
            )

            # Get table count
            table_count_result = await conn.fetchrow(
                "SELECT count(*) as table_count FROM information_schema.tables WHERE table_schema = 'public'"
            )

            return {
                "database_name": db_name,
                "size_pretty": size_result["size"],
                "table_count": table_count_result["table_count"],
            }
        finally:
            await conn.close()

    except Exception as e:
        return {"error": str(e)}


async def drop_all_tables():
    """Drop all tables in the database."""
    try:
        async with engine.begin() as conn:
            # Get table names using run_sync
            def get_tables(sync_conn):
                inspector = inspect(sync_conn)
                return inspector.get_table_names()

            tables = await conn.run_sync(get_tables)

            if not tables:
                print("No tables to delete")
                return True

            print(f"Deleting {len(tables)} tables...")

            # Drop all tables
            for table_name in tables:
                await conn.execute(
                    text(f"DROP TABLE IF EXISTS {table_name} CASCADE")
                )
                print(f"  ✓ Dropped {table_name}")

            return True

    except Exception as e:
        print(f"Error dropping tables: {e}")
        return False


if __name__ == "__main__":
    # Run the deletion
    result = asyncio.run(delete_database())
    exit(0 if result else 1)
