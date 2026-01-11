/**
 * Request Types type definitions
 * Converted from backend snake_case to camelCase for frontend use
 * Supports bilingual names (English/Arabic) and brief hints
 */

export interface RequestType {
  id: number;
  nameEn: string;
  nameAr: string;
  briefEn?: string | null;
  briefAr?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RequestTypeListItem {
  id: number;
  nameEn: string;
  nameAr: string;
  briefEn?: string | null;
  briefAr?: string | null;
  isActive: boolean;
}

export interface RequestTypeListResponse {
  types: RequestType[];
  total: number;
  activeCount: number;
  inactiveCount: number;
}

export interface RequestTypeCreate {
  nameEn: string;
  nameAr: string;
  briefEn?: string | null;
  briefAr?: string | null;
  isActive?: boolean;
}

export interface RequestTypeUpdate {
  nameEn?: string | null;
  nameAr?: string | null;
  briefEn?: string | null;
  briefAr?: string | null;
  isActive?: boolean | null;
}

export interface BulkRequestTypeUpdate {
  typeIds: number[];
  isActive: boolean;
}

export interface RequestTypeCountsResponse {
  total: number;
  activeCount: number;
  inactiveCount: number;
}
