import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t border-white/[0.06] bg-[#040406] py-14">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 sm:flex-row sm:justify-between sm:px-6">
        <div>
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/GrowthOS-Logo.png"
              alt=""
              className="h-6 w-6 rounded object-cover"
            />
            <p className="text-sm font-medium text-white">Growth OS</p>
          </div>
          <p className="mt-2 max-w-xs text-[13px] text-[#777a88]">
            AI growth operating system for creators and brand teams.
          </p>
        </div>
        <div className="flex flex-wrap gap-x-8 gap-y-2 text-[13px] text-[#9194a1]">
          <Link href="/privacy" className="transition hover:text-white">
            Privacy
          </Link>
          <Link href="/terms" className="transition hover:text-white">
            Terms
          </Link>
          <Link href="/contact" className="transition hover:text-white">
            Contact
          </Link>
          <Link href="/status" className="transition hover:text-white">
            Status
          </Link>
          <Link href="/login" className="transition hover:text-white">
            Sign in
          </Link>
        </div>
      </div>
      <p className="mx-auto mt-10 max-w-6xl px-4 text-[11px] text-[#5e616e] sm:px-6">
        © {new Date().getFullYear()} Growth OS. All rights reserved.
      </p>
    </footer>
  );
}
