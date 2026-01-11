export interface SubTask {
  id: string;
  requestId: string;
  title: string;
  description?: string;
  statusId: number;
  priorityId: number;
  assignedToSectionId?: number;
  assignedToTechnicianId?: string;
  dueDate?: string;
  estimatedHours?: number;
  actualHours?: number;
  order: number;
  isBlocked: boolean;
  blockedReason?: string;
  createdBy: string;
  updatedBy?: string;
  createdAt: string;
  updatedAt: string;
  assignedAt?: string;
  completedAt?: string;
  isActive: boolean;
  isDeleted: boolean;
}

export interface SubTaskDetail extends SubTask {
  statusName: string;
  priorityName: string;
  assignedSectionName?: string;
  assignedTechnicianName?: string;
  creatorName: string;
  notesCount: number;
  attachmentsCount: number;
}

export interface SubTaskCreate {
  requestId: string;
  title: string;
  description?: string;
  priorityId?: number;
  assignedToSectionId?: number;
  assignedToTechnicianId?: string;
  dueDate?: string;
  estimatedHours?: number;
  order?: number;
}

export interface SubTaskUpdate {
  title?: string;
  description?: string;
  statusId?: number;
  priorityId?: number;
  assignedToSectionId?: number;
  assignedToTechnicianId?: string;
  dueDate?: string;
  estimatedHours?: number;
  actualHours?: number;
  order?: number;
  isBlocked?: boolean;
  blockedReason?: string;
}

export interface SubTaskNote {
  id: number;
  subTaskId: string;
  note: string;
  isInternal: boolean;
  createdBy: string;
  creatorName: string;
  createdAt: string;
}

export interface SubTaskNoteCreate {
  note: string;
  isInternal?: boolean;
}

export interface SubTaskAttachment {
  id: number;
  subTaskId: string;
  filename: string;
  fileSize: number;
  mimeType: string;
  uploadStatus: string;
  uploadedBy: string;
  uploaderName: string;
  createdAt: string;
}

export interface SubTaskStats {
  total: number;
  open: number;
  inProgress: number;
  completed: number;
  blocked: number;
  overdue: number;
}
