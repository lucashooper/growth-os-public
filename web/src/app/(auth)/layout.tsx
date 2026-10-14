export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-bg px-4 py-12">
      <div
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% -20%, oklch(0.35 0.04 160 / 0.45), transparent), radial-gradient(ellipse 60% 40% at 100% 100%, oklch(0.28 0.03 220 / 0.35), transparent)",
        }}
      />
      <div className="relative z-10 w-full max-w-md">{children}</div>
    </div>
  );
}
