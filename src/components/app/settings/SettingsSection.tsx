export function SettingsSection({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-[#111111] md:text-2xl">{title}</h2>
        {subtitle && (
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#6F6F6F] md:text-[15px]">
            {subtitle}
          </p>
        )}
      </div>
      {children}
    </div>
  );
}
