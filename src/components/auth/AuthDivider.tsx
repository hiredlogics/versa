export function AuthDivider({ label }: { label: string }) {
  return (
    <div className="relative my-6">
      <div className="absolute inset-0 flex items-center" aria-hidden>
        <div className="w-full border-t border-lp-border" />
      </div>
      <div className="relative flex justify-center text-[11px] uppercase tracking-[0.14em]">
        <span className="auth-divider-label relative px-3 text-lp-muted-dark">{label}</span>
      </div>
    </div>
  );
}
