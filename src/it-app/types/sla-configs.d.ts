/**
 * SLA Configuration type definitions
 * Matches backend SLAConfigRead schema (camelCase via HTTPSchemaModel)
 */

export interface SLAConfigPriorityInfo {
  id: number;
  name: string;
}

export interface SLAConfigCategoryInfo {
  id: number;
  name: string;
  nameEn?: string | null;
  nameAr?: string | null;
}

export interface SLAConfigBusinessUnitInfo {
  id: number;
  name: string;
}

export interface SLAConfigResponse {
  id: number;
  priorityId: number;
  categoryId: number | null;
  businessUnitId: number | null;
  firstResponseMinutes: number;
  resolutionHours: number;
  businessHoursOnly: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  priority: SLAConfigPriorityInfo | null;
  category: SLAConfigCategoryInfo | null;
  businessUnit: SLAConfigBusinessUnitInfo | null;
}

export interface SLAConfigCreateRequest {
  priorityId: number;
  categoryId?: number | null;
  businessUnitId?: number | null;
  firstResponseMinutes: number;
  resolutionHours: number;
  businessHoursOnly: boolean;
}

export interface SLAConfigUpdateRequest {
  priorityId?: number;
  categoryId?: number | null;
  businessUnitId?: number | null;
  firstResponseMinutes?: number;
  resolutionHours?: number;
  businessHoursOnly?: boolean;
  isActive?: boolean;
}
