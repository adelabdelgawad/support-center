"use client";

import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { useState } from "react";
import { AddCategorySheet } from "../modal";
import { useCategoriesActions } from "../../context/categories-actions-context";

export function AddCategoryButton() {
  const [open, setOpen] = useState(false);
  const { addCategory } = useCategoriesActions();

  return (
    <>
      <Button onClick={() => setOpen(true)} size="sm" className="gap-2">
        <Plus className="h-4 w-4" />
        Add Category
      </Button>
      <AddCategorySheet open={open} onOpenChange={setOpen} onAdd={addCategory} />
    </>
  );
}
