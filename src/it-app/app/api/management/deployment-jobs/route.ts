import { NextRequest, NextResponse } from 'next/server';
import { makeAuthenticatedRequest, getServerErrorMessage } from '@/lib/api/server-fetch';

interface EnhancedError extends Error {
  status?: number;
  detail?: string;
}

/**
 * GET /api/setting/deployment-jobs
 * Fetches deployment jobs with filtering
 */
export async function GET(_request: NextRequest) {
  try {
    const searchParams = _request.nextUrl.searchParams;
    const response = await makeAuthenticatedRequest<unknown>(
      'GET',
      `/deployment-jobs?${searchParams.toString()}`
    );
    return NextResponse.json(response);
  } catch (error: unknown) {
    const message = getServerErrorMessage(error);
    const status = (error as EnhancedError).status || 500;
    return NextResponse.json({ detail: message }, { status });
  }
}

/**
 * POST /api/setting/deployment-jobs
 * Creates a new deployment job
 */
export async function POST(_request: NextRequest) {
  try {
    const body = await _request.json();
    const response = await makeAuthenticatedRequest<unknown>(
      'POST',
      `/deployment-jobs`,
      body
    );
    return NextResponse.json(response, { status: 201 });
  } catch (error: unknown) {
    const message = getServerErrorMessage(error);
    const status = (error as EnhancedError).status || 500;
    return NextResponse.json({ detail: message }, { status });
  }
}
