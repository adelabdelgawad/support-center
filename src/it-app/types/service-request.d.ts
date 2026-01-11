/**
 * Type definitions for service requests
 */

// Request body for creating a new service request
export interface CreateServiceRequestData {
  title: string;
}

// Query parameters for listing service requests
export interface ListServiceRequestsParams {
  page?: number;
  perPage?: number;
  statusId?: number;
  categoryId?: number;
  assignedTechnicianId?: string;  // Changed from number to string UUID
}

// Query parameters for technician views
export interface TechnicianViewsParams {
  view?: 'unassigned' | 'all_unsolved' | 'my_unsolved' | 'recently_updated' | 'recently_solved';
  page?: number;
  perPage?: number;
}

// Technician views response
export interface TechnicianViewsResponse {
  data: ServiceRequestSummary[];
  counts: {
    unassigned: number;
    allUnsolved: number;
    myUnsolved: number;
    recentlyUpdated: number;
    recentlySolved: number;
  };
  total: number;
  page: number;
  perPage: number;
}

// Service request summary (used in lists)
export interface ServiceRequestSummary {
  id: string;
  title: string;
  statusId: number;
  priorityId: number;
  requesterId: string;  // Changed from number to string UUID
  createdAt: string;
  updatedAt: string;
  status: {
    id: number;
    name: string;
    color: string | null;
  };
  priority: {
    id: number;
    name: string;
  };
  requester: {
    id: string;  // Changed from number to string UUID
    username: string;
    fullName: string | null;
  };
}
