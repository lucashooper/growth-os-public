import type { Metadata } from "next";
import {
  OperatorEmail,
  OperatorSite,
} from "@/components/marketing/operator-contact";

export const metadata: Metadata = {
  title: "Terms of Service · Growth OS",
  description:
    "Terms governing use of Growth OS, including TikTok integrations, acceptable use, and account rules.",
};

export default function TermsPage() {
  return (
    <article className="mx-auto max-w-3xl px-4 py-16 sm:px-6 prose prose-invert prose-sm">
      <h1>Terms of Service</h1>
      <p className="text-muted">Last updated: 31 July 2026</p>

      <p>
        These Terms of Service (“Terms”) govern access to and use of{" "}
        <strong>Growth OS</strong> at{" "}
        <OperatorSite />{" "}
        (the “Service”). By creating an account, accessing, or using the Service, you agree to
        these Terms. If you use the Service on behalf of an organisation, you represent that you
        have authority to bind that organisation, and “you” includes that organisation.
      </p>
      <p>
        If you do not agree, do not use Growth OS. These Terms are intended to support platform
        reviews (including TikTok developer audits) and ordinary commercial use. They are not a
        substitute for independent legal advice.
      </p>

      <h2>1. The Service</h2>
      <p>
        Growth OS provides software tools for creators and teams to research trends, generate
        short-form content, manage media, analyse competitors, and publish to connected social
        platforms. Features may change over time. We may add, modify, or discontinue functionality
        with reasonable notice where practicable.
      </p>

      <h2>2. Eligibility</h2>
      <ul>
        <li>
          You must be at least <strong>13 years old</strong> (or the minimum age required in your
          country, if higher — for example 16 in some jurisdictions) to use the Service.
        </li>
        <li>
          You must have the legal capacity to enter a binding contract.
        </li>
        <li>
          You must comply with these Terms and with the terms of any third-party platforms you
          connect (including TikTok).
        </li>
      </ul>

      <h2>3. Accounts</h2>
      <ul>
        <li>You are responsible for the accuracy of account information you provide.</li>
        <li>
          You are responsible for maintaining the confidentiality of your login credentials and
          for all activity under your account.
        </li>
        <li>
          Notify us promptly at{" "}
          <OperatorEmail /> if you suspect unauthorised
          access.
        </li>
        <li>
          One natural person or organisation should not create accounts solely to evade
          suspension, rate limits, or platform policies.
        </li>
      </ul>

      <h2>4. Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>Violate any applicable law or regulation</li>
        <li>
          Infringe intellectual property, privacy, publicity, or other rights of any person
        </li>
        <li>
          Spam, harass, defraud, or deceive others; distribute malware; or attempt to breach
          another user’s workspace
        </li>
        <li>
          Use the Service to violate TikTok’s Terms of Service, Community Guidelines, Developer
          Terms, or Content Posting / Login Kit policies
        </li>
        <li>
          Abuse APIs, automate publishing in ways that violate platform rules, scrape in a way
          that harms third parties, or circumvent rate limits / security controls
        </li>
        <li>
          Upload or generate content you do not have rights to use (including music, images,
          trademarks, or personal data of others without a lawful basis)
        </li>
        <li>
          Misrepresent your identity, brand partnerships, or paid promotions where disclosure is
          required
        </li>
      </ul>
      <p>
        We may investigate suspected violations and suspend or terminate access where we
        reasonably believe these Terms or third-party platform rules have been breached.
      </p>

      <h2>5. Your content</h2>
      <p>
        “User Content” means captions, media, drafts, uploads, prompts, competitor notes, and
        other materials you submit to or create with the Service.
      </p>
      <ul>
        <li>
          You retain ownership of your User Content (subject to third-party rights in materials
          you include).
        </li>
        <li>
          You grant Growth OS a worldwide, non-exclusive, royalty-free licence to host, store,
          process, transmit, display, and otherwise use User Content solely as needed to operate
          and improve the Service (including sending media to TikTok when you publish).
        </li>
        <li>
          You represent that you have all rights necessary to grant this licence and to publish
          the content on connected platforms.
        </li>
        <li>
          You are solely responsible for User Content and for any claims arising from content you
          publish via Growth OS.
        </li>
      </ul>

      <h2>6. AI-generated outputs</h2>
      <p>
        Features may use third-party AI models to suggest hooks, scripts, briefings, and other
        outputs. AI outputs may be inaccurate, incomplete, biased, or similar to content produced
        for others. You must review outputs before publishing. Growth OS does not guarantee
        virality, rankings, monetisation, or platform approval.
      </p>

      <h2>7. Third-party platforms (including TikTok)</h2>
      <p>
        Growth OS may integrate with third-party services such as TikTok (Login Kit and Content
        Posting API), AI providers, hosting, and authentication providers.
      </p>
      <ul>
        <li>
          Your use of TikTok through Growth OS is also subject to TikTok’s terms and policies,
          including the{" "}
          <a href="https://www.tiktok.com/legal/terms-of-service">TikTok Terms of Service</a>,{" "}
          <a href="https://www.tiktok.com/community-guidelines">Community Guidelines</a>, and{" "}
          <a href="https://developers.tiktok.com/terms">Developer Terms</a>.
        </li>
        <li>
          You authorise Growth OS to access TikTok data and perform actions only within the OAuth
          scopes you grant (for example <code>user.info.basic</code>,{" "}
          <code>video.publish</code>, and where applicable <code>video.upload</code>).
        </li>
        <li>
          You must select privacy settings and confirm required disclosures (including music /
          commercial content confirmations) before publishing. Growth OS does not silently post
          without your in-product confirmation.
        </li>
        <li>
          Third-party APIs may change, rate-limit, or revoke access. We are not liable for outages,
          policy changes, or enforcement actions by those platforms.
        </li>
        <li>
          You may disconnect TikTok at any time in Connected Accounts and revoke access in
          TikTok’s settings.
        </li>
      </ul>

      <h2>8. Subscriptions and payments</h2>
      <p>
        Some features may require a paid plan. If billing is enabled:
      </p>
      <ul>
        <li>Fees are charged via our payment processor (for example Stripe)</li>
        <li>
          Plans renew until cancelled unless stated otherwise; cancel before the renewal date to
          avoid the next charge
        </li>
        <li>
          Fees are non-refundable except where required by law or expressly stated otherwise
        </li>
        <li>
          We may change pricing with notice for subsequent billing periods
        </li>
      </ul>

      <h2>9. Intellectual property</h2>
      <p>
        Growth OS, including software, branding, documentation, and UI, is owned by us or our
        licensors. Except for the limited licence to use the Service under these Terms, no rights
        are granted. You may not copy, reverse engineer (except where mandatory law permits), or
        resell the Service without our written permission.
      </p>
      <p>
        Feedback you provide may be used freely to improve Growth OS without obligation to you.
      </p>

      <h2>10. Privacy</h2>
      <p>
        Our collection and use of personal data is described in our{" "}
        <a href="/privacy">Privacy Policy</a>. By using the Service, you also acknowledge that
        Policy.
      </p>

      <h2>11. Disclaimers</h2>
      <p>
        TO THE MAXIMUM EXTENT PERMITTED BY LAW, THE SERVICE IS PROVIDED “AS IS” AND “AS
        AVAILABLE” WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS, IMPLIED, OR STATUTORY,
        INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. WE DO
        NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, OR SECURE.
      </p>

      <h2>12. Limitation of liability</h2>
      <p>
        TO THE MAXIMUM EXTENT PERMITTED BY LAW, GROWTH OS AND ITS OPERATORS WILL NOT BE LIABLE
        FOR INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR FOR LOST
        PROFITS, REVENUE, DATA, OR GOODWILL, ARISING FROM YOUR USE OF THE SERVICE OR ANY
        THIRD-PARTY PLATFORM.
      </p>
      <p>
        OUR AGGREGATE LIABILITY ARISING OUT OF OR RELATED TO THE SERVICE IS LIMITED TO THE
        GREATER OF (A) THE FEES YOU PAID US FOR THE SERVICE IN THE TWELVE (12) MONTHS BEFORE THE
        CLAIM, OR (B) ONE HUNDRED POUNDS STERLING (£100) IF YOU HAVE NOT PAID FEES.
      </p>
      <p>
        Nothing in these Terms excludes liability that cannot be excluded under applicable law
        (including for death or personal injury caused by negligence, or fraud).
      </p>

      <h2>13. Indemnity</h2>
      <p>
        You agree to defend, indemnify, and hold harmless Growth OS and its operators from and
        against claims, damages, losses, and expenses (including reasonable legal fees) arising
        from: (a) your User Content; (b) your publishing to TikTok or other platforms; (c) your
        breach of these Terms; or (d) your violation of any law or third-party right.
      </p>

      <h2>14. Suspension and termination</h2>
      <ul>
        <li>You may stop using the Service at any time.</li>
        <li>
          You may request account deletion by contacting{" "}
          <OperatorEmail />.
        </li>
        <li>
          We may suspend or terminate accounts that violate these Terms, create security risk, or
          abuse the Service or connected APIs.
        </li>
        <li>
          Upon termination, your licence to use the Service ends. Provisions that by nature should
          survive (including ownership, disclaimers, limitations, indemnity) will survive.
        </li>
      </ul>

      <h2>15. Changes to the Terms</h2>
      <p>
        We may update these Terms from time to time. The “Last updated” date will change when we
        do. Continued use after an update constitutes acceptance of the revised Terms. If you do
        not agree, stop using the Service and request account deletion.
      </p>

      <h2>16. Governing law</h2>
      <p>
        These Terms are governed by the laws of England and Wales, without regard to conflict of
        law principles. Courts in England and Wales have exclusive jurisdiction, except that if
        you are a consumer in the EEA/UK you may also benefit from mandatory protections of your
        country of residence.
      </p>

      <h2>17. Contact</h2>
      <p>
        Legal: <OperatorEmail />
        <br />
        Privacy: <OperatorEmail />
        <br />
        Support: <OperatorEmail />
        <br />
        Web: <OperatorSite />
      </p>
    </article>
  );
}
