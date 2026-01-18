"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Building2 } from "lucide-react";
import type { BusinessUnitResponse } from "@/types/business-units";
import type { BusinessUnitRegionResponse } from "@/types/business-unit-regions";
import { AddBusinessUnitSheet } from "../modal";

interface AddBusinessUnitButtonProps {
  onAdd: () => void;
  addBusinessUnit?: (newUnit: BusinessUnitResponse) => Promise<void>;
  regions: BusinessUnitRegionResponse[];
}

export function AddBusinessUnitButton({ onAdd, addBusinessUnit, regions }: AddBusinessUnitButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button variant="default" size="sm" onClick={() => setIsOpen(true)}>
        <Building2 className="h-4 w-4 mr-1" />
        Add Business Unit
      </Button>

      {isOpen && (
        <AddBusinessUnitSheet
          onOpenChange={setIsOpen}
          regions={regions}
        />
      )}
    </>
  );
}
