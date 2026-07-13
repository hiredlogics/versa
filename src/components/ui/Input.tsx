import { cn } from "@/lib/utils/cn";
import { InputHTMLAttributes, forwardRef } from "react";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "w-full rounded-xl border border-glass-border bg-charcoal-light px-4 py-2.5 text-sm text-off-white placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-electric/50",
        className
      )}
      {...props}
    />
  )
);
Input.displayName = "Input";

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "w-full rounded-xl border border-glass-border bg-charcoal-light px-4 py-3 text-sm text-off-white placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-electric/50 resize-none",
      className
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";
