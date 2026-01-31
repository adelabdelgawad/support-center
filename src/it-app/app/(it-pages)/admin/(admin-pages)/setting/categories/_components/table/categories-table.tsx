"use client";

import { useSearchParams } from "next/navigation";
import { useState, useCallback, useEffect, useRef } from "react";
import { CategoriesTableBody } from "./categories-table-body";
import { CategoriesActionsProvider } from "../../context/categories-actions-context";
import { toggleCategoryStatus } from "@/lib/api/categories";
import { getSubcategories, toggleSubcategoryStatus } from "@/lib/api/subcategories";
import { toastSuccess, toastError } from "@/lib/toast";
import type { SettingCategoriesResponse, CategoryResponse, SubcategoryResponse } from "@/types/categories";

interface CategoriesTableProps {
  initialData: SettingCategoriesResponse & { subcategoriesMap?: Record<number, SubcategoryResponse[]> };
}

/**
 * Fetcher function - uses Next.js API routes
 */
const fetcher = async (url: string): Promise<CategoryResponse[]> => {
  const response = await fetch(url, {
    method: "GET",
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error("Failed to fetch categories");
  }
  return response.json();
};

function CategoriesTable({ initialData }: CategoriesTableProps) {
  const searchParams = useSearchParams();

  // Read URL parameters
  const isActive = searchParams?.get("is_active") || "";
  const nameFilter = searchParams?.get("name") || "";

  // Simple state management (useState instead of SWR)
  const [data, setData] = useState<SettingCategoriesResponse | null>(initialData);
  const [isLoading, setIsLoading] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [updatingIds, setUpdatingIds] = useState<Set<number>>(new Set());

  // Subcategory management state - initialize with preloaded data
  const [subcategoriesMap, setSubcategoriesMap] = useState<Map<number, SubcategoryResponse[]>>(() => {
    const initialMap = new Map<number, SubcategoryResponse[]>();
    if (initialData.subcategoriesMap) {
      Object.entries(initialData.subcategoriesMap).forEach(([categoryId, subcategories]) => {
        initialMap.set(Number(categoryId), subcategories);
      });
    }
    return initialMap;
  });
  const [loadingSubcategories, setLoadingSubcategories] = useState<Set<number>>(new Set());

  // Track previous URL for change detection
  const prevUrlRef = useRef("");

  // Build API URL
  const apiUrl = `/api/setting/categories?active_only=false`;

  const categories = data?.categories ?? [];
  const activeCount = data?.activeCount ?? 0;
  const inactiveCount = data?.inactiveCount ?? 0;

  // Filter categories based on URL params
  const filteredCategories = categories.filter((category) => {
    // Filter by is_active
    if (isActive === "true" && !category.isActive) return false;
    if (isActive === "false" && category.isActive) return false;

    // Filter by name
    if (nameFilter) {
      const searchTerm = nameFilter.toLowerCase();
      const matchesName =
        category.name.toLowerCase().includes(searchTerm) ||
        category.nameEn.toLowerCase().includes(searchTerm) ||
        category.nameAr.toLowerCase().includes(searchTerm);
      if (!matchesName) return false;
    }

    return true;
  });

  /**
   * Manual refresh function
   */
  const refresh = useCallback(async () => {
    setIsValidating(true);
    setError(null);
    try {
      const response = await fetcher(apiUrl);

      // Calculate counts
      const activeCount = response.filter((c) => c.isActive).length;
      const inactiveCount = response.filter((c) => !c.isActive).length;

      setData({
        categories: response,
        total: response.length,
        activeCount,
        inactiveCount,
      });
    } catch (err) {
      setError(err as Error);
    } finally {
      setIsValidating(false);
    }
  }, [apiUrl]);

  // Detect URL changes and refetch
  useEffect(() => {
    const currentUrl = `${isActive}|${nameFilter}`;
    if (prevUrlRef.current !== "" && prevUrlRef.current !== currentUrl) {
      // URL changed, no need to refetch - we filter client-side
    }
    prevUrlRef.current = currentUrl;
  }, [isActive, nameFilter]);

  /**
   * Update categories with backend-returned data
   */
  const updateCategories = useCallback(
    async (updatedCategories: CategoryResponse[]) => {
      const currentData = data;
      if (!currentData) return;

      const updatedMap = new Map(updatedCategories.map((c) => [c.id, c]));

      const updatedCategoriesList = currentData.categories.map((category) =>
        updatedMap.has(category.id) ? updatedMap.get(category.id)! : category
      );

      // Recalculate counts
      const activeCount = updatedCategoriesList.filter((c) => c.isActive).length;
      const inactiveCount = updatedCategoriesList.filter((c) => !c.isActive).length;

      const newData: SettingCategoriesResponse = {
        ...currentData,
        categories: updatedCategoriesList,
        activeCount,
        inactiveCount,
      };

      setData(newData);
    },
    [data]
  );

  /**
   * Add new category to cache
   */
  const addCategory = useCallback(
    async (newCategory: CategoryResponse) => {
      const currentData = data;
      if (!currentData) return;

      const updatedCategories = [newCategory, ...currentData.categories];
      const activeCount = updatedCategories.filter((c) => c.isActive).length;
      const inactiveCount = updatedCategories.filter((c) => !c.isActive).length;

      const newData: SettingCategoriesResponse = {
        ...currentData,
        categories: updatedCategories,
        total: currentData.total + 1,
        activeCount,
        inactiveCount,
      };

      setData(newData);
      await refresh();
    },
    [data, refresh]
  );

  /**
   * Mark categories as being updated
   */
  const markUpdating = useCallback((ids: number[]) => {
    setUpdatingIds(new Set(ids));
  }, []);

  /**
   * Clear updating state
   */
  const clearUpdating = useCallback(() => {
    setUpdatingIds(new Set());
  }, []);

  /**
   * Handle toggle category status
   */
  const handleToggleStatus = useCallback(
    async (categoryId: number, newStatus: boolean) => {
      try {
        markUpdating([categoryId]);
        const updated = await toggleCategoryStatus(categoryId, newStatus);
        await updateCategories([updated]);
        toastSuccess(
          `Category ${newStatus ? "enabled" : "disabled"} successfully`
        );
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        toastError(`Failed to toggle status: ${errorMessage}`);
        throw error;
      } finally {
        clearUpdating();
      }
    },
    [markUpdating, updateCategories, clearUpdating]
  );

  /**
   * Handle update category
   */
  const handleUpdateCategory = useCallback(
    async (categoryId: number, updatedCategory: CategoryResponse) => {
      await updateCategories([updatedCategory]);
    },
    [updateCategories]
  );

  /**
   * Update counts - refetch to get fresh data
   */
  const updateCounts = useCallback(async () => {
    await refresh();
  }, [refresh]);

  /**
   * Load subcategories for a specific category
   */
  const loadSubcategories = useCallback(async (categoryId: number) => {
    try {
      setLoadingSubcategories((prev) => new Set(prev).add(categoryId));
      const subcategories = await getSubcategories(categoryId, { activeOnly: false });
      setSubcategoriesMap((prev) => new Map(prev).set(categoryId, subcategories));
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      toastError(`Failed to load subcategories: ${errorMessage}`);
    } finally {
      setLoadingSubcategories((prev) => {
        const next = new Set(prev);
        next.delete(categoryId);
        return next;
      });
    }
  }, []);

  /**
   * Add a new subcategory to local state
   */
  const handleAddSubcategory = useCallback((categoryId: number, newSubcategory: SubcategoryResponse) => {
    setSubcategoriesMap((prev) => {
      const categorySubcategories = prev.get(categoryId) || [];
      return new Map(prev).set(categoryId, [newSubcategory, ...categorySubcategories]);
    });
  }, []);

  /**
   * Update an existing subcategory in local state
   * Uses backend response to replace the subcategory entirely
   */
  const handleUpdateSubcategory = useCallback((subcategoryId: number, updatedData: SubcategoryResponse) => {
    setSubcategoriesMap((prev) => {
      const newMap = new Map(prev);
      for (const [categoryId, subcategories] of newMap.entries()) {
        const index = subcategories.findIndex((sub) => sub.id === subcategoryId);
        if (index !== -1) {
          const updatedSubcategories = [...subcategories];
          // Replace entire subcategory with backend response
          updatedSubcategories[index] = updatedData;
          newMap.set(categoryId, updatedSubcategories);
          break;
        }
      }
      return newMap;
    });
  }, []);

  /**
   * Toggle subcategory status
   */
  const handleToggleSubcategoryStatus = useCallback(
    async (subcategoryId: number, categoryId: number, newStatus: boolean) => {
      try {
        const updated = await toggleSubcategoryStatus(subcategoryId, newStatus);
        handleUpdateSubcategory(subcategoryId, updated);
        toastSuccess(
          `Subcategory ${newStatus ? "enabled" : "disabled"} successfully`
        );
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        toastError(`Failed to toggle subcategory status: ${errorMessage}`);
        throw error;
      }
    },
    [handleUpdateSubcategory]
  );

  /**
   * Refresh subcategories for a category
   */
  const refreshSubcategories = useCallback(async (categoryId: number) => {
    await loadSubcategories(categoryId);
  }, [loadSubcategories]);

  // Create actions object for context provider
  const actions = {
    handleToggleStatus,
    handleUpdateCategory,
    mutate: refresh,
    updateCounts,
    markUpdating,
    clearUpdating,
    updateCategories,
    addCategory,
    // Subcategory management
    subcategoriesMap,
    loadingSubcategories,
    loadSubcategories,
    handleAddSubcategory,
    handleUpdateSubcategory,
    handleToggleSubcategoryStatus,
    refreshSubcategories,
  };

  // Error state with retry button
  if (error) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="text-destructive mb-2">Failed to load categories</div>
          <div className="text-muted-foreground text-sm mb-4">
            {error.message}
          </div>
          <button
            onClick={refresh}
            className="text-primary hover:underline"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <CategoriesActionsProvider actions={actions}>
      <div className="relative h-full bg-muted min-h-0 p-1">

        {/* Main Content */}
        <div className="h-full flex-1 flex flex-col min-h-0 min-w-0 space-y-2">
          {/* Table */}
          <div className="flex-1 min-h-0 flex flex-col">
            <CategoriesTableBody
              categories={filteredCategories}
              refetch={refresh}
              updateCategories={updateCategories}
              addCategory={addCategory}
              isValidating={isValidating}
              activeCount={activeCount}
              inactiveCount={inactiveCount}
            />
          </div>
        </div>
      </div>
    </CategoriesActionsProvider>
  );
}

export default CategoriesTable;
