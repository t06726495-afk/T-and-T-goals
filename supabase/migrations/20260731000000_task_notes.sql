-- mogging: per-task detail notes.
--
-- The AI planner produces more than a title ("Leg day" isn't much use
-- without the actual lifts), so templates and the tasks materialized from
-- them carry an optional notes field. Also useful for manual goals.
-- Run after 20260730000000_notifications.sql.

alter table public.task_templates
  add column if not exists notes text;

alter table public.tasks
  add column if not exists notes text;
