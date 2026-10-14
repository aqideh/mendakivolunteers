-- Public-page SEO overrides are staff-managed and server-read only.
CREATE SCHEMA IF NOT EXISTS content;

CREATE TABLE IF NOT EXISTS content.seo_page_metadata (
  path text PRIMARY KEY CHECK (path IN (
    '/', '/opportunities', '/volunteer/coach', '/volunteer/facilitator',
    '/volunteer/mentor', '/specialist', '/faq', '/news'
  )),
  title text NOT NULL CHECK (char_length(title) BETWEEN 10 AND 80),
  description text NOT NULL CHECK (char_length(description) BETWEEN 30 AND 240),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

ALTER TABLE content.seo_page_metadata ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE content.seo_page_metadata FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE content.seo_page_metadata TO service_role;

COMMENT ON TABLE content.seo_page_metadata IS
  'Public SEO title and description overrides; only the trusted backend service role may read or update.';
