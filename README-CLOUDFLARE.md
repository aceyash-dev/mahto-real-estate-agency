# Mahto Real Estate Agency on Cloudflare Pages + Neon

## Runtime
- Static site hosted on Cloudflare Pages.
- Pages Functions expose `/api/enquiries`, `/api/properties`, `/api/property`, and `/api/admin/properties`.
- PostgreSQL is hosted by Neon. Configure `DATABASE_URL` in Cloudflare Pages production and preview environment variables using the Neon pooled connection string. Never commit it.
- Optional secrets for email: `RESEND_API_KEY` and `ENQUIRY_FROM_EMAIL`; recipient `ENQUIRY_NOTIFICATION_TO` may be set to the agency inbox.
- Secret `ADMIN_API_TOKEN` protects admin listing operations.

## Deploy
Git-connected Pages build settings: build command `npm install`, output directory `.`, root directory `/`. Set `DATABASE_URL` in Cloudflare Pages environment variables to the Neon pooled connection string. For a manual deploy, run `npm install` then `npm run deploy`.

## Admin API
Use `Authorization: Bearer <ADMIN_API_TOKEN>`. Create with POST fields `slug`, `title`, `property_type`, and `listing_source`. New listings remain inactive and unapproved. PATCH with action `approve` explicitly publishes; `pause`, `archive`, and `sold` are supported. Edits automatically unpublish until approved again. DELETE archives. There is not yet a visual admin dashboard.

## Safety
No sample listings are inserted. Public APIs return only active, approved, non-archived properties. Enquiries validate fields and consent and are stored in Neon. Notification delivery requires a Resend key and verified sender.
