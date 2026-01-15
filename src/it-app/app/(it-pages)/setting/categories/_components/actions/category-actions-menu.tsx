"use client";

import { Button } from "@/components/ui/button";
import { Edit } from "lucide-react";
import { useState } from "react";
import { EditCategorySheet } from "../modal/edit-category-sheet";
import type { CategoryResponse } from "@/types/categories";

interface CategoryActionsProps {
  category: CategoryResponse;
}

export function CategoryActions({ category }: CategoryActionsProps) {
  const [editCategoryOpen, setEditCategoryOpen] = useState(false);

  return (
    <>
      <div className="flex items-center gap-1">
        {/* Edit Category Button */}
        <Button
          variant="ghost"
          size="sm"
          className="h-9 w-9 p-0"
          onClick={(e) => {
            e.stopPropagation();
            setEditCategoryOpen(true);
          }}
        >
          <span className="sr-only">Edit Category</span>
          <Edit className="h-4 w-4 text-muted-foreground" />
        </Button>
      </div>

      {/* Edit Category Sheet */}
      {editCategoryOpen && (
        <EditCategorySheet
          category={category}
          onOpenChange={(open) => {
            setEditCategoryOpen(open);
            if (!open) {
              setTimeout(() => {
                (document.activeElement as HTMLElement | null)?.blur();
              }, 100);
            }
          }}
        />
      )}
    </>
  );
}
