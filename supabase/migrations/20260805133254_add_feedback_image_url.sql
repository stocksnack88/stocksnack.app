-- Feedback image attachments (requested via feedback #3, 2026-08-05).
-- Applied directly against the linked remote DB via `supabase db query --linked`
-- on 2026-08-05; this file documents the change for the repo's migration history.
alter table feedback add column if not exists image_url text;

-- Companion storage bucket "feedback-images" (public, 5MB limit, image/png|jpeg|webp|gif)
-- was created via the Storage API, not SQL -- buckets aren't part of `public` schema DDL.
