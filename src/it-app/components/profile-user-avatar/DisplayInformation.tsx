import React, { useState } from "react";
import { Check, ChevronLeft } from "lucide-react";

const displayModes = ["Light mode", "Dark mode", "Match system appearance"];

interface DisplayInformationProps {
  onBack: () => void;
}

export default function DisplayInformation({ onBack }: DisplayInformationProps) {
  const [selectedMode, setSelectedMode] = useState(displayModes[0]);

  return (
    <>
      <button onClick={onBack} className="w-full px-4 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer">
        <ChevronLeft className="inline w-4 h-4 mr-2" />
        Display
      </button>
      <div className="py-2">
        {displayModes.map((mode) => (
          <button
            key={mode}
            className="w-full px-4 py-2 text-sm flex items-center gap-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700"
            onClick={() => setSelectedMode(mode)}
          >
            {selectedMode === mode && <Check className="w-4 h-4 text-blue-500" />}
            <span>{mode}</span>
          </button>
        ))}
      </div>
    </>
  );
}
