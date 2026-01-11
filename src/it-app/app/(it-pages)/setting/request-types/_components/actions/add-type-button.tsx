"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import AddRequestTypeSheet from "../modal/add-request-type-sheet";
import type { RequestType } from "@/types/request-types";

interface AddTypeButtonProps {
  onAdd: () => void;
  addType?: (newType: RequestType) => Promise<void>;
}

export function AddTypeButton({ onAdd, addType }: AddTypeButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) {
      onAdd();
    }
  };

  return (
    <>
      <Button variant="default" size="sm" onClick={() => setIsOpen(true)}>
        <Plus className="h-4 w-4 mr-1" />
        Add Type
      </Button>

      {isOpen && (
        <AddRequestTypeSheet
          open={isOpen}
          onOpenChange={handleOpenChange}
        />
      )}
    </>
  );
}
