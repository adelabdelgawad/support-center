import { NextRequest, NextResponse } from 'next/server';
import { makeAuthenticatedRequest, ServerFetchError } from '@/lib/api/server-fetch';

type RouteParams = {
  params: Promise<{
    sectionId: string;
  }>;
};

/**
 * GET /api/service-sections/[sectionId]/technicians
 * Fetch all technicians assigned to a specific service section
 */
export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { sectionId } = await params;

    const data = await makeAuthenticatedRequest<unknown>(
      'GET',
      `/service-sections/${sectionId}/technicians`
    );

    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    console.error('Failed to fetch section technicians:', error);

    const status = error instanceof ServerFetchError ? error.status : 500;
    const message = error instanceof ServerFetchError
      ? (error.detail || error.message)
      : 'Failed to fetch section technicians';

    return NextResponse.json(
      { detail: message },
      { status }
    );
  }
}
