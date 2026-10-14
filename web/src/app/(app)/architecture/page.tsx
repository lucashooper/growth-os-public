"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  FileCode2, 
  Image as ImageIcon, 
  Cloud, 
  Database, 
  Cpu, 
  Globe,
  ChevronRight,
  ChevronDown
} from "lucide-react";

export default function ArchitecturePage() {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(["overview"])
  );

  const toggleSection = (id: string) => {
    const next = new Set(expandedSections);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setExpandedSections(next);
  };

  const sections = [
    {
      id: "overview",
      icon: Globe,
      title: "System Overview",
      badge: "Architecture",
      content: (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Growth OS is a full-stack Next.js application for TikTok content management and generation.
          </p>
          <div className="rounded border border-border bg-surface-1 p-3 font-mono text-xs">
            <div>User → Next.js Frontend → API Routes → Services → External APIs</div>
            <div className="ml-8">↓</div>
            <div className="ml-4">Prisma ORM</div>
            <div className="ml-8">↓</div>
            <div className="ml-4">SQLite Database</div>
          </div>
        </div>
      ),
    },
    {
      id: "images",
      icon: ImageIcon,
      title: "Image Handling",
      badge: "Critical",
      content: (
        <div className="space-y-4">
          <div>
            <h4 className="mb-2 text-sm font-medium">Three Image Sources:</h4>
            <div className="space-y-2">
              <div className="rounded border border-border bg-surface-1 p-3">
                <div className="mb-1 text-xs font-medium">1. TikTok CDN (Public Posts)</div>
                <p className="mb-2 text-xs text-muted-foreground">
                  Synced from published posts. URLs expire after 24-48 hours.
                </p>
                <code className="text-xs">https://p16-sign-sg.tiktokcdn.com/...</code>
              </div>
              
              <div className="rounded border border-border bg-surface-1 p-3">
                <div className="mb-1 text-xs font-medium">2. Supabase Storage (Generated)</div>
                <p className="mb-2 text-xs text-muted-foreground">
                  User uploads and generated slide backgrounds. Permanent.
                </p>
                <code className="text-xs">YOUR_PROJECT.supabase.co/storage/...</code>
              </div>
              
              <div className="rounded border border-border bg-surface-1 p-3">
                <div className="mb-1 text-xs font-medium">3. SVG Placeholders (Fallback)</div>
                <p className="text-xs text-muted-foreground">
                  Gradient images generated client-side. Always works.
                </p>
              </div>
            </div>
          </div>

          <div>
            <h4 className="mb-2 text-sm font-medium">Current Issue:</h4>
            <div className="rounded border border-warning/30 bg-warning/5 p-3">
              <p className="text-xs text-warning">
                TikTok CDN URLs contain expiration timestamps. After expiry, images fail to load and fallback to placeholders.
              </p>
            </div>
          </div>

          <div>
            <h4 className="mb-2 text-sm font-medium">Planned Solution:</h4>
            <div className="rounded border border-accent/30 bg-accent/5 p-3">
              <p className="text-xs text-accent">
                Image Proxy: Download expiring TikTok images → Cache in Supabase → Serve permanent URLs
              </p>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: "playwright",
      icon: Cpu,
      title: "Web Scraping (Playwright)",
      badge: "Automation",
      content: (
        <div className="space-y-4">
          <div>
            <h4 className="mb-2 text-sm font-medium">What We Scrape:</h4>
            <ul className="space-y-2 text-xs text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-accent">▸</span>
                <span>TikTok profile data (avatar, bio, followers, following)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-accent">▸</span>
                <span>Recent video metadata (views, likes, thumbnails)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-accent">▸</span>
                <span>Account verification status</span>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="mb-2 text-sm font-medium">Why Playwright?</h4>
            <div className="space-y-2">
              <div className="flex items-start gap-2 text-xs text-muted-foreground">
                <span className="text-accent">•</span>
                <span>TikTok has no public API for profile data</span>
              </div>
              <div className="flex items-start gap-2 text-xs text-muted-foreground">
                <span className="text-accent">•</span>
                <span>Content is JavaScript-rendered (can't use simple HTTP)</span>
              </div>
              <div className="flex items-start gap-2 text-xs text-muted-foreground">
                <span className="text-accent">•</span>
                <span>Bypasses rate limiting by looking like a real browser</span>
              </div>
            </div>
          </div>

          <div>
            <h4 className="mb-2 text-sm font-medium">When It Runs:</h4>
            <div className="rounded border border-border bg-surface-1 p-3">
              <div className="mb-1 text-xs">
                <span className="font-medium">Automatic:</span> Every 6 hours
              </div>
              <div className="mb-1 text-xs">
                <span className="font-medium">Manual:</span> Click "Sync Now" on account card
              </div>
              <div className="text-xs">
                <span className="font-medium">OAuth:</span> After connecting new account
              </div>
            </div>
          </div>

          <div>
            <h4 className="mb-2 text-sm font-medium">Location:</h4>
            <code className="text-xs">src/services/tiktok-sync.ts</code>
          </div>
        </div>
      ),
    },
    {
      id: "database",
      icon: Database,
      title: "Database Schema",
      badge: "Data",
      content: (
        <div className="space-y-3">
          <div className="space-y-2">
            <div className="rounded border border-border bg-surface-1 p-3">
              <div className="mb-1 font-mono text-xs font-medium">Project</div>
              <p className="text-xs text-muted-foreground">
                Workspace isolation. Contains accounts, posts, assets.
              </p>
            </div>
            
            <div className="rounded border border-border bg-surface-1 p-3">
              <div className="mb-1 font-mono text-xs font-medium">ConnectedAccount</div>
              <p className="text-xs text-muted-foreground">
                TikTok OAuth accounts with tokens, username, avatar.
              </p>
            </div>
            
            <div className="rounded border border-border bg-surface-1 p-3">
              <div className="mb-1 font-mono text-xs font-medium">Post</div>
              <p className="text-xs text-muted-foreground">
                Content (drafts + published). Stores hook, slides, analytics.
              </p>
            </div>
            
            <div className="rounded border border-border bg-surface-1 p-3">
              <div className="mb-1 font-mono text-xs font-medium">PublishAttempt</div>
              <p className="text-xs text-muted-foreground">
                Scheduled publishes with retry logic and status tracking.
              </p>
            </div>
            
            <div className="rounded border border-border bg-surface-1 p-3">
              <div className="mb-1 font-mono text-xs font-medium">LibraryAsset</div>
              <p className="text-xs text-muted-foreground">
                Media files for slides, organized by project and folder.
              </p>
            </div>
          </div>
          
          <div>
            <h4 className="mb-2 text-sm font-medium">View Schema:</h4>
            <code className="text-xs">npx prisma studio</code>
          </div>
        </div>
      ),
    },
    {
      id: "api",
      icon: FileCode2,
      title: "API Endpoints",
      badge: "Reference",
      content: (
        <div className="space-y-3">
          <div className="space-y-2">
            <div className="rounded border border-border bg-surface-1 p-3">
              <div className="mb-1 font-mono text-xs font-medium text-success">
                GET /api/posts
              </div>
              <p className="text-xs text-muted-foreground">
                Fetch posts by project, status, or IDs
              </p>
            </div>
            
            <div className="rounded border border-border bg-surface-1 p-3">
              <div className="mb-1 font-mono text-xs font-medium text-accent">
                POST /api/posts
              </div>
              <p className="text-xs text-muted-foreground">
                Create new post with slides and metadata
              </p>
            </div>
            
            <div className="rounded border border-border bg-surface-1 p-3">
              <div className="mb-1 font-mono text-xs font-medium text-accent">
                POST /api/tiktok/publish
              </div>
              <p className="text-xs text-muted-foreground">
                Publish content to TikTok (direct or draft)
              </p>
            </div>
            
            <div className="rounded border border-border bg-surface-1 p-3">
              <div className="mb-1 font-mono text-xs font-medium text-accent">
                POST /api/publish-attempts
              </div>
              <p className="text-xs text-muted-foreground">
                Schedule future publishes with retry logic
              </p>
            </div>
            
            <div className="rounded border border-border bg-surface-1 p-3">
              <div className="mb-1 font-mono text-xs font-medium text-accent">
                POST /api/sync
              </div>
              <p className="text-xs text-muted-foreground">
                Trigger Playwright scraping for TikTok account
              </p>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: "jobs",
      icon: Cloud,
      title: "Background Jobs",
      badge: "Automation",
      content: (
        <div className="space-y-3">
          <div className="space-y-2">
            <div className="rounded border border-border bg-surface-1 p-3">
              <div className="mb-1 flex items-center justify-between">
                <span className="font-mono text-xs font-medium">publish_scheduled</span>
                <Badge tone="accent" className="text-xs">Every 2 min</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Executes due publish attempts, handles retries
              </p>
            </div>
            
            <div className="rounded border border-border bg-surface-1 p-3">
              <div className="mb-1 flex items-center justify-between">
                <span className="font-mono text-xs font-medium">sync_accounts</span>
                <Badge tone="primary" className="text-xs">Every 6 hours</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Syncs TikTok profiles with Playwright
              </p>
            </div>
            
            <div className="rounded border border-border bg-surface-1 p-3">
              <div className="mb-1 flex items-center justify-between">
                <span className="font-mono text-xs font-medium">cleanup_old_logs</span>
                <Badge tone="default" className="text-xs">Daily</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Deletes DevLog entries older than 30 days
              </p>
            </div>
          </div>
          
          <div>
            <h4 className="mb-2 text-sm font-medium">Location:</h4>
            <code className="text-xs">src/services/jobs.ts</code>
          </div>
        </div>
      ),
    },
  ];

  return (
    <div className="container mx-auto max-w-4xl space-y-6 p-6">
      <div>
        <h1 className="mb-2 text-2xl font-semibold">Architecture & Usage</h1>
        <p className="text-sm text-muted-foreground">
          How Growth OS works under the hood
        </p>
      </div>

      <div className="space-y-3">
        {sections.map((section) => {
          const Icon = section.icon;
          const isExpanded = expandedSections.has(section.id);

          return (
            <Card key={section.id} className="overflow-hidden">
              <button
                onClick={() => toggleSection(section.id)}
                className="flex w-full items-center justify-between p-4 text-left hover:bg-surface-1/50"
              >
                <div className="flex items-center gap-3">
                  <div className="rounded bg-accent/10 p-2 text-accent">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{section.title}</span>
                      <Badge tone="default" className="text-xs">
                        {section.badge}
                      </Badge>
                    </div>
                  </div>
                </div>
                {isExpanded ? (
                  <ChevronDown className="h-5 w-5 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                )}
              </button>

              {isExpanded && (
                <div className="border-t border-border bg-surface-1/30 p-4">
                  {section.content}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      <Card className="border-accent/30 bg-accent/5 p-4">
        <h3 className="mb-2 text-sm font-medium">Full Documentation</h3>
        <p className="mb-3 text-xs text-muted-foreground">
          For detailed technical documentation, debugging guides, and deployment instructions, see:
        </p>
        <code className="text-xs">web/ARCHITECTURE.md</code>
      </Card>
    </div>
  );
}
