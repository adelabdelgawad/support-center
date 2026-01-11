"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { UserPlus } from "lucide-react";
import AddRegionSheet from "../modal/add-region-sheet";

interface AddRegionButtonProps {
  onAdd: () => void;
}

export function AddRegionButton({ onAdd }: AddRegionButtonProps) {
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
        <UserPlus className="h-4 w-4 mr-1" />
        Add Region
      </Button>

      {isOpen && (
        <AddRegionSheet
          onOpenChange={handleOpenChange}
        />
      )}
    </>
  );
}
