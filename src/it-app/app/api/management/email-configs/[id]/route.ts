/**
 * Email Configuration API Route (by ID)
 *
 * GET    /api/management/email-configs/[id] - Get email configuration by ID
 * PUT    /api/management/email-configs/[id] - Update email configuration
 * DELETE /api/management/email-configs/[id] - Delete email configuration
 */

import { NextRequest, NextResponse } from "next/server";
import { makeAuthenticatedRequest } from "@/lib/api/server-fetch";

interface RouteParams {
  params: Promise<{
    id: string;
  }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    const response = await makeAuthenticatedRequest<any>(
      "GET",
      `/email-configs/${id}`
    );

    return NextResponse.json(response);
  } catch (error: any) {
    console.error(`Failed to fetch email config ${(await params).id}:`, error);
    return NextResponse.json(
      { detail: error.message || "Email configuration not found" },
      { status: error.status || 404 }
    );
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();

    const response = await makeAuthenticatedRequest<any>(
      "PUT",
      `/email-configs/${id}`,
      body
    );

    return NextResponse.json(response);
  } catch (error: any) {
    console.error(`Failed to update email config ${(await params).id}:`, error);
    return NextResponse.json(
      { detail: error.message || "Failed to update email configuration" },
      { status: error.status || 400 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    await makeAuthenticatedRequest<any>("DELETE", `/email-configs/${id}`);

    return new NextResponse(null, { status: 204 });
  } catch (error: any) {
    console.error(`Failed to delete email config ${(await params).id}:`, error);
    return NextResponse.json(
      { detail: error.message || "Failed to delete email configuration" },
      { status: error.status || 404 }
    );
  }
}
