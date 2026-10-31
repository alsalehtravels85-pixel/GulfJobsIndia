-- GulfJobsIndia schema reference.
-- The initial tables may already have been created in your Supabase project.
-- Run this file only in the GulfJobsIndia Supabase project.
-- This file does not create public read/write policies. The Worker uses the
-- Supabase service-role key on the server; NEVER put that key in public files.

CREATE TABLE IF NOT EXISTS public.jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  company_name TEXT NOT NULL,
  country TEXT NOT NULL CHECK (country IN ('Saudi Arabia','UAE','Kuwait','Oman','Bahrain')),
  city TEXT, salary TEXT, vacancies INTEGER DEFAULT 1 CHECK (vacancies > 0),
  qualification TEXT, experience TEXT, job_type TEXT DEFAULT 'Full Time',
  description TEXT NOT NULL, eligibility TEXT, benefits TEXT, last_date DATE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  agency_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','blocked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES public.jobs(id) ON DELETE SET NULL,
  agent_id UUID REFERENCES public.agents(id) ON DELETE SET NULL,
  candidate_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT, message TEXT, document_path TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','reviewing','selected','rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;

INSERT INTO storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
VALUES ('gulf-applications','gulf-applications',FALSE,10485760,ARRAY['application/pdf']::TEXT[])
ON CONFLICT (id) DO UPDATE SET public=FALSE,file_size_limit=10485760,allowed_mime_types=ARRAY['application/pdf']::TEXT[];

-- Safe to run after the original schema has already been created.
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS agent_id UUID REFERENCES public.agents(id) ON DELETE SET NULL;
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;

-- Add agent ownership column to existing applications table if it was created earlier.
