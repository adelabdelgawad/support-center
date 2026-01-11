// types.ts

// Base type for common fields
export type BaseEntity = {
    _id: number;
    created_at: string; // ISO 8601 date string
    updated_at: string; // ISO 8601 date string
    updated_by?: number;
  };
  
  export type Branch = BaseEntity & {
    branch_name: string;
    address?: string;
    contact_info?: string;
  };
  
  export type Unit = BaseEntity & {
    unit_name: string;
  };
  
  export type UnitProfile = BaseEntity & {
    unit_id: number;
    visit_validity_hours: number;
    voucher_expiry_hours: number;
  };
  
  export type BranchUnit = BaseEntity & {
    branch_id: number;
    unit_profile_id: number;
    network_subnet?: string;
    validation_duration_hours: number;
    sophos_url?: string;
  };
  
  export type Phone = BaseEntity & {
    phone_number: string;
    is_blocked: boolean;
  };
  
  export type Patient = BaseEntity & {
    phone_id: number;
    patient_name: string;
  };
  
  export type User = BaseEntity & {
    username: string;
    full_name?: string;
    title?: string;
    email?: string;
  };
  
  export type Reservation = BaseEntity & {
    patient_id: number;
    branch_unit_id: number;
    reservation_time: string; // ISO 8601 date string
    created_by: number;
  };
  
  export type VoucherStatus = BaseEntity & {
    status: string;
  };
  
  export type Voucher = BaseEntity & {
    reservation_id: number;
    code: string;
    voucher_status_id: number;
    expired_at?: string; // ISO 8601 date string
    renewed_at?: string; // ISO 8601 date string
    renewal_count: number;
  };
  
  export type LoginLog = {
    _id: number;
    phone_id: number;
    device_ip: string;
    event_time: string; // ISO 8601 date string
    is_successful: boolean;
    result?: string;
    updated_at: string;
    updated_by?: number;
  };
  
  export type Account = BaseEntity & {
    username: string;
    password?: string; // Usually omitted from frontend types
    is_domain: boolean;
    role_id?: number;
  };
  
  export type Role = BaseEntity & {
    name: string;
  };
  
  export type AuditLog = {
    _id: number;
    table_name: string;
    record_id: number;
    operation: string;
    changed_at: string; // ISO 8601 date string
    changed_by: number;
  };
  
  export type AuditLogDetail = {
    _id: number;
    audit_log_id: number;
    column_name: string;
    old_value?: string;
    new_value?: string;
  };
  
  // Example for nested/related _data
  export type BranchWithUnits = Branch & {
    branch_units: BranchUnit[];
  };
  
  export type VoucherWithDetails = Voucher & {
    reservation: Reservation;
    status: VoucherStatus;
  };
  
  // API response types
  export type ApiResponse<T> = {
    _data: T;
    success: boolean;
    message?: string;
  };
  
  export type PaginatedResponse<T> = {
    items: T[];
    total: number;
    page: number;
    size: number;
    pages: number;
  };
  