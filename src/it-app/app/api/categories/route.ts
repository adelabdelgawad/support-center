/**
 * API route for fetching categories with subcategories
 * GET /api/categories - Get all active categories with their subcategories
 *
 * Query params:
 * - section_id: Filter by service section ID
 * - include_subcategories: Whether to include subcategories (default: true)
 */

import { NextRequest, NextResponse } from 'next/server';
import { makeAuthenticatedRequest } from '@/lib/api/server-fetch';
import { handleRouteError } from '@/lib/api/route-error-handler';

interface Subcategory {
  id: number;
  categoryId: number;
  name: string;
  nameEn: string;
  nameAr: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface Category {
  id: number;
  name: string;
  nameEn: string;
  nameAr: string;
  description: string | null;
  sectionId: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  subcategories?: Subcategory[];
}

/**
 * GET - Fetch all categories with optional subcategories
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sectionId = searchParams.get('section_id');
    const includeSubcategories = searchParams.get('include_subcategories') !== 'false';

    // Build query string
    const queryParams = new URLSearchParams();
    queryParams.set('active_only', 'true');
    queryParams.set('include_subcategories', String(includeSubcategories));

    // Backend endpoint is /categories/categories (prefix /categories + route /categories)
    const response = await makeAuthenticatedRequest<Category[]>(
      'GET',
      `/categories/categories?${queryParams.toString()}`
    );

    // Filter by section if specified
    let categories = response || [];
    if (sectionId) {
      const parsedSectionId = parseInt(sectionId, 10);
      categories = categories.filter(cat => cat.sectionId === parsedSectionId);
    }

    return NextResponse.json({
      categories,
      total: categories.length,
    });
  } catch (error) {
    return handleRouteError(error, 'Fetch Categories');
  }
}
