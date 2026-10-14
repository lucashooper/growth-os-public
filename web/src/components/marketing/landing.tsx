"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  BarChart3,
  Clapperboard,
  FlaskConical,
  ImageIcon,
  Library,
  Radar,
  Search,
  Share2,
  Users,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

const features = [
  {
    title: "AI Research",
    desc: "Ask grounded questions about your posts, competitors, and trends — with thumbnail cards, not walls of text.",
    icon: Search,
  },
  {
    title: "Carousel Generator",
    desc: "Suggest today’s opportunities, write narrative slides, and score predicted performance before you publish.",
    icon: Clapperboard,
  },
  {
    title: "Image Library",
    desc: "Named Image Packs with sequential, random, or AI ordering — exact assets on every slide.",
    icon: ImageIcon,
  },
  {
    title: "Content Library",
    desc: "Generated drafts, uploads, and published posts in one searchable archive per project.",
    icon: Library,
  },
  {
    title: "Analytics",
    desc: "Backend-computed engagement, posting hours, and hashtag lifts — the AI explains, never invents metrics.",
    icon: BarChart3,
  },
  {
    title: "Experiments",
    desc: "Compare cohort arms with sample-size heuristics so you know when a hook structure is winning.",
    icon: FlaskConical,
  },
  {
    title: "Competitor Tracking",
    desc: "Sync public competitor profiles and study top hooks with structured cards and expandable analysis.",
    icon: Radar,
  },
  {
    title: "Publishing",
    desc: "Export TikTok-ready PNG carousels or post via the official Content Posting API when connected.",
    icon: Share2,
  },
  {
    title: "Connected Accounts",
    desc: "OAuth-verified TikTok accounts with publish-ready status, token refresh, and disconnect controls.",
    icon: Users,
  },
];

const steps = ["Research", "Generate", "Edit", "Publish", "Analyse"];

const faqs = [
  {
    q: "Is Growth OS only for TikTok?",
    a: "TikTok is first-class today (sync, research, carousels, Content Posting API). Export packs work for any platform; more publishers ship next.",
  },
  {
    q: "Do you auto-post without my approval?",
    a: "No. Publishing requires an OAuth-connected account, a privacy choice, and an explicit consent checkbox — per TikTok’s guidelines.",
  },
  {
    q: "Who owns my content and assets?",
    a: "You do. Uploads, generated drafts, and Image Packs stay in your workspace.",
  },
  {
    q: "Can my team share one workspace later?",
    a: "Yes. The data model already supports WorkspaceMember roles. Invite UI is next.",
  },
];

const PRODUCT_SLIDES = [
  "/product-images/slide-images/slide1.png",
  "/product-images/slide-images/slide2.png",
  "/product-images/slide-images/slide3.png",
  "/product-images/slide-images/slide4.png",
  "/product-images/slide-images/slide5.png",
];

