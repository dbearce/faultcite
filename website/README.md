# faultcite.com public website

This directory is the public marketing surface for `https://faultcite.com`.

## Domain boundary

- `faultcite.com` and `www.faultcite.com`: public product/marketing site in this directory.
- `app.faultcite.com`: authenticated FaultCite application. Do not point the public site deployment at the application Worker.
- `staging.faultcite.com`: isolated application staging environment.

## Deployment

Deploy this directory as a static site using a separate Cloudflare Pages/static deployment from the authenticated application Worker. The production app remains governed by `OPERATIONS_RUNBOOK.md` and `PILOT_ACCEPTANCE.md`.

The site deliberately makes no unverified uptime, security-certification, savings, diagnostic-accuracy, or customer-count claims. The pilot CTA uses `support@faultcite.com`, and authenticated users are routed to `https://app.faultcite.com`.

## Acceptance

Before connecting `faultcite.com`:

1. Confirm the static site loads without JavaScript.
2. Test keyboard navigation, visible focus, 200% zoom, reduced motion, iOS Safari and Android Chrome.
3. Verify every `app.faultcite.com` and legal/support link.
4. Confirm `support@faultcite.com` receives pilot inquiries.
5. Verify HTTPS and redirects from `www.faultcite.com` to the chosen canonical host.
6. Keep the application and marketing deployments isolated so a marketing change cannot modify the authenticated Worker.
