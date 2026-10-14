# Supabase auth email templates

Paste into **Supabase Dashboard → Authentication → Email Templates**.

Before pasting, replace `you@example.com` in `confirm-signup.html` with the same address as `NEXT_PUBLIC_CONTACT_EMAIL`.

**Logo:** host your own logo and put its URL in the template. The sample image is a placeholder.

## Critical: do not use {{ .ConfirmationURL }}

That URL uses PKCE and breaks on mobile or a different browser (`PKCE code verifier not found`).

Use **token_hash** links to `/auth/confirm` instead.

## Confirm signup template

Button href (exact):

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email">Confirm Email</a>
```

Full HTML: `confirm-signup.html`

## Redirect URLs (Supabase → Authentication → URL Configuration)

Use your `APP_BASE_URL` (no trailing slash). Add:

- `https://your-domain.example/auth/confirm`
- `https://your-domain.example/auth/confirm/**`
- `https://your-domain.example/auth/callback` (OAuth only)
- `http://localhost:3000/auth/confirm`
- `http://localhost:3000/auth/callback`

**Site URL** must be your public origin. Supabase substitutes it for `{{ .SiteURL }}`.

## After saving the template

1. Deploy the app (it includes the `/auth/confirm` route).
2. Sign up with a new email, or tap Resend (old emails still have the previous link).
3. The confirm link should contain `/auth/confirm?token_hash=` and not `?code=`.
