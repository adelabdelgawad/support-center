"use client";

import { createContext, useContext, ReactNode } from "react";
import type { CategoryResponse, SubcategoryResponse } from "@/types/categories";

interface CategoriesActions {
  handleToggleStatus: (categoryId: number, newStatus: boolean) => Promise<void>;
  handleUpdateCategory: (categoryId: number, updatedCategory: CategoryResponse) => Promise<void>;
  mutate: () => void;
  updateCounts: () => Promise<void>;
  markUpdating: (ids: number[]) => void;
  clearUpdating: () => void;
  updateCategories: (updatedCategories: CategoryResponse[]) => Promise<void>;
  addCategory: (newCategory: CategoryResponse) => Promise<void>;

  // Subcategory management
  subcategoriesMap: Map<number, SubcategoryResponse[]>;
  loadingSubcategories: Set<number>;
  loadSubcategories: (categoryId: number) => Promise<void>;
  handleAddSubcategory: (categoryId: number, newSubcategory: SubcategoryResponse) => void;
  handleUpdateSubcategory: (subcategoryId: number, updatedData: SubcategoryResponse) => void;
  handleToggleSubcategoryStatus: (subcategoryId: number, categoryId: number, newStatus: boolean) => Promise<void>;
  refreshSubcategories: (categoryId: number) => Promise<void>;
}

const CategoriesActionsContext = createContext<CategoriesActions | null>(null);

interface CategoriesActionsProviderProps {
  children: ReactNode;
  actions: CategoriesActions;
}

export function CategoriesActionsProvider({
  children,
  actions,
}: CategoriesActionsProviderProps) {
  return (
    <CategoriesActionsContext.Provider value={actions}>
      {children}
    </CategoriesActionsContext.Provider>
  );
}

export function useCategoriesActions() {
  const context = useContext(CategoriesActionsContext);
  if (!context) {
    throw new Error(
      "useCategoriesActions must be used within a CategoriesActionsProvider"
    );
  }
  return context;
}
