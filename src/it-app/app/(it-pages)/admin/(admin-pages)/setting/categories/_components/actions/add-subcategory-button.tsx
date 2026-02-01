"use client";

import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { useState } from "react";
import { AddSubcategorySheet } from "../modal";

import type { SubcategoryResponse } from "@/types/categories";

interface AddSubcategoryButtonProps {
  categoryId: number;
  onAdd?: (categoryId: number, newSubcategory: SubcategoryResponse) => void;
}

export function AddSubcategoryButton({ categoryId, onAdd }: AddSubcategoryButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="default"
        size="sm"
        onClick={() => setOpen(true)}
        className="h-8"
      >
        <Plus className="h-4 w-4 mr-1" />
        Add Subcategory
      </Button>

      {open && (
        <AddSubcategorySheet
          categoryId={categoryId}
          onOpenChange={setOpen}
          onAdd={onAdd}
        />
      )}
    </>
  );
}
