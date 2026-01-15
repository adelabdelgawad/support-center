"""
Reset all running job executions to pending status.

This script is useful after a server crash or restart where
executions were left in 'running' state. It converts them to 'pending'
so they can be properly tracked and timed out.
"""

import asyncio
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import select, update, text
from core.database import get_session
from models.database_models import ScheduledJobExecution


async def reset_running_executions():
    """Convert all running and failed executions to pending status."""
    async for session in get_session():
        try:
            # Check current running and failed executions
            running_query = select(ScheduledJobExecution).where(
                ScheduledJobExecution.status.in_(["running", "failed"])
            )
            result = await session.execute(running_query)
            running_executions = result.scalars().all()

            print(f"Found {len(running_executions)} running/failed executions")

            if not running_executions:
                print("No running/failed executions to reset.")
                return

            # Update all running and failed executions to pending
            update_stmt = (
                update(ScheduledJobExecution)
                .where(ScheduledJobExecution.status.in_(["running", "failed"]))
                .values(
                    status="pending",
                    completed_at=None,
                    error_message=None,
                    error_traceback=None
                )
            )
            await session.execute(update_stmt)
            await session.commit()

            print(f"✓ Reset {len(running_executions)} executions to 'pending'")

        except Exception as e:
            await session.rollback()
            print(f"✗ Error resetting executions: {e}")
            raise
        finally:
            await session.close()
        break


async def update_executions_with_timeout():
    """Mark old pending/running executions as timed out."""
    async for session in get_session():
        try:
            # Use raw SQL to handle the timeout logic
            # Mark executions that have been pending/running for more than 1 hour as timeout
            query = text("""
                UPDATE scheduled_job_executions
                SET status = 'timeout',
                    completed_at = CURRENT_TIMESTAMP,
                    error_message = 'Execution timed out - reset after server restart'
                WHERE status IN ('pending', 'running')
                  AND started_at < NOW() - INTERVAL '1 hour'
            """)

            result = await session.execute(query)
            await session.commit()

            rows_affected = result.rowcount
            print(f"✓ Marked {rows_affected} old executions as 'timeout'")

        except Exception as e:
            await session.rollback()
            print(f"✗ Error updating timeout executions: {e}")
            raise
        finally:
            await session.close()
        break


async def show_execution_stats():
    """Show current execution statistics."""
    async for session in get_session():
        try:
            query = text("""
                SELECT status,
                       COUNT(*) as count,
                       COUNT(*) FILTER (WHERE started_at > NOW() - INTERVAL '1 hour') as recent
                FROM scheduled_job_executions
                GROUP BY status
                ORDER BY status
            """)
            result = await session.execute(query)
            rows = result.fetchall()

            print("\n📊 Execution Statistics:")
            print(f"{'Status':<12} | {'Total':>6} | {'Recent (1h)':>10}")
            print("-" * 34)
            for row in rows:
                print(f"{row[0]:<12} | {row[1]:>6} | {row[2]:>10}")

        except Exception as e:
            print(f"✗ Error getting stats: {e}")
        finally:
            await session.close()
        break


async def main():
    """Main function to reset running executions."""
    print("=" * 50)
    print("Resetting Running Job Executions")
    print("=" * 50)

    # Show current stats
    await show_execution_stats()
    print()

    # Reset running to pending
    await reset_running_executions()
    print()

    # Update old pending/running as timeout (optional - comment out if not needed)
    # await update_executions_with_timeout()
    # print()

    # Show updated stats
    print("Updated statistics:")
    await show_execution_stats()

    print("\n✓ Done!")


if __name__ == "__main__":
    asyncio.run(main())
