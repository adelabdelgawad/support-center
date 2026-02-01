"use client";

import { useState } from "react";
import { FolderOpen } from "lucide-react";
import { StatusSwitch } from "@/components/ui/status-switch";
import { AddSubcategoryButton } from "../actions/add-subcategory-button";
import { SubcategoryActions } from "../actions/subcategory-actions-menu";
import { useCategoriesActions } from "../../context/categories-actions-context";
import type { CategoryResponse, SubcategoryResponse } from "@/types/categories";

interface SubcategoryRowProps {
  categoryId: number;
  categoryName: string;
  subcategories: SubcategoryResponse[];
  categories: CategoryResponse[];
  onRefresh: () => void;
}

export function SubcategoryRow({
  categoryId,
  categoryName,
  subcategories,
  categories,
  onRefresh,
}: SubcategoryRowProps) {
  const [updatingIds, setUpdatingIds] = useState<Set<number>>(new Set());

  // Use context's handlers for optimistic updates
  const { handleToggleSubcategoryStatus, handleAddSubcategory } = useCategoriesActions();

  return (
    <tr>
      <td colSpan={7} className="p-0 bg-muted/30">
        <div className="pl-12 pr-4 py-4">
          {/* Header with Add Button */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <FolderOpen className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium text-muted-foreground">
                Subcategories for &ldquo;{categoryName}&rdquo;
              </span>
            </div>
            <AddSubcategoryButton categoryId={categoryId} onAdd={handleAddSubcategory} />
          </div>

          {/* Subcategories Table or Empty State */}
          {subcategories.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground bg-background rounded-lg border border-dashed">
              No subcategories found. Click &ldquo;Add Subcategory&rdquo; to create one.
            </div>
          ) : (
            <div className="bg-background rounded-lg border overflow-hidden">
              <table className="w-full">
                <thead className="bg-muted/50 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Name (EN)
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Name (AR)
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Description
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground uppercase tracking-wider w-24">
                      Active
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground uppercase tracking-wider w-24">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {subcategories.map((subcategory) => {
                    const isUpdating = updatingIds.has(subcategory.id);
                    const isDisabled = !subcategory.isActive;

                    return (
                      <tr
                        key={subcategory.id}
                        className={`transition-colors ${
                          isDisabled
                            ? "opacity-50 bg-muted/20"
                            : "hover:bg-muted/30"
                        } ${isUpdating ? "opacity-60" : ""}`}
                      >
                        <td className={`px-4 py-3 text-sm ${isDisabled ? "text-muted-foreground line-through" : ""}`}>
                          {subcategory.nameEn}
                        </td>
                        <td className={`px-4 py-3 text-sm ${isDisabled ? "text-muted-foreground line-through" : ""}`} dir="rtl">
                          {subcategory.nameAr}
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">
                          {subcategory.description || "—"}
                        </td>
                        <td className="px-4 py-3">
                          <div
                            className="flex justify-center"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <StatusSwitch
                              checked={subcategory.isActive}
                              onToggle={async () => {
                                setUpdatingIds((prev) => new Set(prev).add(subcategory.id));
                                try {
                                  await handleToggleSubcategoryStatus(
                                    subcategory.id,
                                    categoryId,
                                    !subcategory.isActive
                                  );
                                } finally {
                                  setUpdatingIds((prev) => {
                                    const updated = new Set(prev);
                                    updated.delete(subcategory.id);
                                    return updated;
                                  });
                                }
                              }}
                              title={
                                subcategory.isActive
                                  ? "Deactivate Subcategory"
                                  : "Activate Subcategory"
                              }
                              description={
                                subcategory.isActive
                                  ? `Are you sure you want to deactivate "${subcategory.nameEn}"?`
                                  : `Are you sure you want to activate "${subcategory.nameEn}"?`
                              }
                              size="sm"
                              disabled={isUpdating}
                            />
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div
                            className="flex justify-center"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <SubcategoryActions
                              subcategory={subcategory}
                              categories={categories}
                              onUpdate={onRefresh}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </td>
    </tr>
  );
}
