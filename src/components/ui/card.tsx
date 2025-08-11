import * as React from "react";

type Props = React.HTMLAttributes<HTMLDivElement>;

export function Card({ className = "", ...props }: React.HTMLAttributes<HTMLDivElement>) {
    return (
      <div
        className={`rounded-2xl border border-neutral-200 bg-white shadow-[0_2px_0_rgba(0,0,0,0.05)] ${className}`}
        {...props}
      />
    );
  }
  