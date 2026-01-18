"use client";

import { SettingsTableHeader } from "@/components/data-table";
import { toastSuccess, toastWarning, toastError } from "@/lib/toast";
import { FolderOpen, Loader2, ChevronRight, ChevronDown } from "lucide-react";
import React, { useState, useCallback } from "react";
import { AddCategoryButton } from "../actions/add-category-button";
import { CategoryActions } from "../actions/category-actions-menu";
import { StatusSwitch } from "@/components/ui/status-switch";
import { toggleCategoryStatus } from "@/lib/api/categories";
import { getSubcategories, toggleSubcategoryStatus } from "@/lib/api/subcategories";
import { useCategoriesActions } from "../../context/categories-actions-context";
import { SubcategoryRow } from "./subcategory-row";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { CategoryResponse, SubcategoryResponse } from "@/types/categories";

interface CategoriesTableBodyProps {
  categories: CategoryResponse[];
  refetch: () => void;
  updateCategories: (updatedCategories: CategoryResponse[]) => Promise<void>;
  addCategory: (newCategory: CategoryResponse) => Promise<void>;
  isValidating?: boolean;
  activeCount: number;
  inactiveCount: number;
}

export function CategoriesTableBody({
  categories,
  refetch,
  updateCategories,
  addCategory,
  isValidating,
  activeCount,
  inactiveCount,
}: CategoriesTableBodyProps) {
  // Get actions from context
  const categoriesActions = useCategoriesActions();
  const {
    subcategoriesMap,
    loadingSubcategories,
    loadSubcategories,
    handleAddSubcategory,
    handleUpdateSubcategory,
    handleToggleSubcategoryStatus,
    refreshSubcategories,
    markUpdating,
    clearUpdating,
  } = categoriesActions;

  const [tableInstance, setTableInstance] = useState<any>(null);
  const [selectedCategories, setSelectedCategories] = useState<CategoryResponse[]>([]);
  const [updatingIds, setUpdatingIds] = useState<Set<number>>(new Set());
  const [expandedCategoryIds, setExpandedCategoryIds] = useState<Set<number>>(new Set());
  const isUpdating = updatingIds.size > 0;
  const selectedIds = selectedCategories
    .map((category) => category.id)
    .filter(Boolean) as number[];

  /**
   * Handle clear selection after bulk operations
   */
  const handleClearSelection = () => {
    setSelectedCategories([]);
  };

  /**
   * Toggle row expansion and load subcategories if needed
   */
  const handleToggleExpand = useCallback(async (categoryId: number) => {
    const isExpanded = expandedCategoryIds.has(categoryId);

    if (isExpanded) {
      // Collapse the row
      setExpandedCategoryIds((prev) => {
        const next = new Set(prev);
        next.delete(categoryId);
        return next;
      });
    } else {
      // Expand the row
      setExpandedCategoryIds((prev) => new Set(prev).add(categoryId));

      // Load subcategories if not already loaded
      if (!subcategoriesMap.has(categoryId)) {
        await loadSubcategories(categoryId);
      }
    }
  }, [expandedCategoryIds, subcategoriesMap, loadSubcategories]);

  // Handle toggle category status
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

  // Handle disable categories
  const handleDisable = async (ids: number[] | string[]) => {
    try {
      if (ids.length === 0) return;

      const numericIds = ids.map((id) => Number(id));

      // Filter to only active categories
      const activeToDisable = categories.filter(
        (c) => c.id && numericIds.includes(c.id) && c.isActive
      );

      if (activeToDisable.length === 0) {
        toastWarning("Selected categories are already disabled");
        return;
      }

      const categoryIdsToDisable = activeToDisable.map((c) => c.id);
      markUpdating(categoryIdsToDisable);

      const updatedCategories: CategoryResponse[] = [];
      for (const categoryId of categoryIdsToDisable) {
        const updated = await toggleCategoryStatus(categoryId, false);
        updatedCategories.push(updated);
      }

      if (updatedCategories.length > 0) {
        updateCategories(updatedCategories);
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      toastSuccess(`Successfully disabled ${updatedCategories.length} category(ies)`);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      toastError(`Failed to disable categories: ${errorMessage}`);
    } finally {
      clearUpdating();
    }
  };

  // Handle enable categories
  const handleEnable = async (ids: number[] | string[]) => {
    try {
      if (ids.length === 0) return;

      const numericIds = ids.map((id) => Number(id));

      // Filter to only inactive categories
      const inactiveToEnable = categories.filter(
        (c) => c.id && numericIds.includes(c.id) && !c.isActive
      );

      if (inactiveToEnable.length === 0) {
        toastWarning("Selected categories are already enabled");
        return;
      }

      const categoryIdsToEnable = inactiveToEnable.map((c) => c.id);
      markUpdating(categoryIdsToEnable);

      const updatedCategories: CategoryResponse[] = [];
      for (const categoryId of categoryIdsToEnable) {
        const updated = await toggleCategoryStatus(categoryId, true);
        updatedCategories.push(updated);
      }

      if (updatedCategories.length > 0) {
        updateCategories(updatedCategories);
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      toastSuccess(`Successfully enabled ${updatedCategories.length} category(ies)`);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      toastError(`Failed to enable categories: ${errorMessage}`);
    } finally {
      clearUpdating();
    }
  };

  // Handle refresh
  const handleRefresh = () => {
    refetch();
  };

  // Handle update category
  const handleUpdateCategory = async (
    categoryId: number,
    updatedCategory: CategoryResponse
  ) => {
    await updateCategories([updatedCategory]);
  };

  // Update counts - refetch to get fresh data
  const updateCounts = async () => {
    refetch();
  };

  return (
    <div className="h-full w-full flex flex-col min-h-0 space-y-2">
        {/* Controller Bar */}
        <SettingsTableHeader<number>
          statusFilter={{
            activeCount,
            inactiveCount,
            totalCount: activeCount + inactiveCount,
          }}
          selection={{
            selectedIds,
            onClearSelection: handleClearSelection,
            itemName: "category",
          }}
          search={{
            placeholder: "Search categories...",
            urlParam: "name",
          }}
          addButton={<AddCategoryButton />}
          bulkActions={{
            onDisable: handleDisable,
            onEnable: handleEnable,
            isUpdating,
          }}
          onRefresh={handleRefresh}
          tableInstance={tableInstance}
        />

        {/* Table */}
        <div className="flex-1 min-h-0 flex flex-col overflow-auto bg-background rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8"></TableHead>
                <TableHead className="text-center w-10">Select</TableHead>
                <TableHead className="text-center">Name (EN)</TableHead>
                <TableHead className="text-center">Name (AR)</TableHead>
                <TableHead className="text-center">Description</TableHead>
                <TableHead className="text-center w-24">Active</TableHead>
                <TableHead className="text-center w-24">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isValidating && categories.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" />
                  </TableCell>
                </TableRow>
              ) : categories.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                    No categories available
                  </TableCell>
                </TableRow>
              ) : (
                categories.map((category) => {
                  const isExpanded = expandedCategoryIds.has(category.id);
                  const isRowUpdating = updatingIds.has(category.id);
                  const isSelected = selectedIds.includes(category.id);
                  const subcategories = subcategoriesMap.get(category.id) || [];

                  return (
                    <React.Fragment key={category.id}>
                      <TableRow
                        key={category.id}
                        data-state={isSelected ? "selected" : undefined}
                        className={`cursor-pointer ${isRowUpdating ? "opacity-60" : ""}`}
                        onClick={() => {
                          if (!isRowUpdating && !isUpdating) {
                            const newSelected = isSelected
                              ? selectedCategories.filter((c) => c.id !== category.id)
                              : [...selectedCategories, category];
                            setSelectedCategories(newSelected);
                          }
                        }}
                      >
                        {/* Expand/Collapse Column */}
                        <TableCell
                          className="text-center"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleExpand(category.id);
                          }}
                        >
                          {loadingSubcategories.has(category.id) ? (
                            <Loader2 className="w-4 h-4 text-muted-foreground animate-spin mx-auto" />
                          ) : isExpanded ? (
                            <ChevronDown className="w-4 h-4 text-muted-foreground mx-auto" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-muted-foreground mx-auto" />
                          )}
                        </TableCell>

                        {/* Select Column */}
                        <TableCell className="text-center">
                          <div className="flex justify-center">
                            {isRowUpdating ? (
                              <Loader2 className="w-4 h-4 text-primary animate-spin" />
                            ) : (
                              <input
                                type="checkbox"
                                className="rounded border-input cursor-pointer"
                                checked={isSelected}
                                onChange={(e) => {
                                  e.stopPropagation();
                                  const newSelected = e.target.checked
                                    ? [...selectedCategories, category]
                                    : selectedCategories.filter((c) => c.id !== category.id);
                                  setSelectedCategories(newSelected);
                                }}
                                disabled={isUpdating || isRowUpdating}
                              />
                            )}
                          </div>
                        </TableCell>

                        {/* Name (EN) Column */}
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-2">
                            <FolderOpen className="w-4 h-4 text-muted-foreground" />
                            <span className="font-medium">{category.nameEn}</span>
                          </div>
                        </TableCell>

                        {/* Name (AR) Column */}
                        <TableCell className="text-center" dir="rtl">
                          {category.nameAr}
                        </TableCell>

                        {/* Description Column */}
                        <TableCell className="text-center text-sm text-muted-foreground">
                          {category.description || "—"}
                        </TableCell>

                        {/* Active Column */}
                        <TableCell
                          className="text-center"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex justify-center">
                            <StatusSwitch
                              checked={category.isActive}
                              onToggle={async () => {
                                await handleToggleStatus(category.id, !category.isActive);
                              }}
                              title={
                                category.isActive
                                  ? "Deactivate Category"
                                  : "Activate Category"
                              }
                              description={
                                category.isActive
                                  ? `Are you sure you want to deactivate "${category.nameEn}"?`
                                  : `Are you sure you want to activate "${category.nameEn}"?`
                              }
                              size="sm"
                              disabled={isRowUpdating}
                            />
                          </div>
                        </TableCell>

                        {/* Actions Column */}
                        <TableCell
                          className="text-center"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex justify-center">
                            <CategoryActions category={category} />
                          </div>
                        </TableCell>
                      </TableRow>

                      {/* Expanded Subcategory Row */}
                      {isExpanded && (
                        <SubcategoryRow
                          key={`sub-${category.id}`}
                          categoryId={category.id}
                          categoryName={category.nameEn}
                          subcategories={subcategories}
                          categories={categories}
                          onRefresh={() => refreshSubcategories(category.id)}
                        />
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>
  );
}
