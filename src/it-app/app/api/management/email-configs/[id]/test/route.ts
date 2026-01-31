/**
 * Test Email Configuration API Route
 *
 * POST /api/management/email-configs/[id]/test - Send test email
 */

import { NextRequest, NextResponse } from "next/server";
import { makeAuthenticatedRequest } from "@/lib/api/server-fetch";

interface RouteParams {
  params: Promise<{
    id: string;
  }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();

    const response = await makeAuthenticatedRequest<any>(
      "POST",
      `/email-configs/${id}/test`,
      body
    );

    return NextResponse.json(response);
  } catch (error: any) {
    console.error(`Failed to test email config ${(await params).id}:`, error);
    return NextResponse.json(
      {
        success: false,
        message: error.message || "Failed to test email configuration",
        details: error.details,
      },
      { status: error.status || 500 }
    );
  }
}
