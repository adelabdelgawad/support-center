/**
 * Type definitions for categories
 */

export interface Category {
  id: number;
  name: string;
  nameEn: string;
  nameAr: string;
}

export interface Subcategory {
  id: number;
  name: string;
  nameEn: string;
  nameAr: string;
  category?: Category | null;
}
