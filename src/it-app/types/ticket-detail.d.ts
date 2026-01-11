/**
 * Type definitions for ticket detail page
 */

import type { Tag, Category, Subcategory } from "./tag";

// Backend response types (camelCase from HTTPSchemaModel)
export interface ServiceRequestDetail {
  id: string;
  title: string;
  description?: string;
  statusId: number;
  priorityId: number;
  requesterId: string;  // Changed from number to string UUID
  tagId?: number | null;  // Request classification tag
  subcategoryId?: number | null;  // Subcategory for the request
  createdAt: string;
  updatedAt: string;

  // Audit trail timestamps
  assignedAt?: string | null;
  firstResponseAt?: string | null;
  resolvedAt?: string | null;
  closedAt?: string | null;

  status: {
    id: number;
    name: string;
    nameEn: string;
    nameAr: string;
    color: string | null;
    countAsSolved?: boolean;
  };
  priority: {
    id: number;
    name: string;
    responseTimeMinutes: number;
    resolutionTimeHours: number;
  };
  requester: {
    id: string;  // Changed from number to string UUID
    username: string;
    fullName: string | null;
    email: string | null;
    phoneNumber: string | null;
    title: string | null;
    office: string | null;
    managerId: string | null;  // Changed from number to string UUID
    managerName: string | null;
  };
  tag?: Tag | null;  // Tag with category information
  subcategory?: Subcategory | null;  // Subcategory with category information

  // Sub-task parent information (if this request is a sub-task)
  parentRequestId?: string | null;
  parentRequestTitle?: string | null;

  // Technician who created this subtask (for subtasks only)
  createdByTechnician?: {
    id: string;
    username: string;
    fullName: string | null;
    email: string | null;
    office: string | null;
  } | null;
}

// UI types for displaying formatted messages
export interface MessageData {
  id: string;
  author: string;
  authorInitials: string;
  timestamp: string;
  content: string;
  isCurrentUser: boolean;
  isScreenshot?: boolean;
  screenshotFileName?: string | null;
  /** File attachment fields (non-image files like PDF, DOC, etc.) */
  fileName?: string | null;
  fileSize?: number | null;
  fileMimeType?: string | null;
}

// UI types for user information display
export interface UserData {
  name: string;
  initials: string;
  email: string;
  title: string;
  directManager: string;
  office: string;
  phoneNumber: string;
}
