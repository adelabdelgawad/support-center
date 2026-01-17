"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { AddStatusSheet } from "../modal";
import type { RequestStatusResponse } from "@/types/request-statuses";

interface AddStatusButtonProps {
  onAdd: () => void;
  addStatus?: (newStatus: RequestStatusResponse) => Promise<void>;
}

export function AddStatusButton({ onAdd, addStatus }: AddStatusButtonProps) {
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
        Add Status
      </Button>

      {isOpen && (
        <AddStatusSheet
          open={isOpen}
          onOpenChange={handleOpenChange}
        />
      )}
    </>
  );
}
