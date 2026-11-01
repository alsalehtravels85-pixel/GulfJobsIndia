-- GulfJobsIndia Success Stories migration
-- Run once in Supabase SQL Editor. This does not change jobs Publish/Draft behavior
-- and does not alter the existing applications.agent_id / agents.id data types.

CREATE TABLE IF NOT EXISTS public.success_stories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL UNIQUE
    REFERENCES public.applications(id) ON DELETE CASCADE,
  candidate_name TEXT NOT NULL,
  job_title TEXT NOT NULL,
  country TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'published'
    CHECK (status IN ('draft', 'published')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS success_stories_status_created_idx
  ON public.success_stories(status, created_at DESC);

ALTER TABLE public.success_stories ENABLE ROW LEVEL SECURITY;

-- No public table policy is created: all reads/writes go through the Cloudflare Worker
-- using the server-side Supabase service-role key. Never expose that key in browser code.
