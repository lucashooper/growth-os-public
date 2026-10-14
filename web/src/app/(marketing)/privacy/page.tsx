import type { Metadata } from "next";
import {
  OperatorEmail,
  OperatorSite,
} from "@/components/marketing/operator-contact";

export const metadata: Metadata = {
  title: "Privacy Policy · Growth OS",
  description:
    "How Growth OS collects, uses, stores, and deletes personal data, including TikTok OAuth and Content Posting API data.",
};

export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-3xl px-4 py-16 sm:px-6 prose prose-invert prose-sm">
      <h1>Privacy Policy</h1>
      <p className="text-muted">Last updated: 31 July 2026</p>

      <p>
        This Privacy Policy explains how <strong>Growth OS</strong> (“Growth OS”, “we”, “us”,
        or “our”), available at{" "}
        <OperatorSite />, collects, uses,
        stores, shares, and deletes personal data when you use our website and application.
      </p>
      <p>
        Growth OS is an AI-assisted creator operating system that helps users research trends,
        generate short-form content, manage media assets, analyse competitors, and publish to
        connected social platforms (including TikTok) with the user’s explicit authorisation.
      </p>
      <p>
        By creating an account or using Growth OS, you acknowledge this Policy. If you do not
        agree, do not use the service. This Policy is intended to meet common expectations for
        apps that integrate TikTok Login Kit and the Content Posting API. It is not a substitute
        for independent legal advice.
      </p>

      <h2>1. Who we are (data controller)</h2>
      <p>
        For personal data processed through Growth OS, the controller is the operator of the
        Growth OS service at <OperatorSite strong />.
      </p>
      <ul>
        <li>
          Privacy contact:{" "}
          <OperatorEmail />
        </li>
        <li>
          General contact:{" "}
          <OperatorEmail />
        </li>
        <li>
          Website:{" "}
          <OperatorSite />
        </li>
      </ul>
      <p>
        If you need a postal address for a formal rights request or regulator correspondence,
        email <OperatorEmail /> and we will provide
        the registered contact details for the operating entity.
      </p>

      <h2>2. Scope</h2>
      <p>This Policy applies to:</p>
      <ul>
        <li>Visitors to our marketing site</li>
        <li>Users who create Growth OS accounts</li>
        <li>
          Users who connect TikTok or other third-party accounts via OAuth
        </li>
        <li>Content, media, and analytics processed inside a user’s workspace</li>
      </ul>

      <h2>3. Personal data we collect</h2>

      <h3>3.1 Account and authentication data</h3>
      <p>When you sign up or sign in (via Supabase Auth), we process:</p>
      <ul>
        <li>Email address</li>
        <li>Display name (if provided)</li>
        <li>Authentication identifiers / user IDs issued by our auth provider</li>
        <li>Session cookies and related security tokens</li>
      </ul>
      <p>
        Passwords are handled by Supabase Auth and are not stored in our application database in
        plain text. We do not receive your social network passwords through TikTok OAuth.
      </p>

      <h3>3.2 Workspace and product usage data</h3>
      <ul>
        <li>Projects, drafts, captions, hooks, schedules, and generation history</li>
        <li>Uploaded media (images/videos), library assets, and Image Packs</li>
        <li>
          Product usage events (for example: feature opens, generation counts, publish attempts,
          error logs) to operate and improve reliability
        </li>
        <li>Workspace preferences (for example: active project)</li>
      </ul>

      <h3>3.3 TikTok OAuth and Content Posting data</h3>
      <p>
        If you choose to connect TikTok, we process data necessary to authenticate you and to
        provide analytics sync and publishing features you request. Depending on the scopes you
        approve, this may include:
      </p>
      <ul>
        <li>
          <strong>Profile identifiers:</strong> TikTok <code>open_id</code>, username / display
          name, avatar URL, and related basic profile fields granted under{" "}
          <code>user.info.basic</code>
        </li>
        <li>
          <strong>OAuth credentials:</strong> access token, refresh token, token expiry, and
          granted scope list
        </li>
        <li>
          <strong>Publishing metadata:</strong> captions/titles you submit, privacy level you
          select, brand-content toggles, publish job IDs, status responses, and error codes from
          TikTok’s APIs
        </li>
        <li>
          <strong>Media for publishing:</strong> slide images or other media you ask us to publish;
          we host them on infrastructure you control/verify (for example our app domain / storage)
          so TikTok can pull them via HTTPS
        </li>
        <li>
          <strong>Public analytics (where synced):</strong> publicly available post metrics you
          ask us to import for your connected accounts (for example views, likes, comments), shown
          only inside your workspace
        </li>
      </ul>
      <p>
        We only request TikTok scopes required for the features you use. Current Login Kit /
        Content Posting scopes used by Growth OS include:
      </p>
      <ul>
        <li>
          <code>user.info.basic</code> — to identify the connected TikTok creator account and
          display profile information in Connected Accounts
        </li>
        <li>
          <code>video.publish</code> — to publish content (including photo carousels) directly to
          TikTok via the Content Posting API after you confirm privacy and consent in-product
        </li>
        <li>
          <code>video.upload</code> — only if enabled for upload-to-inbox / draft upload flows; if
          this scope is not used in your workspace configuration, it will not be requested
        </li>
      </ul>
      <p>
        TikTok processing is also governed by{" "}
        <a href="https://www.tiktok.com/legal/page/row/privacy-policy/en">
          TikTok’s Privacy Policy
        </a>{" "}
        and{" "}
        <a href="https://developers.tiktok.com/terms">TikTok Developer Terms of Service</a>. You
        can revoke Growth OS’s access at any time in TikTok’s app permissions settings and by
        disconnecting the account in Growth OS.
      </p>

      <h3>3.4 Competitor and public research data</h3>
      <p>
        When you add competitors or run research features, we may collect publicly available
        information (for example public profile metadata, public post captions/thumbnails,
        website metadata, app store listing information). This is processed to provide competitive
        intelligence inside your workspace and is not sold as a data product.
      </p>

      <h3>3.5 AI processing data</h3>
      <p>
        To generate copy, briefings, opportunities, and chat answers, we may send prompts and
        relevant project context to AI providers you configure (for example Groq or OpenAI). Do
        not submit special-category or sensitive personal data you are not authorised to process.
      </p>

      <h3>3.6 Payment data (when billing is enabled)</h3>
      <p>
        If paid plans are enabled, payment card details are processed by Stripe (or a similar
        payment processor). We do not store full card numbers on our servers.
      </p>

      <h2>4. How we use personal data</h2>
      <p>We use personal data to:</p>
      <ul>
        <li>Create and secure accounts; authenticate sessions</li>
        <li>Provide workspaces, generation, libraries, scheduling, and publishing</li>
        <li>
          Connect TikTok accounts, refresh tokens, and execute publish requests you initiate
        </li>
        <li>Show analytics and recommendations inside your workspace</li>
        <li>Detect abuse, debug failures, and maintain service security</li>
        <li>Respond to support and privacy requests</li>
        <li>Comply with law and enforce our Terms of Service</li>
      </ul>
      <p>
        We do <strong>not</strong> sell personal data. We do not use TikTok user data to serve
        third-party advertising. We do not use TikTok data outside the Growth OS product
        experience except as needed to operate the features you requested or as required by law.
      </p>

      <h2>5. Legal bases (EEA/UK users)</h2>
      <p>Where GDPR/UK GDPR applies, we rely on:</p>
      <ul>
        <li>
          <strong>Contract</strong> — to provide the service you signed up for (account, sync,
          publish)
        </li>
        <li>
          <strong>Consent</strong> — for OAuth connections and optional processing where consent
          is required (you can withdraw by disconnecting)
        </li>
        <li>
          <strong>Legitimate interests</strong> — security, fraud prevention, product reliability
          analytics (balanced against your rights)
        </li>
        <li>
          <strong>Legal obligation</strong> — where we must retain or disclose data by law
        </li>
      </ul>

      <h2>6. Cookies and similar technologies</h2>
      <p>We use cookies and local storage for:</p>
      <ul>
        <li>Authenticated sessions (Supabase Auth)</li>
        <li>CSRF / OAuth state protection during TikTok connect flows</li>
        <li>Workspace preferences (for example active project / UI settings)</li>
      </ul>
      <p>
        We do not use third-party advertising cookies to track you across unrelated sites for ad
        targeting.
      </p>

      <h2>7. Sharing and subprocessors</h2>
      <p>
        We share personal data only with service providers that help us operate Growth OS, under
        contractual obligations to protect it:
      </p>
      <ul>
        <li>
          <strong>Supabase</strong> — authentication and (in production) database / storage
        </li>
        <li>
          <strong>Netlify</strong> (or similar hosting) — application hosting and edge delivery
        </li>
        <li>
          <strong>AI providers</strong> (for example Groq, OpenAI) — generation features you use
        </li>
        <li>
          <strong>TikTok</strong> — when you connect an account or publish; TikTok receives the
          content and instructions you authorise
        </li>
        <li>
          <strong>Stripe</strong> — payments when billing is enabled
        </li>
      </ul>
      <p>
        We may disclose data if required by law, regulation, legal process, or to protect the
        rights, safety, and security of Growth OS, our users, or the public.
      </p>

      <h2>8. International transfers</h2>
      <p>
        Our infrastructure and subprocessors may process data in the United Kingdom, European
        Economic Area, United States, or other locations where those providers operate. Where
        required, we rely on appropriate transfer mechanisms offered by our providers (for
        example standard contractual clauses).
      </p>

      <h2>9. Retention</h2>
      <ul>
        <li>
          <strong>Account data</strong> — kept while your account is active
        </li>
        <li>
          <strong>TikTok tokens</strong> — kept while the account remains connected; deleted or
          invalidated when you disconnect or when tokens expire and cannot be refreshed
        </li>
        <li>
          <strong>Publish jobs / logs</strong> — retained as needed for debugging, abuse
          prevention, and audit (typically up to 12 months unless a longer period is required)
        </li>
        <li>
          <strong>Uploaded media</strong> — retained until you delete it or delete your account,
          subject to backup cycles
        </li>
        <li>
          <strong>Security logs</strong> — may be retained longer where needed for security and
          legal compliance
        </li>
      </ul>

      <h2>10. Security</h2>
      <p>
        We use industry-standard safeguards appropriate to a SaaS product, including encrypted
        transport (HTTPS), access-controlled databases, and least-privilege service credentials.
        No method of transmission or storage is 100% secure; you are responsible for protecting
        your account credentials and for reviewing content before publishing.
      </p>

      <h2>11. Your rights and choices</h2>
      <p>Depending on your location, you may have the right to:</p>
      <ul>
        <li>Access the personal data we hold about you</li>
        <li>Correct inaccurate data</li>
        <li>Request deletion or anonymisation</li>
        <li>Export a copy of your data (portability)</li>
        <li>Object to or restrict certain processing</li>
        <li>Withdraw consent where processing is consent-based</li>
      </ul>
      <p>In-product controls include:</p>
      <ul>
        <li>
          Disconnect TikTok from <strong>Connected Accounts</strong>
        </li>
        <li>Revoke app access in TikTok’s settings</li>
        <li>
          Request account deletion by emailing{" "}
          <OperatorEmail />
        </li>
      </ul>
      <p>
        We will respond to verifiable requests within a reasonable period (generally within 30
        days where required by law). You may also complain to your local data protection
        authority.
      </p>

      <h2>12. Children</h2>
      <p>
        Growth OS is not directed to children under 13 (or under 16 where a higher age is
        required by local law). We do not knowingly collect personal data from children. If you
        believe a child has provided data, contact us and we will delete it.
      </p>

      <h2>13. Automated decision-making</h2>
      <p>
        Growth OS uses AI to generate suggestions and insights. These outputs are assistive; they
        do not produce legal or similarly significant decisions about you without human review.
        You remain responsible for what you publish.
      </p>

      <h2>14. Changes to this Policy</h2>
      <p>
        We may update this Policy from time to time. The “Last updated” date will change when we
        do. Material changes will be highlighted on this page or communicated in-product where
        appropriate. Continued use after an update constitutes acceptance of the revised Policy.
      </p>

      <h2>15. Contact</h2>
      <p>
        Privacy requests:{" "}
        <OperatorEmail />
        <br />
        Legal: <OperatorEmail />
        <br />
        Web: <OperatorSite />
      </p>
    </article>
  );
}
