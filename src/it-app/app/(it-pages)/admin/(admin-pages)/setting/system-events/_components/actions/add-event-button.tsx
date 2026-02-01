"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import type { SystemEventResponse } from "@/types/system-events";
import { AddSystemEventSheet } from "../modal";

interface AddEventButtonProps {
  onAdd: () => void;
  addEvent?: (newEvent: SystemEventResponse) => void;
}

export function AddEventButton({ onAdd, addEvent }: AddEventButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      onAdd();
    }
    setIsOpen(open);
  };

  return (
    <>
      <Button variant="default" size="sm" onClick={() => setIsOpen(true)}>
        <Plus className="h-4 w-4 mr-1" />
        Add Event
      </Button>

      {isOpen && (
        <AddSystemEventSheet
          onOpenChange={handleOpenChange}
        />
      )}
    </>
  );
}
