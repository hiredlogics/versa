import { cn } from "@/lib/utils/cn";

export function SettingsField({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block space-y-2", className)}>
      <span className="text-sm font-medium text-[#111111]">{label}</span>
      {children}
      {hint && !error && <span className="block text-xs text-[#9A9A9A]">{hint}</span>}
      {error && (
        <span className="block text-xs text-rose-600" role="alert">
          {error}
        </span>
      )}
    </label>
  );
}

export function SettingsInput({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn("settings-input", className)} {...props} />;
}

export function SettingsTextarea({
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn("settings-textarea", className)} {...props} />;
}
