"use client";

import { Button } from "@/components/ui/button";
import { Edit } from "lucide-react";
import { useState } from "react";
import { EditSubcategorySheet } from "../modal/edit-subcategory-sheet";
import type { CategoryResponse, SubcategoryResponse } from "@/types/categories";

interface SubcategoryActionsProps {
  subcategory: SubcategoryResponse;
  categories: CategoryResponse[];
  onUpdate?: () => void;
}

export function SubcategoryActions({ subcategory, categories, onUpdate }: SubcategoryActionsProps) {
  const [editSubcategoryOpen, setEditSubcategoryOpen] = useState(false);

  return (
    <>
      <div className="flex items-center gap-1">
        {/* Edit Subcategory Button */}
        <Button
          variant="ghost"
          size="sm"
          className="h-9 w-9 p-0"
          onClick={(e) => {
            e.stopPropagation();
            setEditSubcategoryOpen(true);
          }}
        >
          <span className="sr-only">Edit Subcategory</span>
          <Edit className="h-4 w-4 text-muted-foreground" />
        </Button>
      </div>

      {/* Edit Subcategory Sheet */}
      {editSubcategoryOpen && (
        <EditSubcategorySheet
          subcategory={subcategory}
          categories={categories}
          onOpenChange={(open) => {
            setEditSubcategoryOpen(open);
            if (!open) {
              setTimeout(() => {
                (document.activeElement as HTMLElement | null)?.blur();
              }, 100);
            }
          }}
          onUpdate={onUpdate}
        />
      )}
    </>
  );
}
