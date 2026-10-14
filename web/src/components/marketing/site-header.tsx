"use client";

import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-[#040406]/80 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link
          href="/"
          className="font-display flex items-center gap-2.5 overflow-visible text-[15px] font-semibold tracking-[-0.02em] text-white"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/GrowthOS-Logo.png"
            alt=""
            className="h-7 w-7 shrink-0 rounded-md object-cover"
          />
          <span className="leading-[1.2]">Growth OS</span>
        </Link>
        <nav className="hidden items-center gap-7 text-[13px] text-[#9194a1] md:flex">
          <a href="#features" className="transition hover:text-white">
            Features
          </a>
          <a href="#workflow" className="transition hover:text-white">
            Workflow
          </a>
          <a href="#pricing" className="transition hover:text-white">
            Pricing
          </a>
          <Link href="/status" className="transition hover:text-white">
            Status
          </Link>
        </nav>
        <div className="flex items-center gap-2">
          <Link
            href="/login"
            className="inline-flex h-8 items-center rounded-full px-3 text-xs font-medium text-[#9194a1] transition hover:text-white"
          >
            Sign in
          </Link>
          <Link
            href="/signup"
            className="inline-flex h-8 items-center rounded-full bg-white px-3.5 text-xs font-medium text-[#08080a] transition hover:bg-[#e2e3e9]"
          >
            Start Free
          </Link>
        </div>
      </div>
    </header>
  );
}
