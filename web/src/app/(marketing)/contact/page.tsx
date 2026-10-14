import type { Metadata } from "next";
import { OperatorEmail } from "@/components/marketing/operator-contact";
import { contactEmail } from "@/lib/public-config";

export const metadata: Metadata = {
  title: "Contact · Growth OS",
};

export default function ContactPage() {
  const email = contactEmail();
  return (
    <div className="mx-auto max-w-lg px-4 py-16 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight text-ink">Contact</h1>
      <p className="mt-2 text-sm text-muted">
        Product questions, enterprise interest, or privacy requests — we read every message.
      </p>
      {email ? (
        <form
          className="mt-8 space-y-3"
          action={`mailto:${email}`}
          method="get"
          encType="text/plain"
        >
          <div>
            <label className="text-xs text-muted">Name</label>
            <input
              name="name"
              required
              className="mt-1 h-11 w-full rounded-xl border border-border bg-bg px-3 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-muted">Email</label>
            <input
              type="email"
              name="email"
              required
              className="mt-1 h-11 w-full rounded-xl border border-border bg-bg px-3 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-muted">Message</label>
            <textarea
              name="body"
              required
              rows={5}
              className="mt-1 w-full resize-none rounded-xl border border-border bg-bg px-3 py-2 text-sm"
            />
          </div>
          <button
            type="submit"
            className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-primary text-sm font-medium text-primary-fg"
          >
            Send via email
          </button>
        </form>
      ) : (
        <p className="mt-8 text-sm text-muted">
          Set <code>NEXT_PUBLIC_CONTACT_EMAIL</code> to publish a contact form.
        </p>
      )}
      <p className="mt-4 text-xs text-muted">
        Or email <OperatorEmail /> directly.
      </p>
    </div>
  );
}
