export function Card({ className = "", ...props }: React.HTMLAttributes<HTMLDivElement>) {
    return (
      <div
        className={`rounded-2xl border border-white/10 bg-[#111111] shadow-[0_1px_0_rgba(255,255,255,0.04)] ${className}`}
        {...props}
      />
    );
  }
  