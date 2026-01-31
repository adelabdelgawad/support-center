import { NextRequest, NextResponse } from 'next/server';
import { makeAuthenticatedRequest } from '@/lib/api/server-fetch';
import { ApiError } from '@/lib/fetch/errors';

/**
 * GET /api/service-sections
 * Fetch all active service sections (responsible teams)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const onlyActive = searchParams.get('only_active') ?? 'true';
    const onlyShown = searchParams.get('only_shown') ?? 'false';
    const includeTechnicians = searchParams.get('include_technicians') ?? 'false';

    const queryParams = new URLSearchParams({
      only_active: onlyActive,
      only_shown: onlyShown,
      include_technicians: includeTechnicians,
    });

    const data = await makeAuthenticatedRequest<unknown>(
      'GET',
      `/service-sections?${queryParams.toString()}`
    );

    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    console.error('Failed to fetch service sections:', error);

    const status = error instanceof ApiError ? error.status : 500;
    const message = error instanceof ApiError
      ? (error.message)
      : 'Failed to fetch service sections';

    return NextResponse.json(
      { detail: message },
      { status }
    );
  }
}
