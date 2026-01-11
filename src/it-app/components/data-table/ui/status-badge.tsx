import React from 'react';

interface StatusBadgeProps {
  status: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  const colors = {
    Online: 'bg-green-100 text-green-800',
    Offline: 'bg-red-100 text-red-800',
    Warning: 'bg-yellow-100 text-yellow-800',
  };

  return (
    <span
      className={`px-2 py-1 rounded-full text-xs font-medium ${
        colors[status as keyof typeof colors]
      }`}
    >
      {status}
    </span>
  );
};