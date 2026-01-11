import { NextResponse } from 'next/server';

/**
 * Health Check Endpoint for Frontend
 * Used by Docker health checks and monitoring
 */
export async function GET() {
  return NextResponse.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'frontend',
    uptime: process.uptime(),
  });
}
