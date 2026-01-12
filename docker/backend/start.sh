#!/bin/bash
# =============================================================================
# Backend Container Startup Script
# =============================================================================
# This script handles conditional database migration execution at container start.
#
# Environment Variables:
#   RUN_MIGRATIONS - Set to "true" to run migrations before starting the server
#                    Default: "false" (skip migrations for faster restarts)
#
# Usage:
#   Normal restart (fast): RUN_MIGRATIONS=false or not set
#   Fresh deployment: RUN_MIGRATIONS=true
# =============================================================================

set -e  # Exit on error

echo "Starting backend service..."

# Check if migrations should be run
if [ "$RUN_MIGRATIONS" = "true" ]; then
    echo "RUN_MIGRATIONS is set to true - running database initialization..."
    python init_db.py
    echo "Stamping alembic head version..."
    alembic stamp head
    echo "Database initialization complete."
else
    echo "RUN_MIGRATIONS is not set or false - skipping database initialization."
    echo "Assuming database is already initialized and migrations are applied."
fi

# Start the application server
echo "Starting uvicorn server..."
exec uvicorn main:app --host 0.0.0.0 --port 8000
