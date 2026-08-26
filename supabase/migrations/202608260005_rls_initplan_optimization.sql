-- Wrap auth.uid() in a scalar subquery so Postgres evaluates it once per
-- statement (an InitPlan) instead of once per row. Resolves the
-- auth_rls_initplan advisor warnings on job_deductions and audit_events;
-- profiles, jobs, and shifts already use this form.
--
-- Policy semantics are unchanged — only the auth.uid() call sites differ.

drop policy if exists "users manage own job deductions" on public.job_deductions;

create policy "users manage own job deductions" on public.job_deductions for all
  using (exists (select 1 from public.jobs where jobs.id = job_id and jobs.user_id = (select auth.uid())))
  with check (exists (select 1 from public.jobs where jobs.id = job_id and jobs.user_id = (select auth.uid())));

drop policy if exists "admins read audit log" on public.audit_events;

create policy "admins read audit log" on public.audit_events for select
  using ((select role from public.profiles where id = (select auth.uid())) = 'ADMIN');
