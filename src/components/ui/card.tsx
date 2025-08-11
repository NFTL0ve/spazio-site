export function Card({ className = "", ...props }: React.HTMLAttributes<HTMLDivElement>) {
    return (
      <div
        className={`rounded-2xl border border-[var(--border)] bg-[var(--surface)]
                    shadow-[0_1px_0_rgba(255,255,255,0.05)]
                    transition hover:border-[var(--accent2)]/40 hover:shadow-[0_0_24px_rgba(57,230,255,0.15)]
                    ${className}`}
        {...props}
      />
    );
  }
  