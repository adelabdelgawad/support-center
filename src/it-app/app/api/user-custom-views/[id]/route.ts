/**
 * API route for single custom view operations - Get, Update, Delete
 */

import { NextRequest, NextResponse } from 'next/server';
import { makeAuthenticatedRequest } from '@/lib/api/server-fetch';
import type { UserCustomView } from '@/types/custom-views';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const response = await makeAuthenticatedRequest<UserCustomView>(
      'GET',
      `/user-custom-views/${id}`
    );

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error fetching custom view:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch custom view';
    const status = (error as { status?: number }).status || 500;
    return NextResponse.json({ detail: message }, { status });
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();
    const response = await makeAuthenticatedRequest<UserCustomView>(
      'PUT',
      `/user-custom-views/${id}`,
      body
    );

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error updating custom view:', error);
    const message = error instanceof Error ? error.message : 'Failed to update custom view';
    const status = (error as { status?: number }).status || 500;
    return NextResponse.json({ detail: message }, { status });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    await makeAuthenticatedRequest<void>(
      'DELETE',
      `/user-custom-views/${id}`
    );

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('Error deleting custom view:', error);
    const message = error instanceof Error ? error.message : 'Failed to delete custom view';
    const status = (error as { status?: number }).status || 500;
    return NextResponse.json({ detail: message }, { status });
  }
}
