/**
 * Common API response types used across all action files
 */

export interface ErrorResponse {
  detail: string;
}

export interface SuccessResponse {
  message: string;
  success: boolean;
}

export interface PaginatedResponse<T> {
  _data: T[];
  total: number;
  page: number;
  limit: number;
}
