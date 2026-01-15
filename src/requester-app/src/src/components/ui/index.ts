/**
 * UI Components Index
 * Re-exports all UI components for convenient imports
 */

export { Button, buttonVariants, type ButtonProps } from "./button";
export { Badge, badgeVariants, type BadgeProps } from "./badge";
export { Input, type InputProps } from "./input";
export { Textarea, type TextareaProps } from "./textarea";
export { Label, type LabelProps } from "./label";
export { Spinner, type SpinnerProps } from "./spinner";
export { ScrollArea, type ScrollAreaProps } from "./scroll-area";
export { Select, Option, type SelectProps, type OptionProps } from "./select";
export {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  type CardProps,
} from "./card";

// solid-ui components (Kobalte-based)
export {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "./dialog";

export {
  AlertDialog,
  AlertDialogPortal,
  AlertDialogOverlay,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
} from "./alert-dialog";

export {
  Switch,
  SwitchControl,
  SwitchThumb,
  SwitchLabel,
  SwitchDescription,
  SwitchErrorMessage,
} from "./switch";

export {
  Slider,
  SliderTrack,
  SliderFill,
  SliderThumb,
  SliderLabel,
  SliderValueLabel,
} from "./slider";
