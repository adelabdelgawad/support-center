/**
 * New Request FAB (Floating Action Button)
 *
 * Fixed position button in the bottom-right corner for creating new requests.
 */

import { Plus } from "lucide-solid";

interface NewRequestFabProps {
  onClick: () => void;
  disabled?: boolean;
}

export function NewRequestFab(props: NewRequestFabProps) {
  return (
    <button
      onClick={props.onClick}
      disabled={props.disabled}
      class="fixed bottom-6 right-6 flex items-center justify-center w-14 h-14 rounded-full shadow-lg transition-all duration-200 hover:scale-110 active:scale-95 z-50"
      style={{
        "background-color": props.disabled ? "#6a6a67" : "#DAC471",
        color: "#0f1213",
        "box-shadow": "0 4px 20px rgba(218, 196, 113, 0.3)",
        cursor: props.disabled ? "not-allowed" : "pointer",
      }}
      title="Create new request"
    >
      <Plus class="h-6 w-6" stroke-width={2.5} />
    </button>
  );
}

export default NewRequestFab;
