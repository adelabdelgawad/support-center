import React from "react";
import { CheckCircle2, Circle, CircleDot } from "lucide-react";

const statuses = [
  { name: "Online", color: "bg-green-500", icon: CircleDot },
  { name: "Away", color: "bg-orange-500", icon: CircleDot },
  { name: "Transfers only", color: "bg-blue-500", icon: CircleDot },
  { name: "Offline", color: "bg-gray-400", icon: Circle },
];

interface StatusInformationProps {
  selectedStatus: string;
  onChange: (status: string) => void;
}

export default function StatusInformation(props: StatusInformationProps) {
  const { selectedStatus, onChange } = props;

  return (
    <div className="py-2 border-b border-gray-200 dark:border-gray-700">
      {statuses.map(({ name, color, icon: Icon }) => (
        <button
          key={name}
          className={`w-full flex items-center gap-2 px-4 py-2 text-sm text-left hover:bg-gray-100 dark:hover:bg-gray-700 ${
            selectedStatus === name ? "font-semibold" : ""
          }`}
          onClick={() => onChange(name)}
        >
          <span className={`${color} w-3 h-3 rounded-full inline-block`} />
          <span>{name}</span>
          {selectedStatus === name && <CheckCircle2 className="w-4 h-4 text-blue-500 ml-2" />}
        </button>
      ))}
    </div>
  );
}
