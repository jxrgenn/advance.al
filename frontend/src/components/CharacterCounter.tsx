/**
 * Character Counter Component
 *
 * Displays character count with visual feedback for form fields with length limits.
 * Shows count, remaining characters, and changes color based on usage.
 */

import { cn } from "@/lib/utils";
import { getCharacterCountInfo } from "@/lib/formValidation";

interface CharacterCounterProps {
  value: string;
  maxLength: number;
  minLength?: number;
  className?: string;
  showMinLength?: boolean;
  hideMinLengthWarning?: boolean; // Hide the red "duhen edhe X karaktere" message
}

export const CharacterCounter = ({
  value,
  maxLength,
  minLength,
  className,
  showMinLength = false,
  hideMinLengthWarning = false
}: CharacterCounterProps) => {
  const { count, remaining, isOverLimit, percentage } = getCharacterCountInfo(value || '', maxLength);

  // Color logic based on usage percentage
  const getColor = () => {
    if (isOverLimit) return 'text-red-600 dark:text-red-400';
    if (percentage >= 90) return 'text-orange-600 dark:text-orange-400';
    if (percentage >= 75) return 'text-yellow-600 dark:text-yellow-400';
    // Don't show red for minLength if hideMinLengthWarning is true
    if (!hideMinLengthWarning && minLength && count < minLength) return 'text-red-600 dark:text-red-400';
    return 'text-muted-foreground';
  };

  const getMessage = () => {
    if (isOverLimit) {
      return `${Math.abs(remaining)} karaktere mbi limitin`;
    }

    // Don't show minLength warning message if hideMinLengthWarning is true
    if (!hideMinLengthWarning && minLength && count < minLength) {
      const needed = minLength - count;
      return `${count}/${maxLength} (duhen edhe ${needed} karaktere)`;
    }

    if (showMinLength && minLength) {
      return `${count}/${maxLength} (min: ${minLength})`;
    }

    return `${count}/${maxLength}`;
  };

  return (
    <div className={cn("text-xs font-medium transition-colors", getColor(), className)}>
      {getMessage()}
    </div>
  );
};

interface TextAreaWithCounterProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  maxLength: number;
  minLength?: number;
  label?: string;
  error?: string;
  showMinLength?: boolean;
}

export const TextAreaWithCounter = ({
  value,
  maxLength,
  minLength,
  label,
  error,
  showMinLength,
  className,
  ...props
}: TextAreaWithCounterProps) => {
  return (
    <div className="space-y-2">
      {label && (
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-foreground">{label}</label>
          <CharacterCounter
            value={value as string}
            maxLength={maxLength}
            minLength={minLength}
            showMinLength={showMinLength}
          />
        </div>
      )}
      {/* Error message below label */}
      {error && <p className="text-xs text-red-600 dark:text-red-400 -mt-1">{error}</p>}
      <textarea
        value={value}
        maxLength={maxLength}
        className={cn(
          "w-full min-h-[100px] px-3 py-2 text-sm rounded-md border border-input bg-background",
          "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
          "disabled:cursor-not-allowed disabled:opacity-50",
          error && "border-red-500 focus:ring-red-500",
          className
        )}
        {...props}
      />
    </div>
  );
};

interface InputWithCounterProps extends React.InputHTMLAttributes<HTMLInputElement> {
  maxLength: number;
  minLength?: number;
  label?: string;
  error?: string;
  hideMinLengthWarning?: boolean;
}

export const InputWithCounter = ({
  value,
  maxLength,
  minLength,
  label,
  error,
  hideMinLengthWarning,
  className,
  ...props
}: InputWithCounterProps) => {
  return (
    <div className="space-y-2">
      {label && (
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-foreground">{label}</label>
          <CharacterCounter
            value={value as string}
            maxLength={maxLength}
            minLength={minLength}
            hideMinLengthWarning={hideMinLengthWarning}
          />
        </div>
      )}
      <input
        type="text"
        value={value}
        maxLength={maxLength}
        className={cn(
          "w-full px-3 py-2 text-sm rounded-md border border-input bg-background",
          "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
          "disabled:cursor-not-allowed disabled:opacity-50",
          error && "border-red-500 focus:ring-red-500",
          className
        )}
        {...props}
      />
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
};

export default CharacterCounter;