/** Slash-style surface: one thin edge, soft fill — no nested frames */
function Surface({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border border-white/[0.09] bg-[#0c0c10]",
        "shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

function DisplayHeading({
  children,
  className,
  as: Tag = "h2",
}: {
  children: React.ReactNode;
  className?: string;
  as?: "h1" | "h2";
}) {
  return (
    <Tag
      className={cn(
        "font-display font-semibold tracking-[-0.03em] text-white",
        "leading-[1.15] overflow-visible pb-[0.2em]",
        className,
      )}
    >
      {children}
    </Tag>
  );
}

export function LandingPage() {
  const [slide, setSlide] = useState(0);

  return (
    <div className="relative bg-[#040406] text-[#e2e3e9]">
      {/*
        Hero — Slash technique:
        - No overflow:hidden on the text path (that clipped descenders)
        - CSS mask-image dissolves panel pixels (no black film overlay)
        - Two layered product shots for depth
        - Display face: General Sans via Fontshare
      */}
      <section className="relative min-h-[min(92vh,880px)]">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 overflow-hidden"
        >
          {/* Soft vignette — draws eye to center like Slash */}
          <div
            className="absolute inset-0 z-[3]"
            style={{
              background:
                "radial-gradient(ellipse 70% 65% at 55% 45%, transparent 20%, rgba(4,4,6,0.55) 100%)",
            }}
          />
          {/* Metallic amber underglow — concentrated behind front panel graph area */}
          <div
            className="absolute right-[18%] top-[28%] z-0 h-[42%] w-[38%] max-w-[560px]"
            style={{
              background:
                "radial-gradient(ellipse 55% 50% at 50% 50%, rgba(212,165,116,0.45) 0%, rgba(204,145,102,0.18) 38%, transparent 70%)",
              filter: "blur(40px)",
            }}
          />
          <div
            className="absolute right-[22%] top-[34%] z-0 h-[22%] w-[22%]"
            style={{
              background:
                "radial-gradient(circle, rgba(255,210,150,0.35) 0%, transparent 70%)",
              filter: "blur(24px)",
            }}
          />

          <div className="absolute bottom-[8%] right-[-4%] top-[6%] z-[1] hidden w-[58vw] lg:block">
            <div
              className="hero-mask-back absolute inset-0 translate-x-10 translate-y-[-2.5rem] scale-[0.92]"
              style={{ opacity: 0.55, filter: "blur(2.5px)" }}
            >
              <div
                className="h-full w-full overflow-hidden rounded-l-2xl"
                style={{
                  background: "rgba(18,18,20,0.45)",
                  boxShadow: "0 50px 100px rgba(0,0,0,0.55)",
                  borderTop: "1px solid rgba(255,255,255,0.07)",
                  borderLeft: "1px solid rgba(255,255,255,0.05)",
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/product-images/Growth-OS-Analytics.png"
                  alt=""
                  className="h-full w-full object-cover object-left-top"
                />
              </div>
            </div>
          </div>

          <div className="absolute bottom-[2%] right-0 top-[14%] z-[2] hidden w-[60vw] lg:block">
            <div className="hero-mask-front absolute inset-0">
              <div
                className="relative h-full min-h-[480px] w-[108%] overflow-hidden rounded-l-[18px]"
                style={{
                  background: "rgba(16,16,18,0.5)",
                  backdropFilter: "blur(24px)",
                  WebkitBackdropFilter: "blur(24px)",
                  boxShadow:
                    "0 50px 100px rgba(0,0,0,0.65), 0 0 80px rgba(212,165,116,0.08), inset 0 1px 0 rgba(255,255,255,0.16), inset 0 -1px 0 rgba(0,0,0,0.35)",
                  borderTop: "1px solid rgba(255,255,255,0.14)",
                  borderLeft: "1px solid rgba(255,255,255,0.09)",
                  borderBottom: "1px solid rgba(255,255,255,0.04)",
                  borderRight: "none",
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/product-images/Growth-OS-Agent.png"
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover object-left-top"
                />
                {/* Glass sheen */}
                <div
                  className="pointer-events-none absolute inset-0"
                  style={{
                    background:
                      "linear-gradient(135deg, rgba(255,255,255,0.08) 0%, transparent 35%, transparent 60%, rgba(212,165,116,0.04) 100%)",
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="relative z-10 mx-auto flex min-h-[min(92vh,880px)] max-w-6xl flex-col justify-center px-4 pb-28 pt-28 sm:px-6 sm:pt-32">
          <p className="text-[13px] font-medium uppercase tracking-[0.14em] text-[#cc9166]">
            Growth OS
          </p>
          <h1
            className="font-display mt-6 max-w-[16ch] text-[clamp(2.6rem,5.8vw,4rem)] font-semibold tracking-[-0.03em] text-white"
            style={{
              lineHeight: 1.2,
              paddingBottom: "0.45em",
              overflow: "visible",
              display: "block",
            }}
          >
            The operating system for creator growth.
          </h1>
          <p className="mt-2 max-w-md text-lg leading-relaxed text-[#9194a1]">
            Research, generate, and publish short-form — grounded in your real
            analytics, not guesswork.
          </p>
          <div className="mt-10 flex flex-wrap gap-3">
            <Link
              href="/signup"
              className="inline-flex h-11 items-center rounded-full bg-white px-7 text-sm font-medium text-[#040406] transition hover:bg-[#e2e3e9]"
            >
              Start Free
            </Link>
            <Link
              href="/login"
              className="inline-flex h-11 items-center rounded-full border border-white/[0.12] bg-black/20 px-7 text-sm font-medium text-[#c7c9d1] backdrop-blur-sm transition hover:border-white/25 hover:text-white"
            >
              Sign in
            </Link>
          </div>

          <div className="relative mt-14 space-y-3 lg:hidden">
            <div
              className="absolute -inset-8 rounded-full opacity-60 blur-2xl"
              style={{
                background:
                  "radial-gradient(circle at 55% 35%, rgba(212,165,116,0.22), transparent 65%)",
              }}
            />
            <div
              className="relative overflow-hidden rounded-2xl opacity-70"
              style={{
                filter: "blur(1px)",
                border: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/product-images/Growth-OS-Analytics.png"
                alt=""
                className="w-full object-cover object-top"
              />
            </div>
            <div
              className="relative -mt-16 ml-4 overflow-hidden rounded-2xl"
              style={{
                background: "rgba(16,16,18,0.65)",
                backdropFilter: "blur(16px)",
                boxShadow:
                  "0 32px 64px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.12)",
                border: "1px solid rgba(255,255,255,0.1)",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/product-images/Growth-OS-Agent.png"
                alt="Growth OS AI Agent"
                className="w-full object-cover object-top"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="relative mx-auto max-w-6xl px-4 py-24 sm:px-6">
        <p className="text-[13px] font-medium uppercase tracking-[-0.02em] text-[#cc9166]">
          Platform
        </p>
        <DisplayHeading className="mt-3 text-[clamp(1.75rem,4vw,2.5rem)]">
          Built for the full loop
        </DisplayHeading>
        <p className="mt-4 max-w-xl text-base font-light text-[#9194a1]">
          Nine surfaces that replace the spreadsheet-and-tabs stack most creators
          still use.
        </p>
        <div className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ delay: i * 0.03 }}
            >
              <Surface className="h-full p-6 transition hover:border-white/[0.14]">
                <f.icon className="h-4 w-4 text-[#ae9357]" strokeWidth={1.5} />
                <h3 className="mt-4 text-sm font-medium leading-normal text-white">
                  {f.title}
                </h3>
                <p className="mt-2 text-[13px] leading-relaxed text-[#777a88]">
                  {f.desc}
                </p>
              </Surface>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Workflow */}
      <section id="workflow" className="relative border-y border-white/[0.06] py-24">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 50% 80% at 50% 0%, rgba(204,145,102,0.06), transparent 60%)",
          }}
        />
        <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
          <p className="text-[13px] font-medium uppercase tracking-[-0.02em] text-[#cc9166]">
            Workflow
          </p>
          <DisplayHeading className="mt-3 text-[clamp(1.75rem,4vw,2.5rem)]">
            One path from blank day to publish
          </DisplayHeading>
          <div className="mt-12 flex flex-wrap items-center gap-2">
            {steps.map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                <span className="rounded-full border border-white/[0.1] bg-white/[0.03] px-4 py-2 text-sm text-[#c7c9d1]">
                  {s}
                </span>
                {i < steps.length - 1 && (
                  <span className="text-[#464853]">→</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Carousel — compact phone frame */}
      <section className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 py-24 sm:px-6 lg:grid-cols-[1fr_auto] lg:gap-16">
        <div>
          <p className="text-[13px] font-medium uppercase tracking-[-0.02em] text-[#cc9166]">
            Product
          </p>
          <DisplayHeading className="mt-3 max-w-lg text-[clamp(1.75rem,4vw,2.5rem)]">
            Carousels that look native on TikTok
          </DisplayHeading>
          <p className="mt-4 max-w-md text-base font-light text-[#9194a1]">
            Image Packs, caption styles, and export-ready PNGs — flip through a
            real carousel generated in Growth OS.
          </p>
        </div>
        <div className="relative mx-auto w-[260px] sm:w-[286px]">
          <div
            aria-hidden
            className="pointer-events-none absolute -inset-10 rounded-full opacity-80 blur-2xl"
            style={{
              background:
                "radial-gradient(circle, rgba(204,145,102,0.28), transparent 65%)",
            }}
          />
          <Surface className="relative">
            <div className="relative aspect-[9/16] bg-[#0c0c10]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={PRODUCT_SLIDES[slide]}
                alt={`Carousel slide ${slide + 1}`}
                className="h-full w-full object-cover"
              />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-3 pb-4 pt-12">
                <div className="flex justify-center gap-1.5">
                  {PRODUCT_SLIDES.map((_, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setSlide(i)}
                      aria-label={`Show slide ${i + 1}`}
                      className={cn(
                        "h-1.5 rounded-full transition",
                        i === slide ? "w-4 bg-white" : "w-1.5 bg-white/35",
                      )}
                    />
                  ))}
                </div>
              </div>
            </div>
          </Surface>
        </div>
      </section>

      {/* Workspace — Slash-like product cards (image flush, one border) */}
      <section className="relative border-y border-white/[0.06] py-24">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 overflow-hidden"
        >
          <div
            className="absolute left-1/2 top-0 h-[50%] w-[80%] -translate-x-1/2 opacity-40"
            style={{
              background:
                "radial-gradient(ellipse at center, rgba(204,145,102,0.1), transparent 70%)",
            }}
          />
          {/* Soft faded screenshots in section atmosphere */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/product-images/Growth-OS-Agent.png"
            alt=""
            className="absolute -left-[10%] top-[20%] w-[40%] max-w-md opacity-[0.04] blur-sm"
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/product-images/Growth-OS-Analytics.png"
            alt=""
            className="absolute -right-[8%] bottom-[10%] w-[38%] max-w-md opacity-[0.04] blur-sm"
          />
        </div>

        <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
          <p className="text-[13px] font-medium uppercase tracking-[-0.02em] text-[#cc9166]">
            Workspace
          </p>
          <DisplayHeading className="mt-3 max-w-2xl text-[clamp(1.75rem,4vw,2.5rem)]">
            Agent and analytics in one surface
          </DisplayHeading>
          <p className="mt-4 max-w-xl text-base font-light text-[#9194a1]">
            Research grounded in your posts, then ship — without jumping between
            five tabs.
          </p>

          <div className="mt-12 grid gap-4 lg:grid-cols-2">
            {[
              {
                src: "/product-images/Growth-OS-Agent.png",
                title: "AI Agent",
                desc: "Ask about hooks, competitors, and what to post next.",
              },
              {
                src: "/product-images/Growth-OS-Analytics.png",
                title: "Analytics",
                desc: "Engagement, posting hours, and lifts computed on your data.",
              },
            ].map((card) => (
              <Surface key={card.title} className="group">
                <div className="relative overflow-hidden">
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-0 z-[1] opacity-0 transition group-hover:opacity-100"
                    style={{
                      background:
                        "radial-gradient(ellipse 60% 40% at 50% 0%, rgba(255,255,255,0.06), transparent)",
                    }}
                  />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={card.src}
                    alt={card.title}
                    className="aspect-[16/10] w-full object-cover object-top"
                  />
                </div>
                <div className="border-t border-white/[0.06] px-5 py-4">
                  <p className="text-sm font-medium leading-normal text-white">
                    {card.title}
                  </p>
                  <p className="mt-1 text-[13px] font-light leading-relaxed text-[#9194a1]">
                    {card.desc}
                  </p>
                </div>
              </Surface>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="relative py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <p className="text-[13px] font-medium uppercase tracking-[-0.02em] text-[#cc9166]">
            Pricing
          </p>
          <DisplayHeading className="mt-3 text-[clamp(1.75rem,4vw,2.5rem)]">
            Simple pricing
          </DisplayHeading>
          <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-[#9194a1]">
            Create your account, then start your 7-day trial for $0 on Stripe.
            Cancel anytime before the trial ends.
          </p>
          <div className="mt-12 grid gap-3 md:grid-cols-4">
            {[
              {
                name: "Creator",
                price: "$24",
                blurb: "5 channels, unlimited posts, AI copilot, analytics, calendar",
                cta: "Start for $0",
                href: "/signup?plan=creator",
              },
              {
                name: "Team",
                price: "$34",
                blurb: "10 channels, unlimited members, 100 AI images, 10 AI videos",
                cta: "Start for $0",
                href: "/signup?plan=team",
              },
              {
                name: "Pro",
                price: "$44",
                blurb: "30 channels, 300 AI images, 30 AI videos, API and webhooks",
                cta: "Start for $0",
                href: "/signup?plan=pro",
                highlight: true,
              },
              {
                name: "Agency",
                price: "$89",
                blurb: "100 channels, 500 AI images, 60 AI videos, for agencies",
                cta: "Start for $0",
                href: "/signup?plan=agency",
              },
            ].map((p) => (
              <Surface
                key={p.name}
                className={cn(
                  "flex flex-col p-6",
                  p.highlight && "border-white/[0.14] bg-[#121212]",
                )}
              >
                <p className="text-sm font-medium text-white">{p.name}</p>
                <p className="mt-3 text-3xl font-semibold tabular-nums text-white">
                  {p.price}
                  <span className="ml-1 text-sm font-normal text-[#777a88]">/mo</span>
                </p>
                <p className="mt-2 flex-1 text-[13px] text-[#777a88]">{p.blurb}</p>
                <Link
                  href={p.href}
                  className={cn(
                    "mt-5 inline-flex h-9 items-center justify-center rounded-full text-xs font-medium",
                    p.highlight
                      ? "bg-white text-[#040406]"
                      : "border border-white/[0.12] text-[#c7c9d1]",
                  )}
                >
                  {p.cta}
                </Link>
              </Surface>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-3xl px-4 py-24 sm:px-6">
        <DisplayHeading className="text-3xl">FAQ</DisplayHeading>
        <div className="mt-8 space-y-2">
          {faqs.map((f) => (
            <details
              key={f.q}
              className="group rounded-2xl border border-white/[0.09] bg-[#0c0c10] px-5 py-4"
            >
              <summary className="cursor-pointer list-none text-sm font-medium leading-normal text-white">
                {f.q}
              </summary>
              <p className="mt-2 text-[13px] leading-relaxed text-[#777a88]">
                {f.a}
              </p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
