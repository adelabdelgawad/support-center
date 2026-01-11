/**
 * Type definitions for tags and categories
 */

export interface Tag {
  id: number;
  nameEn: string;
  nameAr: string;
  category?: Category | null;
}

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
