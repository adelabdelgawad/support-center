/**
 * Type definitions for ticket metadata (technicians, priorities, notes, statuses)
 */

// Technician information
export interface Technician {
  id: string;  // UUID string from backend
  username: string;
  fullName: string | null;
  title: string | null;
}

// Request status information
export interface RequestStatus {
  id: number;
  name: string;
  nameEn: string;
  nameAr: string;
  color: string | null;
  description?: string | null;
  readonly?: boolean;
  isActive?: boolean;
  countAsSolved?: boolean;
}

// Priority information
export interface Priority {
  id: number;
  name: string;
  responseTimeMinutes: number;
  resolutionTimeHours: number;
}

// Request note
export interface RequestNote {
  id: number;
  requestId: string;
  note: string;
  createdAt: string;
  updatedAt: string;
  createdBy: {
    id: number;
    username: string;
    fullName: string | null;
  };
}

// Note creation payload
export interface CreateNoteData {
  requestId: string;
  note: string;
}
