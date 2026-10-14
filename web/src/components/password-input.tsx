"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

export function PasswordInput({
  value,
  onChange,
  autoComplete = "current-password",
  required,
  minLength,
  disabled,
  className,
  id,
}: {
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  required?: boolean;
  minLength?: number;
  disabled?: boolean;
  className?: string;
  id?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative mt-1">
      <input
        id={id}
        type={show ? "text" : "password"}
        required={required}
        minLength={minLength}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        disabled={disabled}
        className={cn(
          "h-11 w-full rounded-xl border border-border bg-bg px-3 pr-11 text-sm",
          className,
        )}
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setShow((v) => !v)}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-ink"
        aria-label={show ? "Hide password" : "Show password"}
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}
