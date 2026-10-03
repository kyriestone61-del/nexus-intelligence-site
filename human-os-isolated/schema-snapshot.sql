SET check_function_bodies = off;
CREATE TABLE public."hlo_asset_cache_v2" ("part_no" integer NOT NULL,
"b64" text NOT NULL,
"sha256" text,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL);
ALTER TABLE public."hlo_asset_cache_v2" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."hlo_skill_scores" ("user_id" uuid NOT NULL,
"skill_key" text NOT NULL,
"track" text NOT NULL,
"score" numeric(5,2) DEFAULT 0 NOT NULL,
"evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
"last_practiced_at" timestamp with time zone,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL);
ALTER TABLE public."hlo_skill_scores" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."hlo_missions" ("id" uuid DEFAULT gen_random_uuid() NOT NULL,
"user_id" uuid NOT NULL,
"template_id" text,
"track" text NOT NULL,
"title" text NOT NULL,
"description" text,
"mission_type" text DEFAULT 'build'::text NOT NULL,
"difficulty" text DEFAULT 'beginner'::text NOT NULL,
"status" text DEFAULT 'queued'::text NOT NULL,
"priority" integer DEFAULT 3 NOT NULL,
"acceptance_criteria" jsonb DEFAULT '[]'::jsonb NOT NULL,
"evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
"reflection" text,
"due_at" timestamp with time zone,
"completed_at" timestamp with time zone,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL);
ALTER TABLE public."hlo_missions" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."hlo_trading_logs" ("id" uuid DEFAULT gen_random_uuid() NOT NULL,
"user_id" uuid NOT NULL,
"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
"instrument" text,
"session" text,
"setup" text,
"regime" text,
"direction" text,
"planned_risk" numeric,
"actual_risk" numeric,
"pnl" numeric,
"rule_adherence" numeric(5,2),
"process_score" numeric(5,2),
"risk_score" numeric(5,2),
"discipline_score" numeric(5,2),
"thesis" text,
"lessons" text,
"tags" text[] DEFAULT '{}'::text[] NOT NULL,
"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL);
ALTER TABLE public."hlo_trading_logs" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."hlo_tutor_threads" ("id" uuid DEFAULT gen_random_uuid() NOT NULL,
"user_id" uuid NOT NULL,
"title" text DEFAULT 'Tutor session'::text NOT NULL,
"track" text,
"lesson_id" text,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL);
ALTER TABLE public."hlo_tutor_threads" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."hlo_tutor_messages" ("id" uuid DEFAULT gen_random_uuid() NOT NULL,
"thread_id" uuid NOT NULL,
"user_id" uuid NOT NULL,
"role" text NOT NULL,
"content" text NOT NULL,
"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL);
ALTER TABLE public."hlo_tutor_messages" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."hlo_certificates" ("id" uuid DEFAULT gen_random_uuid() NOT NULL,
"user_id" uuid NOT NULL,
"certificate_key" text NOT NULL,
"title" text NOT NULL,
"level" text NOT NULL,
"score" numeric(5,2),
"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
"awarded_at" timestamp with time zone DEFAULT now() NOT NULL);
ALTER TABLE public."hlo_certificates" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."hlo_recommendation_snapshots" ("id" uuid DEFAULT gen_random_uuid() NOT NULL,
"user_id" uuid NOT NULL,
"learner_state" jsonb DEFAULT '{}'::jsonb NOT NULL,
"recommendations" jsonb DEFAULT '[]'::jsonb NOT NULL,
"generated_at" timestamp with time zone DEFAULT now() NOT NULL);
ALTER TABLE public."hlo_recommendation_snapshots" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."hlo_mission_templates" ("id" text NOT NULL,
"track" text NOT NULL,
"level" text NOT NULL,
"title" text NOT NULL,
"description" text NOT NULL,
"mission_type" text NOT NULL,
"estimated_minutes" integer DEFAULT 60 NOT NULL,
"skills" text[] DEFAULT '{}'::text[] NOT NULL,
"acceptance_criteria" jsonb DEFAULT '[]'::jsonb NOT NULL,
"active" boolean DEFAULT true NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL);
ALTER TABLE public."hlo_mission_templates" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."hlo_question_bank" ("id" text NOT NULL,
"track" text NOT NULL,
"lesson_id" text,
"difficulty" text NOT NULL,
"question" text NOT NULL,
"choices" jsonb NOT NULL,
"correct_index" integer NOT NULL,
"explanation" text NOT NULL,
"concept_tags" text[] DEFAULT '{}'::text[] NOT NULL,
"active" boolean DEFAULT true NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL);
ALTER TABLE public."hlo_question_bank" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."hlo_research_items" ("id" uuid DEFAULT gen_random_uuid() NOT NULL,
"source_name" text NOT NULL,
"source_url" text NOT NULL,
"title" text NOT NULL,
"summary" text,
"topic" text NOT NULL,
"importance" integer DEFAULT 3 NOT NULL,
"published_at" timestamp with time zone,
"verified" boolean DEFAULT false NOT NULL,
"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL);
ALTER TABLE public."hlo_research_items" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."hlo_profiles" ("user_id" uuid NOT NULL,
"display_name" text,
"goal_statement" text,
"career_target" text,
"experience_level" text DEFAULT 'beginner'::text NOT NULL,
"weekly_learning_hours" integer DEFAULT 5 NOT NULL,
"active_tracks" text[] DEFAULT ARRAY['Core Academy'::text] NOT NULL,
"onboarding_complete" boolean DEFAULT false NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL);
ALTER TABLE public."hlo_profiles" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."hlo_lesson_progress" ("user_id" uuid NOT NULL,
"lesson_id" text NOT NULL,
"status" text DEFAULT 'not_started'::text NOT NULL,
"mastery_score" numeric(5,2) DEFAULT 0 NOT NULL,
"attempts" integer DEFAULT 0 NOT NULL,
"evidence_note" text,
"started_at" timestamp with time zone,
"completed_at" timestamp with time zone,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL);
ALTER TABLE public."hlo_lesson_progress" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."hlo_quiz_attempts" ("id" uuid DEFAULT gen_random_uuid() NOT NULL,
"user_id" uuid NOT NULL,
"quiz_id" text NOT NULL,
"lesson_id" text,
"difficulty" text DEFAULT 'adaptive'::text NOT NULL,
"score" numeric(5,2) NOT NULL,
"answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
"weak_concepts" text[] DEFAULT '{}'::text[] NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL);
ALTER TABLE public."hlo_quiz_attempts" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."hlo_plan_progress" ("user_id" uuid NOT NULL,
"plan_id" text DEFAULT '12-week-ascension'::text NOT NULL,
"item_key" text NOT NULL,
"status" text DEFAULT 'not_started'::text NOT NULL,
"completed_at" timestamp with time zone,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL);
ALTER TABLE public."hlo_plan_progress" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."hlo_frontend_chunks" ("version" text NOT NULL,
"chunk_no" integer NOT NULL,
"content" text NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL);
ALTER TABLE public."hlo_frontend_chunks" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."hlo_asset_cache" ("part_no" integer NOT NULL,
"b64" text NOT NULL,
"sha256" text,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL);
ALTER TABLE public."hlo_asset_cache" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."hlo_analytics_subjects" ("id" uuid DEFAULT gen_random_uuid() NOT NULL,
"user_id" uuid,
"anonymous_id_hash" text,
"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
"identified_at" timestamp with time zone,
"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
"do_not_track" boolean DEFAULT false NOT NULL,
"deletion_requested_at" timestamp with time zone,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL);
ALTER TABLE public."hlo_analytics_subjects" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."hlo_analytics_event_contracts" ("event_name" text NOT NULL,
"trigger_definition" text NOT NULL,
"required_properties" text[] DEFAULT '{}'::text[] NOT NULL,
"primary_use" text NOT NULL,
"schema_version" smallint DEFAULT 1 NOT NULL,
"active" boolean DEFAULT true NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL);
ALTER TABLE public."hlo_analytics_event_contracts" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."hlo_analytics_metric_definitions" ("metric_key" text NOT NULL,
"display_name" text NOT NULL,
"numerator_definition" text,
"denominator_definition" text,
"source_of_truth" text NOT NULL,
"owner_role" text NOT NULL,
"timezone" text DEFAULT 'UTC'::text NOT NULL,
"meaningful_activity_definition" text,
"exclusions" text[] DEFAULT ARRAY['synthetic_qa'::text] NOT NULL,
"version" smallint DEFAULT 1 NOT NULL,
"active" boolean DEFAULT true NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL);
ALTER TABLE public."hlo_analytics_metric_definitions" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."hlo_analytics_identity_links" ("id" uuid DEFAULT gen_random_uuid() NOT NULL,
"subject_id" uuid NOT NULL,
"user_id" uuid NOT NULL,
"link_type" text DEFAULT 'anonymous_to_authenticated'::text NOT NULL,
"effective_at" timestamp with time zone DEFAULT now() NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL);
ALTER TABLE public."hlo_analytics_identity_links" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."hlo_analytics_attribution_touches" ("id" uuid DEFAULT gen_random_uuid() NOT NULL,
"idempotency_key" text NOT NULL,
"subject_id" uuid,
"user_id" uuid,
"session_id" uuid,
"touch_type" text NOT NULL,
"source" text DEFAULT 'direct'::text NOT NULL,
"medium" text,
"campaign" text,
"content_id" text,
"term" text,
"capability_interest" text,
"referrer_domain" text,
"landing_path" text,
"occurred_at" timestamp with time zone NOT NULL,
"is_synthetic" boolean DEFAULT false NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"creative_id" text,
"click_id_hash" text);
ALTER TABLE public."hlo_analytics_attribution_touches" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."hlo_analytics_experiments" ("experiment_id" text NOT NULL,
"name" text NOT NULL,
"problem" text NOT NULL,
"hypothesis" text NOT NULL,
"population_definition" jsonb DEFAULT '{}'::jsonb NOT NULL,
"variants" jsonb NOT NULL,
"primary_metric_key" text,
"guardrail_metric_keys" text[] DEFAULT '{}'::text[] NOT NULL,
"minimum_runtime_days" integer,
"minimum_sample_size" integer,
"status" text DEFAULT 'draft'::text NOT NULL,
"decision" text,
"decision_note" text,
"started_at" timestamp with time zone,
"ended_at" timestamp with time zone,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL);
ALTER TABLE public."hlo_analytics_experiments" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."hlo_analytics_experiment_exposures" ("id" uuid DEFAULT gen_random_uuid() NOT NULL,
"idempotency_key" text NOT NULL,
"experiment_id" text NOT NULL,
"subject_id" uuid,
"user_id" uuid,
"session_id" uuid,
"variant" text NOT NULL,
"assignment_id" uuid NOT NULL,
"product_version" text,
"curriculum_version" text,
"eligibility_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
"exposed_at" timestamp with time zone NOT NULL,
"is_synthetic" boolean DEFAULT false NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL);
ALTER TABLE public."hlo_analytics_experiment_exposures" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."hlo_analytics_ai_usage" ("id" uuid DEFAULT gen_random_uuid() NOT NULL,
"idempotency_key" text NOT NULL,
"interaction_id" uuid NOT NULL,
"subject_id" uuid,
"user_id" uuid,
"session_id" uuid,
"use_case" text NOT NULL,
"provider" text NOT NULL,
"model" text NOT NULL,
"prompt_version" text NOT NULL,
"curriculum_version" text,
"input_tokens" integer DEFAULT 0 NOT NULL,
"cached_input_tokens" integer DEFAULT 0 NOT NULL,
"output_tokens" integer DEFAULT 0 NOT NULL,
"latency_ms" integer,
"cost_microusd" bigint DEFAULT 0 NOT NULL,
"outcome_class" text,
"safety_flag" boolean DEFAULT false NOT NULL,
"escalation_required" boolean DEFAULT false NOT NULL,
"error_code" text,
"occurred_at" timestamp with time zone NOT NULL,
"is_synthetic" boolean DEFAULT false NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL);
ALTER TABLE public."hlo_analytics_ai_usage" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."hlo_analytics_cost_ledger" ("id" uuid DEFAULT gen_random_uuid() NOT NULL,
"idempotency_key" text NOT NULL,
"subject_id" uuid,
"user_id" uuid,
"cost_type" text NOT NULL,
"amount_microusd" bigint NOT NULL,
"reference_type" text,
"reference_id" text,
"source" text,
"occurred_at" timestamp with time zone NOT NULL,
"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
"is_synthetic" boolean DEFAULT false NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL);
ALTER TABLE public."hlo_analytics_cost_ledger" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."hlo_analytics_revenue_ledger" ("id" uuid DEFAULT gen_random_uuid() NOT NULL,
"provider_event_id" text NOT NULL,
"subject_id" uuid,
"user_id" uuid,
"event_type" text NOT NULL,
"plan_code" text,
"billing_interval" text,
"founding_price" boolean DEFAULT false NOT NULL,
"gross_microusd" bigint DEFAULT 0 NOT NULL,
"refund_microusd" bigint DEFAULT 0 NOT NULL,
"currency" text DEFAULT 'USD'::text NOT NULL,
"provider_customer_hash" text,
"provider_subscription_hash" text,
"occurred_at" timestamp with time zone NOT NULL,
"source" text,
"is_synthetic" boolean DEFAULT false NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL);
ALTER TABLE public."hlo_analytics_revenue_ledger" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."hlo_analytics_consents" ("id" uuid DEFAULT gen_random_uuid() NOT NULL,
"subject_id" uuid,
"user_id" uuid,
"analytics_allowed" boolean NOT NULL,
"personalization_allowed" boolean DEFAULT false NOT NULL,
"marketing_allowed" boolean DEFAULT false NOT NULL,
"policy_version" text NOT NULL,
"jurisdiction" text,
"source" text NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL);
ALTER TABLE public."hlo_analytics_consents" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."hlo_analytics_sessions" ("id" uuid NOT NULL,
"subject_id" uuid,
"user_id" uuid,
"started_at" timestamp with time zone NOT NULL,
"last_activity_at" timestamp with time zone NOT NULL,
"ended_at" timestamp with time zone,
"entry_view" text,
"exit_view" text,
"device_type" text,
"platform" text,
"app_version" text,
"is_first_session" boolean DEFAULT false NOT NULL,
"is_synthetic" boolean DEFAULT false NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL);
ALTER TABLE public."hlo_analytics_sessions" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."hlo_analytics_events" ("id" uuid DEFAULT gen_random_uuid() NOT NULL,
"idempotency_key" text NOT NULL,
"event_name" text NOT NULL,
"schema_version" smallint DEFAULT 1 NOT NULL,
"subject_id" uuid,
"user_id" uuid,
"session_id" uuid,
"occurred_at" timestamp with time zone NOT NULL,
"received_at" timestamp with time zone DEFAULT now() NOT NULL,
"source" text,
"medium" text,
"campaign" text,
"content_id" text,
"capability" text,
"object_id" text,
"object_version" text,
"curriculum_version" text,
"baseline_version" text,
"app_version" text,
"device_type" text,
"properties" jsonb DEFAULT '{}'::jsonb NOT NULL,
"consent_basis" text DEFAULT 'explicit_analytics'::text NOT NULL,
"is_synthetic" boolean DEFAULT false NOT NULL,
"qa_run_id" uuid,
"created_at" timestamp with time zone DEFAULT now() NOT NULL);
ALTER TABLE public."hlo_analytics_events" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."hlo_analytics_baseline_results" ("id" uuid DEFAULT gen_random_uuid() NOT NULL,
"idempotency_key" text NOT NULL,
"subject_id" uuid,
"user_id" uuid,
"session_id" uuid,
"baseline_version" text NOT NULL,
"capability" text NOT NULL,
"score_band" text NOT NULL,
"confidence_band" text,
"recommended_path" text NOT NULL,
"completed_at" timestamp with time zone NOT NULL,
"is_synthetic" boolean DEFAULT false NOT NULL,
"qa_run_id" uuid,
"created_at" timestamp with time zone DEFAULT now() NOT NULL);
ALTER TABLE public."hlo_analytics_baseline_results" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."hlo_analytics_learning_state_snapshots" ("id" uuid DEFAULT gen_random_uuid() NOT NULL,
"subject_id" uuid,
"user_id" uuid,
"session_id" uuid,
"objective_id" text,
"capability" text,
"current_learning_object_id" text,
"current_learning_object_version" text,
"curriculum_version" text,
"baseline_version" text,
"recent_practice_outcomes" jsonb DEFAULT '[]'::jsonb NOT NULL,
"mastery_state" jsonb DEFAULT '{}'::jsonb NOT NULL,
"recommended_action" text,
"recommendation_reason" text,
"recommendation_version" text,
"experiment_assignments" jsonb DEFAULT '{}'::jsonb NOT NULL,
"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
"is_synthetic" boolean DEFAULT false NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL);
ALTER TABLE public."hlo_analytics_learning_state_snapshots" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."hlo_owner_users" ("user_id" uuid NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL);
ALTER TABLE public."hlo_owner_users" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."hlo_personalization_intakes" ("id" uuid DEFAULT gen_random_uuid() NOT NULL,
"user_id" uuid NOT NULL,
"version" integer DEFAULT 1 NOT NULL,
"status" text DEFAULT 'draft'::text NOT NULL,
"answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
"profile_summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
"completed_at" timestamp with time zone);
ALTER TABLE public."hlo_personalization_intakes" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."hlo_custom_curricula" ("id" uuid DEFAULT gen_random_uuid() NOT NULL,
"user_id" uuid NOT NULL,
"intake_id" uuid,
"title" text NOT NULL,
"summary" text,
"path_type" text DEFAULT 'personal'::text NOT NULL,
"status" text DEFAULT 'draft'::text NOT NULL,
"generation_mode" text DEFAULT 'rules'::text NOT NULL,
"curriculum" jsonb DEFAULT '{}'::jsonb NOT NULL,
"agent_summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
"version" integer DEFAULT 1 NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
"activated_at" timestamp with time zone);
ALTER TABLE public."hlo_custom_curricula" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."hlo_custom_module_progress" ("user_id" uuid NOT NULL,
"curriculum_id" uuid NOT NULL,
"module_key" text NOT NULL,
"status" text DEFAULT 'not_started'::text NOT NULL,
"mastery_score" numeric DEFAULT 0 NOT NULL,
"evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
"completed_at" timestamp with time zone,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL);
ALTER TABLE public."hlo_custom_module_progress" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."hlo_curriculum_agent_registry" ("agent_code" text NOT NULL,
"title" text NOT NULL,
"mission" text NOT NULL,
"sort_order" integer DEFAULT 0 NOT NULL,
"output_contract" jsonb DEFAULT '{}'::jsonb NOT NULL,
"active" boolean DEFAULT true NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL);
ALTER TABLE public."hlo_curriculum_agent_registry" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."hlo_asset_cache_v3" ("part_no" integer NOT NULL,
"b64" text NOT NULL,
"sha256" text,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL);
ALTER TABLE public."hlo_asset_cache_v3" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."hlo_curriculum_agent_runs" ("id" uuid DEFAULT gen_random_uuid() NOT NULL,
"user_id" uuid NOT NULL,
"intake_id" uuid,
"curriculum_id" uuid,
"agent_code" text NOT NULL,
"status" text DEFAULT 'queued'::text NOT NULL,
"model" text,
"input_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
"output_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
"error" text,
"started_at" timestamp with time zone,
"finished_at" timestamp with time zone,
"created_at" timestamp with time zone DEFAULT now() NOT NULL);
ALTER TABLE public."hlo_curriculum_agent_runs" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."hlo_app_assets_v4" ("name" text NOT NULL,
"content" text NOT NULL,
"content_type" text NOT NULL,
"sha256" text NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL);
ALTER TABLE public."hlo_app_assets_v4" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."hlo_app_assets_backup_20260902" ("name" text NOT NULL,
"content" text NOT NULL,
"content_type" text NOT NULL,
"sha256" text NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL);
ALTER TABLE public."hlo_app_assets_backup_20260902" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."hlo_ai_guide_eval_results" ("id" uuid DEFAULT gen_random_uuid() NOT NULL,
"run_id" uuid NOT NULL,
"case_id" text NOT NULL,
"passed" boolean NOT NULL,
"ratings" jsonb DEFAULT '{}'::jsonb NOT NULL,
"latency_ms" integer,
"cost_microusd" bigint,
"failure_codes" text[] DEFAULT '{}'::text[] NOT NULL,
"evaluator_notes" text,
"created_at" timestamp with time zone DEFAULT now() NOT NULL);
ALTER TABLE public."hlo_ai_guide_eval_results" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."hlo_ai_guide_eval_runs" ("id" uuid DEFAULT gen_random_uuid() NOT NULL,
"suite_version" text NOT NULL,
"product_version" text,
"tutor_version" text,
"model" text,
"prompt_version" text,
"started_at" timestamp with time zone DEFAULT now() NOT NULL,
"completed_at" timestamp with time zone,
"total_cases" integer DEFAULT 0 NOT NULL,
"passed_cases" integer DEFAULT 0 NOT NULL,
"failed_cases" integer DEFAULT 0 NOT NULL,
"critical_failures" integer DEFAULT 0 NOT NULL,
"release_decision" text,
"summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
"is_synthetic" boolean DEFAULT true NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL);
ALTER TABLE public."hlo_ai_guide_eval_runs" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."hlo_ai_guide_eval_cases" ("case_id" text NOT NULL,
"suite_version" text DEFAULT 'ai-guide-v1'::text NOT NULL,
"case_family" text NOT NULL,
"title" text NOT NULL,
"learner_message" text NOT NULL,
"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
"pass_criteria" jsonb NOT NULL,
"severity" text DEFAULT 'standard'::text NOT NULL,
"active" boolean DEFAULT true NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL);
ALTER TABLE public."hlo_ai_guide_eval_cases" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."hlo_lab_drafts" ("id" uuid DEFAULT gen_random_uuid() NOT NULL,
"user_id" uuid NOT NULL,
"lab_key" text NOT NULL,
"title" text NOT NULL,
"content" text DEFAULT ''::text NOT NULL,
"status" text DEFAULT 'draft'::text NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL);
ALTER TABLE public."hlo_lab_drafts" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."hlo_events" ("id" bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL,
"user_id" uuid,
"anonymous_id" text,
"event_name" text NOT NULL,
"view_name" text,
"properties" jsonb DEFAULT '{}'::jsonb NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL);
ALTER TABLE public."hlo_events" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."hlo_lifecycle_interventions" ("id" uuid DEFAULT gen_random_uuid() NOT NULL,
"subject_id" uuid,
"user_id" uuid,
"state_code" text NOT NULL,
"trigger_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
"recommended_action" text NOT NULL,
"message_variant" text,
"status" text DEFAULT 'candidate'::text NOT NULL,
"due_at" timestamp with time zone,
"sent_at" timestamp with time zone,
"acted_at" timestamp with time zone,
"suppression_reason" text,
"is_synthetic" boolean DEFAULT false NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL);
ALTER TABLE public."hlo_lifecycle_interventions" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."hlo_lifecycle_state_definitions" ("state_code" text NOT NULL,
"signal" text NOT NULL,
"likely_friction" text,
"intervention" text NOT NULL,
"cta" text,
"suppression_guardrail" text NOT NULL,
"priority" integer DEFAULT 100 NOT NULL,
"active" boolean DEFAULT true NOT NULL,
"version" text DEFAULT 'lifecycle-v1'::text NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL);
ALTER TABLE public."hlo_lifecycle_state_definitions" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."hlo_live_asset_inspect" ("asset_name" text NOT NULL,
"http_status" integer,
"content" text DEFAULT ''::text NOT NULL,
"sha256" text,
"fetched_at" timestamp with time zone DEFAULT now() NOT NULL);
ALTER TABLE public."hlo_live_asset_inspect" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."hlo_qaqc_runs" ("id" uuid DEFAULT gen_random_uuid() NOT NULL,
"agent_name" text NOT NULL,
"passed" boolean DEFAULT false NOT NULL,
"summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
"checks" jsonb DEFAULT '[]'::jsonb NOT NULL,
"failed_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
"fatal" text,
"created_at" timestamp with time zone DEFAULT now() NOT NULL);
ALTER TABLE public."hlo_qaqc_runs" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."hlo_user_settings" ("user_id" uuid NOT NULL,
"email_learning_reminders" boolean DEFAULT false NOT NULL,
"research_updates" boolean DEFAULT false NOT NULL,
"weekly_digest" boolean DEFAULT false NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL);
ALTER TABLE public."hlo_user_settings" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."hlo_module_notes" ("id" uuid DEFAULT gen_random_uuid() NOT NULL,
"user_id" uuid NOT NULL,
"module_id" text NOT NULL,
"note" text DEFAULT ''::text NOT NULL,
"bookmarked" boolean DEFAULT false NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL);
ALTER TABLE public."hlo_module_notes" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."hlo_saved_sources" ("id" uuid DEFAULT gen_random_uuid() NOT NULL,
"user_id" uuid NOT NULL,
"source_key" text NOT NULL,
"title" text NOT NULL,
"url" text NOT NULL,
"source_name" text,
"topic" text,
"published_at" timestamp with time zone,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"evidence_type" text,
"related_module_ids" text[] DEFAULT '{}'::text[] NOT NULL,
"notes" text DEFAULT ''::text NOT NULL);
ALTER TABLE public."hlo_saved_sources" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."hlo_support_requests" ("id" uuid DEFAULT gen_random_uuid() NOT NULL,
"user_id" uuid NOT NULL,
"email" text NOT NULL,
"subject" text NOT NULL,
"message" text NOT NULL,
"status" text DEFAULT 'open'::text NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL);
ALTER TABLE public."hlo_support_requests" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."hlo_capability_events" ("id" uuid DEFAULT gen_random_uuid() NOT NULL,
"user_id" uuid NOT NULL,
"event_type" text NOT NULL,
"source_id" text,
"dimension" text NOT NULL,
"outcome" numeric,
"delta" numeric,
"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL);
ALTER TABLE public."hlo_capability_events" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."hlo_lab_attempts" ("id" uuid DEFAULT gen_random_uuid() NOT NULL,
"user_id" uuid NOT NULL,
"lab_id" text NOT NULL,
"response" text NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL);
ALTER TABLE public."hlo_lab_attempts" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."hlo_capability_profiles" ("user_id" uuid NOT NULL,
"capability_score" numeric(5,2) DEFAULT 0 NOT NULL,
"knowledge_rating" numeric(5,2) DEFAULT 50 NOT NULL,
"academy_mastery" numeric(5,2) DEFAULT 0 NOT NULL,
"applied_evidence" numeric(5,2) DEFAULT 0 NOT NULL,
"tutor_reasoning" numeric(5,2) DEFAULT 0 NOT NULL,
"tier" smallint DEFAULT 1 NOT NULL,
"confidence" numeric(5,2) DEFAULT 0 NOT NULL,
"placement_completed_at" timestamp with time zone,
"placement_version" text,
"placement_score" numeric(5,2),
"question_count" integer DEFAULT 0 NOT NULL,
"evidence_count" integer DEFAULT 0 NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL);
ALTER TABLE public."hlo_capability_profiles" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."hlo_module_reflections" ("id" uuid DEFAULT gen_random_uuid() NOT NULL,
"user_id" uuid NOT NULL,
"lesson_id" text NOT NULL,
"reflection_type" text DEFAULT 'pre_read'::text NOT NULL,
"content" text NOT NULL,
"completed_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL);
ALTER TABLE public."hlo_module_reflections" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."hlo_frontier_signals" ("id" uuid DEFAULT gen_random_uuid() NOT NULL,
"research_item_id" uuid,
"title" text NOT NULL,
"topic" text DEFAULT 'AI frontier'::text NOT NULL,
"source_name" text,
"source_url" text,
"published_at" timestamp with time zone,
"verified" boolean DEFAULT false NOT NULL,
"importance" integer DEFAULT 3 NOT NULL,
"what_changed" text DEFAULT ''::text NOT NULL,
"why_it_matters" text DEFAULT ''::text NOT NULL,
"becoming_cheaper" text DEFAULT ''::text NOT NULL,
"becoming_scarcer" text DEFAULT ''::text NOT NULL,
"likely_winners" text[] DEFAULT '{}'::text[] NOT NULL,
"likely_losers" text[] DEFAULT '{}'::text[] NOT NULL,
"opportunity_vectors" text[] DEFAULT '{}'::text[] NOT NULL,
"capabilities_to_build" text[] DEFAULT '{}'::text[] NOT NULL,
"action_now" text DEFAULT ''::text NOT NULL,
"horizon" text DEFAULT 'now-next'::text NOT NULL,
"confidence" integer DEFAULT 70 NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
"priority_rationale" text,
"confidence_rationale" text,
"score_version" text,
"scored_at" timestamp with time zone);
ALTER TABLE public."hlo_frontier_signals" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."hlo_opportunities" ("id" uuid DEFAULT gen_random_uuid() NOT NULL,
"user_id" uuid NOT NULL,
"signal_id" uuid,
"title" text NOT NULL,
"implication" text DEFAULT ''::text NOT NULL,
"opportunity" text DEFAULT ''::text NOT NULL,
"capability_needed" text DEFAULT ''::text NOT NULL,
"experiment" text DEFAULT ''::text NOT NULL,
"success_metric" text DEFAULT ''::text NOT NULL,
"evidence" text DEFAULT ''::text NOT NULL,
"asset_path" text DEFAULT ''::text NOT NULL,
"decision" text DEFAULT 'test'::text NOT NULL,
"stage" text DEFAULT 'signal'::text NOT NULL,
"score_value" integer DEFAULT 3 NOT NULL,
"score_fit" integer DEFAULT 3 NOT NULL,
"score_timing" integer DEFAULT 3 NOT NULL,
"score_control" integer DEFAULT 3 NOT NULL,
"score_risk" integer DEFAULT 3 NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL);
ALTER TABLE public."hlo_opportunities" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."hlo_leverage_snapshots" ("id" uuid DEFAULT gen_random_uuid() NOT NULL,
"user_id" uuid NOT NULL,
"domain_expertise" integer NOT NULL,
"judgment_verification" integer NOT NULL,
"systems_automation" integer NOT NULL,
"relationships_distribution" integer NOT NULL,
"owned_ip_data_assets" integer NOT NULL,
"capital_allocation" integer NOT NULL,
"evidence_note" text DEFAULT ''::text NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL);
ALTER TABLE public."hlo_leverage_snapshots" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."hlo_owner_private_content" ("id" uuid DEFAULT gen_random_uuid() NOT NULL,
"track" text NOT NULL,
"title" text NOT NULL,
"summary" text NOT NULL,
"content" jsonb DEFAULT '{}'::jsonb NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL);
ALTER TABLE public."hlo_owner_private_content" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."hlo_owner_empire_capstone" ("owner_user_id" uuid NOT NULL,
"portfolio_thesis" text DEFAULT ''::text NOT NULL,
"nexus_role" text DEFAULT ''::text NOT NULL,
"statecraft_role" text DEFAULT ''::text NOT NULL,
"shared_intelligence" text DEFAULT ''::text NOT NULL,
"operating_firewall" text DEFAULT ''::text NOT NULL,
"distribution_system" text DEFAULT ''::text NOT NULL,
"data_boundaries" text DEFAULT ''::text NOT NULL,
"cash_and_reinvestment" text DEFAULT ''::text NOT NULL,
"ninety_day_priorities" text DEFAULT ''::text NOT NULL,
"one_year_outcomes" text DEFAULT ''::text NOT NULL,
"three_year_outcomes" text DEFAULT ''::text NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL);
ALTER TABLE public."hlo_owner_empire_capstone" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."hlo_privacy_request_receipts" ("receipt_id" uuid DEFAULT gen_random_uuid() NOT NULL,
"request_type" text NOT NULL,
"subject_hash" text NOT NULL,
"status" text NOT NULL,
"policy_version" text NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL);
ALTER TABLE public."hlo_privacy_request_receipts" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."hlo_attention_enrollments" ("user_id" uuid NOT NULL,
"timezone" text NOT NULL,
"start_local_date" date NOT NULL,
"curriculum_version" text DEFAULT 'attention-v1'::text NOT NULL,
"journey_status" text DEFAULT 'active'::text NOT NULL,
"current_day" smallint DEFAULT 1 NOT NULL,
"current_step_key" text DEFAULT 'lesson'::text NOT NULL,
"enrolled_at" timestamp with time zone DEFAULT now() NOT NULL,
"last_resumed_at" timestamp with time zone,
"completed_at" timestamp with time zone,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL);
ALTER TABLE public."hlo_attention_enrollments" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."hlo_attention_day_progress" ("user_id" uuid NOT NULL,
"day_number" smallint NOT NULL,
"module_status" text DEFAULT 'locked'::text NOT NULL,
"step_key" text DEFAULT 'lesson'::text NOT NULL,
"started_at" timestamp with time zone,
"completed_at" timestamp with time zone,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL);
ALTER TABLE public."hlo_attention_day_progress" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."hlo_billing_entitlements" ("user_id" uuid NOT NULL,
"stripe_customer_id" text,
"stripe_subscription_id" text,
"plan_code" text DEFAULT 'free'::text NOT NULL,
"status" text DEFAULT 'free'::text NOT NULL,
"current_period_end" timestamp with time zone,
"grace_ends_at" timestamp with time zone,
"cancel_at_period_end" boolean DEFAULT false NOT NULL,
"source_event_id" text,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL);
ALTER TABLE public."hlo_billing_entitlements" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."hlo_billing_webhook_events" ("stripe_event_id" text NOT NULL,
"event_type" text NOT NULL,
"livemode" boolean NOT NULL,
"payload_sha256" text NOT NULL,
"processing_status" text DEFAULT 'processing'::text NOT NULL,
"error_code" text,
"received_at" timestamp with time zone DEFAULT now() NOT NULL,
"processed_at" timestamp with time zone);
ALTER TABLE public."hlo_billing_webhook_events" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."hlo_billing_dunning_outbox" ("id" uuid DEFAULT gen_random_uuid() NOT NULL,
"user_id" uuid,
"stripe_customer_id" text NOT NULL,
"stripe_invoice_id" text NOT NULL,
"template_key" text DEFAULT 'payment_failed_grace_period'::text NOT NULL,
"grace_ends_at" timestamp with time zone NOT NULL,
"status" text DEFAULT 'queued'::text NOT NULL,
"attempts" integer DEFAULT 0 NOT NULL,
"last_error" text,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"sent_at" timestamp with time zone);
ALTER TABLE public."hlo_billing_dunning_outbox" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."hlo_legal_consents" ("id" uuid DEFAULT gen_random_uuid() NOT NULL,
"user_id" uuid NOT NULL,
"terms_version" text NOT NULL,
"privacy_version" text NOT NULL,
"accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
"source" text DEFAULT 'signup'::text NOT NULL,
"locale" text);
ALTER TABLE public."hlo_legal_consents" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."hlo_attention_curriculum_days" ("day_number" smallint NOT NULL,
"slug" text NOT NULL,
"title" text NOT NULL,
"objective" text NOT NULL,
"practice_minutes" smallint DEFAULT 5 NOT NULL,
"required_tier" text DEFAULT 'free'::text NOT NULL,
"curriculum_version" text DEFAULT 'attention-v1'::text NOT NULL,
"active" boolean DEFAULT true NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL);
ALTER TABLE public."hlo_attention_curriculum_days" ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.hlo_get_question_bank_v2()
 RETURNS TABLE(id text, track text, lesson_id text, difficulty text, question text, choices jsonb, concept_tags text[])
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select q.id,q.track,q.lesson_id,q.difficulty,q.question,q.choices,q.concept_tags
  from public.hlo_question_bank q
  where q.active=true
    and auth.uid() is not null
  order by q.id;
$function$
;
CREATE OR REPLACE FUNCTION public.hlo_begin_placement_v2()
 RETURNS hlo_capability_profiles
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_profile public.hlo_capability_profiles;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;

  insert into public.hlo_capability_profiles(user_id)
  values(v_uid)
  on conflict(user_id) do nothing;

  update public.hlo_capability_profiles
  set knowledge_rating=50,
      question_count=0,
      placement_completed_at=null,
      placement_version='placement-v2-in-progress',
      placement_score=null,
      updated_at=now()
  where user_id=v_uid;

  v_profile := public.hlo_recalculate_capability();
  return v_profile;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.hlo_record_question_answer_v2(p_question_id text, p_selected_index integer, p_session_id text, p_mode text DEFAULT 'adaptive'::text, p_response_ms integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_track text;
  v_diff text;
  v_correct_index integer;
  v_explanation text;
  v_choices jsonb;
  v_tags text[];
  v_anchor numeric;
  v_old numeric;
  v_expected numeric;
  v_k numeric;
  v_new numeric;
  v_delta numeric;
  v_correct boolean;
  v_profile public.hlo_capability_profiles;
  v_existing_outcome numeric;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if p_mode not in ('placement','adaptive') then raise exception 'Invalid assessment mode'; end if;
  if p_session_id is null or length(trim(p_session_id)) < 8 or length(p_session_id) > 160 then
    raise exception 'Invalid session';
  end if;
  if p_response_ms is not null and (p_response_ms < 0 or p_response_ms > 3600000) then
    raise exception 'Invalid response time';
  end if;

  select q.track,q.difficulty,q.correct_index,q.explanation,q.choices,q.concept_tags
    into v_track,v_diff,v_correct_index,v_explanation,v_choices,v_tags
  from public.hlo_question_bank q
  where q.id=p_question_id and q.active=true;

  if v_diff is null then raise exception 'Unknown question'; end if;
  if p_selected_index < 0 or p_selected_index >= jsonb_array_length(v_choices) then
    raise exception 'Invalid answer';
  end if;

  if p_mode='placement' then
    if v_track <> 'Placement v2' or not ('placement_v2'=any(v_tags)) then
      raise exception 'Question is not part of placement v2';
    end if;
  else
    if v_track <> 'Core Academy' then
      raise exception 'Question is not available for adaptive practice';
    end if;
  end if;

  select e.outcome
    into v_existing_outcome
  from public.hlo_capability_events e
  where e.user_id=v_uid
    and e.event_type='question_answer_v2'
    and e.source_id=p_question_id
    and e.metadata->>'session_id'=p_session_id
  limit 1;

  if found then
    select * into v_profile from public.hlo_capability_profiles where user_id=v_uid;
    if p_mode='placement' then
      return jsonb_build_object('profile',to_jsonb(v_profile),'recorded',true,'duplicate',true);
    end if;
    return jsonb_build_object(
      'profile',to_jsonb(v_profile),
      'recorded',true,
      'duplicate',true,
      'correct',(v_existing_outcome=1),
      'correct_index',v_correct_index,
      'explanation',v_explanation
    );
  end if;

  v_anchor := case v_diff
    when 'beginner' then 25
    when 'operator' then 45
    when 'architect' then 65
    when 'owner' then 82
    when 'allocator' then 94
    else 50
  end;

  insert into public.hlo_capability_profiles(user_id)
  values(v_uid)
  on conflict(user_id) do nothing;

  select knowledge_rating into v_old
  from public.hlo_capability_profiles
  where user_id=v_uid
  for update;

  v_correct := p_selected_index=v_correct_index;
  v_expected := 1.0/(1.0+exp((v_anchor-v_old)/10.0));
  v_k := case when p_mode='placement' then 7.0 else 4.0 end;
  v_delta := v_k*((case when v_correct then 1 else 0 end)-v_expected);
  v_new := least(100,greatest(0,v_old+v_delta));

  update public.hlo_capability_profiles
  set knowledge_rating=round(v_new,2),
      question_count=question_count+1,
      updated_at=now()
  where user_id=v_uid;

  insert into public.hlo_capability_events(
    user_id,event_type,source_id,dimension,outcome,delta,metadata
  )
  values(
    v_uid,
    'question_answer_v2',
    p_question_id,
    'knowledge',
    case when v_correct then 1 else 0 end,
    round(v_delta,3),
    jsonb_build_object(
      'difficulty',v_diff,
      'anchor',v_anchor,
      'session_id',p_session_id,
      'mode',p_mode,
      'selected_index',p_selected_index,
      'response_ms',p_response_ms,
      'assessment_version',case when p_mode='placement' then 'placement-v2' else 'adaptive-v2' end
    )
  );

  v_profile := public.hlo_recalculate_capability();

  if p_mode='placement' then
    return jsonb_build_object('profile',to_jsonb(v_profile),'recorded',true);
  end if;

  return jsonb_build_object(
    'profile',to_jsonb(v_profile),
    'recorded',true,
    'correct',v_correct,
    'correct_index',v_correct_index,
    'explanation',v_explanation
  );
end;
$function$
;
CREATE OR REPLACE FUNCTION public.hlo_is_owner()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists(select 1 from public.hlo_owner_users where user_id = auth.uid());
$function$
;
CREATE OR REPLACE FUNCTION public.hlo_sanitize_owner_tracks()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if exists(select 1 from public.hlo_owner_users where user_id=new.user_id) then
    new.active_tracks := array_remove(array_remove(coalesce(new.active_tracks,'{}'::text[]),'Career'),'Trading');
  end if;
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.hlo_tier_from_score(p_score numeric)
 RETURNS smallint
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select case when p_score >= 85 then 5 when p_score >= 70 then 4 when p_score >= 55 then 3 when p_score >= 40 then 2 else 1 end::smallint
$function$
;
CREATE OR REPLACE FUNCTION public.hlo_enforce_personal_track_limit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  personal_count int;
  is_owner boolean;
begin
  select exists(select 1 from public.hlo_owner_users o where o.user_id=new.user_id) into is_owner;
  if is_owner then
    return new;
  end if;
  select count(*) into personal_count
  from unnest(coalesce(new.active_tracks, array[]::text[])) t
  where t not in ('Core Academy','Personal Path');
  if personal_count > 3 then
    raise exception 'Learners may have at most three personal focus tracks';
  end if;
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.hlo_leverage_diagnostic()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  uid uuid := auth.uid();
  latest public.hlo_leverage_snapshots%rowtype;
  prev public.hlo_leverage_snapshots%rowtype;
  has_latest boolean := false;
  has_prev boolean := false;
  avg_score numeric := 0;
  prev_avg numeric := 0;
  floor_score numeric := 0;
  prev_floor numeric := 0;
  leverage_score numeric := 0;
  previous_score numeric := null;
  momentum numeric := null;
  input_avg numeric := 0;
  output_avg numeric := 0;
  conversion_score numeric := 0;
  bottleneck_key text := null;
  bottleneck_label text := null;
  stage_key text := null;
  stage_label text := null;
  stage_explanation text := null;
  v_capability_score numeric := 0;
  capability_conf numeric := 0;
  mastery_count integer := 0;
  quiz_count integer := 0;
  avg_quiz numeric := 0;
  lab_count integer := 0;
  completed_missions integer := 0;
  active_missions integer := 0;
  opportunity_count integer := 0;
  mature_opportunities integer := 0;
  allocation_decisions integer := 0;
  evidence_note_bonus integer := 0;
  domain_conf integer := 0;
  judgment_conf integer := 0;
  systems_conf integer := 0;
  distribution_conf integer := 0;
  assets_conf integer := 0;
  capital_conf integer := 0;
  evidence_confidence integer := 0;
  actions jsonb := '[]'::jsonb;
  trend jsonb := '[]'::jsonb;
  top_opp record;
  primary_action jsonb;
  secondary_action jsonb;
  tertiary_action jsonb;
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;

  select * into latest from public.hlo_leverage_snapshots s where s.user_id=uid order by s.created_at desc limit 1;
  has_latest := found;
  if not has_latest then
    return jsonb_build_object('has_snapshot',false,'purpose','Establish a baseline so Human OS can identify your leverage constraint, track momentum, and turn the diagnosis into a concrete next action.','actions',jsonb_build_array(jsonb_build_object('title','Create your baseline','reason','The system needs one evidence-backed starting point before it can detect change.','action','Rate each leverage dimension using the anchors and add one evidence note.','view','leverage')));
  end if;

  select * into prev from public.hlo_leverage_snapshots s where s.user_id=uid and s.id<>latest.id order by s.created_at desc limit 1;
  has_prev := found;

  avg_score := (latest.domain_expertise + latest.judgment_verification + latest.systems_automation + latest.relationships_distribution + latest.owned_ip_data_assets + latest.capital_allocation)::numeric/6;
  floor_score := least(latest.domain_expertise,latest.judgment_verification,latest.systems_automation,latest.relationships_distribution,latest.owned_ip_data_assets,latest.capital_allocation);
  leverage_score := round(avg_score*0.75 + floor_score*0.25);
  input_avg := (latest.domain_expertise+latest.judgment_verification)::numeric/2;
  output_avg := (latest.systems_automation+latest.relationships_distribution+latest.owned_ip_data_assets)::numeric/3;
  conversion_score := case when input_avg<=0 then 0 else least(100,round(output_avg/input_avg*100)) end;

  if has_prev then
    prev_avg := (prev.domain_expertise+prev.judgment_verification+prev.systems_automation+prev.relationships_distribution+prev.owned_ip_data_assets+prev.capital_allocation)::numeric/6;
    prev_floor := least(prev.domain_expertise,prev.judgment_verification,prev.systems_automation,prev.relationships_distribution,prev.owned_ip_data_assets,prev.capital_allocation);
    previous_score := round(prev_avg*0.75 + prev_floor*0.25);
    momentum := leverage_score-previous_score;
  end if;

  if floor_score=latest.domain_expertise then bottleneck_key:='domain_expertise';bottleneck_label:='Domain expertise';
  elsif floor_score=latest.judgment_verification then bottleneck_key:='judgment_verification';bottleneck_label:='Judgment & verification';
  elsif floor_score=latest.systems_automation then bottleneck_key:='systems_automation';bottleneck_label:='Systems & automation';
  elsif floor_score=latest.relationships_distribution then bottleneck_key:='relationships_distribution';bottleneck_label:='Relationships & distribution';
  elsif floor_score=latest.owned_ip_data_assets then bottleneck_key:='owned_ip_data_assets';bottleneck_label:='Owned IP / data / assets';
  else bottleneck_key:='capital_allocation';bottleneck_label:='Capital allocation'; end if;

  if ((latest.domain_expertise+latest.judgment_verification)::numeric/2)<40 then stage_key:='foundation';stage_label:='Foundation';stage_explanation:='Your highest return is still building durable expertise and judgment before adding more complexity.';
  elsif latest.systems_automation<45 then stage_key:='augmented_expert';stage_label:='AI-Augmented Expert';stage_explanation:='You know enough to benefit from AI, but your knowledge is not yet consistently encoded into repeatable systems.';
  elsif latest.relationships_distribution<45 and latest.owned_ip_data_assets<45 then stage_key:='system_designer';stage_label:='System Designer';stage_explanation:='You can build systems; the next constraint is turning them into reach, reusable assets, or repeatable external value.';
  elsif latest.owned_ip_data_assets<55 or latest.relationships_distribution<50 then stage_key:='operator';stage_label:='Operator';stage_explanation:='You are creating repeatable value, but ownership and distribution are not yet strong enough to compound independently of your labor.';
  elsif latest.capital_allocation<55 then stage_key:='owner';stage_label:='Owner';stage_explanation:='You have meaningful owned leverage. The next frontier is disciplined allocation of time, money, attention, and systems toward the highest-return assets.';
  else stage_key:='allocator';stage_label:='Allocator';stage_explanation:='Your leverage is increasingly driven by owned systems, distribution, assets, and allocation rather than raw effort.'; end if;

  select coalesce(cp.capability_score,0),coalesce(cp.confidence,0) into v_capability_score,capability_conf from public.hlo_capability_profiles cp where cp.user_id=uid;
  if not found then v_capability_score:=0; capability_conf:=0; end if;
  select count(*) into mastery_count from public.hlo_lesson_progress lp where lp.user_id=uid and (lp.status='mastered' or lp.mastery_score>=75);
  select count(*),coalesce(avg(q.score),0) into quiz_count,avg_quiz from (select qa.score from public.hlo_quiz_attempts qa where qa.user_id=uid order by qa.created_at desc limit 10) q;
  select count(distinct la.lab_id) into lab_count from public.hlo_lab_attempts la where la.user_id=uid;
  select count(*) filter(where m.status='completed'),count(*) filter(where m.status in('active','in_progress')) into completed_missions,active_missions from public.hlo_missions m where m.user_id=uid;
  select count(*),count(*) filter(where o.stage in('experiment','evidence','asset','decision')),count(*) filter(where o.decision in('scale','hold','kill')) into opportunity_count,mature_opportunities,allocation_decisions from public.hlo_opportunities o where o.user_id=uid;
  evidence_note_bonus := case when length(trim(coalesce(latest.evidence_note,'')))>=120 then 25 when length(trim(coalesce(latest.evidence_note,'')))>=50 then 15 when length(trim(coalesce(latest.evidence_note,'')))>=15 then 8 else 0 end;

  domain_conf:=least(100,round(20+capability_conf*0.35+least(mastery_count,8)*6+evidence_note_bonus*0.4));
  judgment_conf:=least(100,round(15+capability_conf*0.30+least(quiz_count,8)*6+least(avg_quiz,100)*0.15+evidence_note_bonus*0.3));
  systems_conf:=least(100,round(10+least(lab_count,4)*15+least(completed_missions,5)*7+least(mature_opportunities,4)*6+evidence_note_bonus*0.3));
  distribution_conf:=least(100,round(10+least(completed_missions,5)*5+evidence_note_bonus*1.2));
  assets_conf:=least(100,round(10+least(completed_missions,5)*7+least(mature_opportunities,5)*9+evidence_note_bonus*0.8));
  capital_conf:=least(100,round(5+least(allocation_decisions,4)*15+evidence_note_bonus*1.1));
  evidence_confidence:=round((domain_conf+judgment_conf+systems_conf+distribution_conf+assets_conf+capital_conf)::numeric/6);

  case bottleneck_key
    when 'domain_expertise' then primary_action:=jsonb_build_object('dimension',bottleneck_key,'title','Deepen one domain, not five','reason','Your expertise floor is limiting the value of every downstream system.','action','Complete the next Core lesson that serves your primary path, then write one concrete application to your real work.','success_metric','One completed lesson plus one real-world application you can explain without notes.','view','academy');
    when 'judgment_verification' then primary_action:=jsonb_build_object('dimension',bottleneck_key,'title','Strengthen verification under pressure','reason','More AI output only creates leverage if you can reliably judge what deserves trust.','action','Complete the Verification Drill and document the evidence chain you used.','success_metric','One verified claim with primary-source support and a written decision rule.','view','labs');
    when 'systems_automation' then primary_action:=jsonb_build_object('dimension',bottleneck_key,'title','Turn one repeated task into a system','reason','Your leverage is still too dependent on doing the work manually.','action','Choose one repeated task and map trigger → inputs → deterministic steps → AI steps → human approval → output.','success_metric','One repeatable workflow another person could follow or operate.','view','labs');
    when 'relationships_distribution' then primary_action:=jsonb_build_object('dimension',bottleneck_key,'title','Build a distribution loop','reason','Capability compounds slowly when useful work has no reliable path to people who value it.','action','Publish or share one useful artifact with a defined audience and collect at least five real reactions or conversations.','success_metric','One artifact distributed plus five pieces of audience/customer feedback.','view','missions');
    when 'owned_ip_data_assets' then primary_action:=jsonb_build_object('dimension',bottleneck_key,'title','Convert repeated work into an owned asset','reason','You are producing value, but too little of it continues working after the task is finished.','action','Choose one repeated output and convert it into a reusable template, dataset, workflow, product, playbook, or piece of IP.','success_metric','One reusable asset that can be used again without starting from zero.','view','missions');
    else primary_action:=jsonb_build_object('dimension',bottleneck_key,'title','Create an allocation rule','reason','Leverage compounds when scarce time, money, attention, and system capacity are deliberately redirected toward the highest-return assets.','action','Define one explicit rule for what you will scale, hold, stop, or fund based on evidence.','success_metric','One written allocation rule used on a real decision.','view','opportunities'); end case;
  actions:=actions||jsonb_build_array(primary_action);

  if conversion_score<55 and bottleneck_key not in('systems_automation','relationships_distribution','owned_ip_data_assets') then actions:=actions||jsonb_build_array(jsonb_build_object('dimension','conversion','title','Convert knowledge into leverage','reason','Your knowledge base is stronger than the systems, reach, and owned outputs it is producing.','action','Take one thing you already know and turn it into a repeatable workflow, reusable artifact, or distributed output this week.','success_metric','One existing capability becomes something repeatable, reusable, or externally valuable.','view','missions')); end if;

  select o.id,o.title,o.stage,o.decision,(o.score_value+o.score_fit+o.score_timing+o.score_control-o.score_risk) priority into top_opp from public.hlo_opportunities o where o.user_id=uid and coalesce(o.decision,'undecided')<>'kill' order by (o.score_value+o.score_fit+o.score_timing+o.score_control-o.score_risk) desc,o.updated_at desc limit 1;
  if found and jsonb_array_length(actions)<3 then actions:=actions||jsonb_build_array(jsonb_build_object('dimension','opportunity','title','Advance your best live opportunity','reason',format('%s is currently your highest-scoring active opportunity thesis.',top_opp.title),'action','Move it one stage forward only by adding the evidence required for the next decision.','success_metric','The opportunity advances one stage with new evidence, or you explicitly hold/kill it.','view','opportunities','opportunity_id',top_opp.id)); end if;
  if evidence_confidence<45 and jsonb_array_length(actions)<3 then actions:=actions||jsonb_build_array(jsonb_build_object('dimension','evidence','title','Improve the evidence behind your scores','reason','Several leverage dimensions are still based more on self-rating than observable output.','action','Complete one lab or mission and describe the artifact/result in your next snapshot.','success_metric','At least one new completed artifact or measured result is attached to the next leverage update.','view','labs')); end if;

  select coalesce(jsonb_agg(t order by (t->>'created_at')::timestamptz),'[]'::jsonb) into trend from (select jsonb_build_object('id',s.id,'created_at',s.created_at,'score',round((((s.domain_expertise+s.judgment_verification+s.systems_automation+s.relationships_distribution+s.owned_ip_data_assets+s.capital_allocation)::numeric/6)*0.75)+least(s.domain_expertise,s.judgment_verification,s.systems_automation,s.relationships_distribution,s.owned_ip_data_assets,s.capital_allocation)*0.25),'domain_expertise',s.domain_expertise,'judgment_verification',s.judgment_verification,'systems_automation',s.systems_automation,'relationships_distribution',s.relationships_distribution,'owned_ip_data_assets',s.owned_ip_data_assets,'capital_allocation',s.capital_allocation) t from public.hlo_leverage_snapshots s where s.user_id=uid order by s.created_at desc limit 12) z;

  return jsonb_build_object('has_snapshot',true,'score',leverage_score,'previous_score',previous_score,'momentum',momentum,'bottleneck',jsonb_build_object('key',bottleneck_key,'label',bottleneck_label,'score',floor_score,'gap_to_average',round(avg_score-floor_score)),'stage',jsonb_build_object('key',stage_key,'label',stage_label,'explanation',stage_explanation),'conversion_score',conversion_score,'evidence_confidence',evidence_confidence,'dimensions',jsonb_build_object('domain_expertise',jsonb_build_object('label','Domain expertise','score',latest.domain_expertise,'confidence',domain_conf),'judgment_verification',jsonb_build_object('label','Judgment & verification','score',latest.judgment_verification,'confidence',judgment_conf),'systems_automation',jsonb_build_object('label','Systems & automation','score',latest.systems_automation,'confidence',systems_conf),'relationships_distribution',jsonb_build_object('label','Relationships & distribution','score',latest.relationships_distribution,'confidence',distribution_conf),'owned_ip_data_assets',jsonb_build_object('label','Owned IP / data / assets','score',latest.owned_ip_data_assets,'confidence',assets_conf),'capital_allocation',jsonb_build_object('label','Capital allocation','score',latest.capital_allocation,'confidence',capital_conf)),'observed_evidence',jsonb_build_object('capability_score',v_capability_score,'mastered_modules',mastery_count,'recent_quiz_average',round(avg_quiz),'unique_labs',lab_count,'completed_missions',completed_missions,'active_missions',active_missions,'opportunities',opportunity_count,'mature_opportunities',mature_opportunities,'allocation_decisions',allocation_decisions),'actions',actions,'trend',trend,'latest_snapshot',to_jsonb(latest),'purpose','Use this as a constraint detector: identify the weakest leverage dimension, measure whether knowledge is converting into systems/distribution/assets, and turn the diagnosis into one concrete next move.');
end;
$function$
;
CREATE OR REPLACE FUNCTION public.hlo_analytics_validate_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  required_key text;
  forbidden_keys constant text[] := array['email','phone','full_name','name','prompt','response','message','content','ip','ip_address','user_agent'];
begin
  if pg_column_size(new.properties) > 8192 then
    raise exception 'Analytics properties exceed 8KB limit';
  end if;
  if new.properties ?| forbidden_keys then
    raise exception 'Analytics properties may not contain direct identifiers or raw content';
  end if;
  if coalesce((select auth.jwt()->>'role'),'') = 'authenticated'
     and (new.occurred_at < now()-interval '24 hours' or new.occurred_at > now()+interval '5 minutes') then
    raise exception 'Client event timestamp is outside the accepted window';
  end if;
  for required_key in
    select unnest(c.required_properties)
    from public.hlo_analytics_event_contracts c
    where c.event_name = new.event_name and c.active
  loop
    if not (new.properties ? required_key) then
      raise exception 'Missing required property % for event %', required_key, new.event_name;
    end if;
  end loop;
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.hlo_analytics_exposure_immutable()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  raise exception 'Experiment exposure records are immutable';
end;
$function$
;
CREATE OR REPLACE FUNCTION public.hlo_recalculate_capability()
 RETURNS hlo_capability_profiles
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_profile public.hlo_capability_profiles;
  v_academy numeric := 0;
  v_applied numeric := 0;
  v_tutor numeric := 0;
  v_score numeric := 0;
  v_weight numeric := 0;
  v_sum numeric := 0;
  v_lesson_count int := 0;
  v_mission_count int := 0;
  v_lab_count int := 0;
  v_tutor_count int := 0;
  v_conf numeric := 0;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  insert into public.hlo_capability_profiles(user_id) values (v_uid) on conflict (user_id) do nothing;
  select * into v_profile from public.hlo_capability_profiles where user_id=v_uid;

  select count(*), coalesce(sum(case
      when status='mastered' or coalesce(mastery_score,0)>=75 then greatest(coalesce(mastery_score,75),75)
      when status='completed' then greatest(coalesce(mastery_score,0),55)
      else least(greatest(coalesce(mastery_score,0),0),50)
    end),0) / 13.0
  into v_lesson_count, v_academy
  from public.hlo_lesson_progress where user_id=v_uid and lesson_id ~ '^M(0[1-9]|1[0-3])$';
  v_academy := least(100,greatest(0,v_academy));

  select count(*) into v_mission_count from public.hlo_missions where user_id=v_uid and status='completed';
  select count(distinct lab_id) into v_lab_count from public.hlo_lab_attempts where user_id=v_uid;
  v_applied := least(100, v_mission_count*18 + v_lab_count*12);

  select count(*) into v_tutor_count from public.hlo_tutor_messages where user_id=v_uid and role='user' and length(trim(content))>=80;
  v_tutor := least(100, v_tutor_count*7);

  if v_profile.placement_completed_at is not null or v_profile.question_count>0 then
    v_sum := v_sum + v_profile.knowledge_rating*55; v_weight := v_weight+55;
  end if;
  if v_lesson_count>0 then v_sum := v_sum + v_academy*25; v_weight := v_weight+25; end if;
  if v_mission_count+v_lab_count>0 then v_sum := v_sum + v_applied*12; v_weight := v_weight+12; end if;
  if v_tutor_count>0 then v_sum := v_sum + v_tutor*8; v_weight := v_weight+8; end if;
  v_score := case when v_weight>0 then v_sum/v_weight else 0 end;

  v_conf := least(99,
    (case when v_profile.placement_completed_at is not null then 45 else 0 end)
    + least(25,v_profile.question_count*0.8)
    + least(15,v_lesson_count*1.5)
    + least(10,(v_mission_count+v_lab_count)*2)
    + least(5,v_tutor_count*0.5));

  update public.hlo_capability_profiles set
    capability_score=round(v_score,2), academy_mastery=round(v_academy,2), applied_evidence=round(v_applied,2), tutor_reasoning=round(v_tutor,2),
    tier=public.hlo_tier_from_score(v_score), confidence=round(v_conf,2), evidence_count=v_profile.question_count+v_lesson_count+v_mission_count+v_lab_count+v_tutor_count, updated_at=now()
  where user_id=v_uid returning * into v_profile;
  return v_profile;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.hlo_is_plus_member(p_user_id uuid DEFAULT auth.uid())
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
begin
  if auth.role() <> 'service_role' and p_user_id is distinct from auth.uid() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  return exists (select 1 from public.hlo_owner_users o where o.user_id = p_user_id)
    or exists (
      select 1
      from public.hlo_billing_entitlements e
      where e.user_id = p_user_id
        and e.plan_code = 'plus'
        and e.status in ('active', 'canceling', 'grace_period')
        and (e.current_period_end is null or e.current_period_end > now())
        and (e.status <> 'grace_period' or e.grace_ends_at > now())
    );
end;
$function$
;
CREATE OR REPLACE FUNCTION public.hlo_attention_enroll(p_timezone text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_tz text := nullif(trim(p_timezone),'');
begin
  if v_uid is null then raise exception 'authentication_required' using errcode='28000'; end if;
  if v_tz is null or not exists (select 1 from pg_catalog.pg_timezone_names where name=v_tz) then
    raise exception 'invalid_timezone' using errcode='22023';
  end if;
  insert into public.hlo_attention_enrollments(user_id,timezone,start_local_date)
  values(v_uid,v_tz,(now() at time zone v_tz)::date)
  on conflict(user_id) do update set timezone=excluded.timezone, updated_at=now();
  insert into public.hlo_attention_day_progress(user_id,day_number,module_status,step_key,started_at)
  select v_uid,d.day_number,case when d.day_number=1 then 'in_progress' else 'locked' end,'lesson',
         case when d.day_number=1 then now() else null end
  from public.hlo_attention_curriculum_days d where d.active
  on conflict(user_id,day_number) do nothing;
  return public.hlo_attention_get_journey(v_tz);
end;
$function$
;
CREATE OR REPLACE FUNCTION public.hlo_attention_get_journey(p_timezone text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_e public.hlo_attention_enrollments%rowtype;
  v_tz text;
  v_local_date date;
  v_resume_day smallint;
  v_result jsonb;
begin
  if v_uid is null then raise exception 'authentication_required' using errcode='28000'; end if;
  select * into v_e from public.hlo_attention_enrollments where user_id=v_uid;
  if not found then return jsonb_build_object('enrolled',false); end if;
  v_tz := coalesce(nullif(trim(p_timezone),''),v_e.timezone);
  if not exists(select 1 from pg_catalog.pg_timezone_names where name=v_tz) then v_tz:=v_e.timezone; end if;
  v_local_date := (now() at time zone v_tz)::date;

  select coalesce(min(d.day_number) filter (where p.module_status <> 'completed'),7)
    into v_resume_day
  from public.hlo_attention_curriculum_days d
  join public.hlo_attention_day_progress p on p.day_number=d.day_number and p.user_id=v_uid;

  update public.hlo_attention_enrollments
    set last_resumed_at=now(), current_day=v_resume_day, updated_at=now()
  where user_id=v_uid;

  select jsonb_build_object(
    'enrolled',true,
    'timezone',v_tz,
    'start_local_date',v_e.start_local_date,
    'journey_status',v_e.journey_status,
    'resume',jsonb_build_object('day',v_resume_day,'step',coalesce((select step_key from public.hlo_attention_day_progress where user_id=v_uid and day_number=v_resume_day),'lesson')),
    'is_plus_member',public.hlo_is_plus_member(v_uid),
    'days',coalesce(jsonb_agg(jsonb_build_object(
      'day',d.day_number,'slug',d.slug,'title',d.title,'objective',d.objective,
      'practice_minutes',d.practice_minutes,'required_tier',d.required_tier,
      'status',case
        when p.module_status='completed' then 'completed'
        when d.day_number=1 then p.module_status
        when exists(select 1 from public.hlo_attention_day_progress prior where prior.user_id=v_uid and prior.day_number=d.day_number-1 and prior.module_status='completed')
          and v_local_date >= v_e.start_local_date+(d.day_number-1)
          and (d.required_tier='free' or public.hlo_is_plus_member(v_uid))
          then case when p.module_status='locked' then 'in_progress' else p.module_status end
        else 'locked' end,
      'time_gate_opens_on',v_e.start_local_date+(d.day_number-1),
      'time_gate_open',v_local_date >= v_e.start_local_date+(d.day_number-1),
      'entitled',d.required_tier='free' or public.hlo_is_plus_member(v_uid),
      'step',p.step_key,'completed_at',p.completed_at
    ) order by d.day_number),'[]'::jsonb)
  ) into v_result
  from public.hlo_attention_curriculum_days d
  join public.hlo_attention_day_progress p on p.day_number=d.day_number and p.user_id=v_uid
  where d.active;
  return v_result;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.hlo_attention_set_step(p_day smallint, p_step text, p_timezone text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_uid uuid:=auth.uid(); v_journey jsonb; v_day jsonb;
begin
  if v_uid is null then raise exception 'authentication_required' using errcode='28000'; end if;
  if p_step not in ('lesson','practice','reflection','complete') then raise exception 'invalid_step' using errcode='22023'; end if;
  v_journey:=public.hlo_attention_get_journey(p_timezone);
  select value into v_day from jsonb_array_elements(v_journey->'days') where (value->>'day')::smallint=p_day;
  if v_day is null or v_day->>'status'='locked' then raise exception 'day_locked' using errcode='42501'; end if;
  update public.hlo_attention_day_progress set module_status='in_progress',step_key=p_step,
    started_at=coalesce(started_at,now()),updated_at=now() where user_id=v_uid and day_number=p_day;
  update public.hlo_attention_enrollments set current_day=p_day,current_step_key=p_step,updated_at=now() where user_id=v_uid;
  return public.hlo_attention_get_journey(p_timezone);
end;
$function$
;
CREATE OR REPLACE FUNCTION public.hlo_attention_complete_day(p_day smallint, p_timezone text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_uid uuid:=auth.uid(); v_journey jsonb; v_day jsonb;
begin
  if v_uid is null then raise exception 'authentication_required' using errcode='28000'; end if;
  if p_day not between 1 and 7 then raise exception 'invalid_day' using errcode='22023'; end if;
  v_journey:=public.hlo_attention_get_journey(p_timezone);
  select value into v_day from jsonb_array_elements(v_journey->'days') where (value->>'day')::smallint=p_day;
  if v_day is null or v_day->>'status'='locked' then raise exception 'day_locked' using errcode='42501'; end if;
  update public.hlo_attention_day_progress set module_status='completed',step_key='complete',
    started_at=coalesce(started_at,now()),completed_at=coalesce(completed_at,now()),updated_at=now()
  where user_id=v_uid and day_number=p_day;
  update public.hlo_attention_enrollments set current_day=least(7,p_day+1),current_step_key='lesson',
    journey_status=case when p_day=7 then 'completed' else journey_status end,
    completed_at=case when p_day=7 then coalesce(completed_at,now()) else completed_at end,updated_at=now()
  where user_id=v_uid;
  return public.hlo_attention_get_journey(p_timezone);
end;
$function$
;
CREATE OR REPLACE FUNCTION public.hlo_record_legal_consent(p_terms_version text, p_privacy_version text, p_source text DEFAULT 'signup'::text, p_locale text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_uid uuid:=auth.uid(); v_id uuid;
begin
  if v_uid is null then raise exception 'authentication_required' using errcode='28000'; end if;
  if length(trim(p_terms_version))<1 or length(trim(p_privacy_version))<1 then raise exception 'policy_version_required' using errcode='22023'; end if;
  insert into public.hlo_legal_consents(user_id,terms_version,privacy_version,source,locale)
  values(v_uid,left(trim(p_terms_version),64),left(trim(p_privacy_version),64),left(coalesce(nullif(trim(p_source),''),'signup'),32),left(p_locale,16))
  on conflict(user_id,terms_version,privacy_version) do update set source=excluded.source
  returning id into v_id;
  return v_id;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.hlo_finalize_placement_v2(p_session_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_count integer;
  v_correct integer;
  v_profile public.hlo_capability_profiles;
  v_domain_summary jsonb := '{}'::jsonb;
  v_rating numeric := 50;
  v_anchor numeric;
  v_expected numeric;
  v_delta numeric;
  r record;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;

  select count(*),coalesce(sum(e.outcome),0)::integer
    into v_count,v_correct
  from public.hlo_capability_events e
  join public.hlo_question_bank q on q.id=e.source_id
  where e.user_id=v_uid
    and e.event_type='question_answer_v2'
    and e.metadata->>'session_id'=p_session_id
    and e.metadata->>'mode'='placement'
    and q.track='Placement v2'
    and 'placement_v2'=any(q.concept_tags);

  if v_count <> 30 then
    raise exception 'Placement v2 requires exactly 30 answered questions';
  end if;

  for r in
    select e.outcome,e.metadata->>'difficulty' as difficulty
    from public.hlo_capability_events e
    join public.hlo_question_bank q on q.id=e.source_id
    where e.user_id=v_uid
      and e.event_type='question_answer_v2'
      and e.metadata->>'session_id'=p_session_id
      and e.metadata->>'mode'='placement'
      and q.track='Placement v2'
      and 'placement_v2'=any(q.concept_tags)
    order by e.created_at,e.id
  loop
    v_anchor := case r.difficulty
      when 'beginner' then 25
      when 'operator' then 45
      when 'architect' then 65
      when 'owner' then 82
      when 'allocator' then 94
      else 50
    end;
    v_expected := 1.0/(1.0+exp((v_anchor-v_rating)/10.0));
    v_delta := 7.0*(r.outcome-v_expected);
    v_rating := least(100,greatest(0,v_rating+v_delta));
  end loop;

  select coalesce(
    jsonb_object_agg(
      s.domain,
      jsonb_build_object(
        'answered',s.answered,
        'correct',s.correct,
        'pct',s.pct
      )
    ),
    '{}'::jsonb
  )
  into v_domain_summary
  from (
    select d.domain,
           count(*)::integer as answered,
           coalesce(sum(e.outcome),0)::integer as correct,
           round(100*avg(e.outcome),0)::integer as pct
    from public.hlo_capability_events e
    join public.hlo_question_bank q on q.id=e.source_id
    cross join lateral (
      select tag as domain
      from unnest(q.concept_tags) as tag
      where tag like 'domain\_%' escape '\'
      limit 1
    ) d
    where e.user_id=v_uid
      and e.event_type='question_answer_v2'
      and e.metadata->>'session_id'=p_session_id
      and e.metadata->>'mode'='placement'
      and q.track='Placement v2'
    group by d.domain
  ) s;

  update public.hlo_capability_profiles
  set knowledge_rating=round(v_rating,2),
      question_count=30,
      placement_completed_at=now(),
      placement_version='placement-v2',
      placement_score=round(v_rating,2),
      updated_at=now()
  where user_id=v_uid;

  if not exists (
    select 1 from public.hlo_capability_events
    where user_id=v_uid
      and event_type='placement_complete_v2'
      and source_id=p_session_id
  ) then
    insert into public.hlo_capability_events(
      user_id,event_type,source_id,dimension,outcome,metadata
    )
    values(
      v_uid,
      'placement_complete_v2',
      p_session_id,
      'overall',
      null,
      jsonb_build_object(
        'question_count',v_count,
        'raw_correct',v_correct,
        'difficulty_adjusted_rating',round(v_rating,2),
        'version','placement-v2',
        'domain_summary',v_domain_summary
      )
    );
  end if;

  v_profile := public.hlo_recalculate_capability();

  return jsonb_build_object(
    'profile',to_jsonb(v_profile),
    'question_count',v_count,
    'raw_correct',v_correct,
    'domain_summary',v_domain_summary,
    'version','placement-v2'
  );
end;
$function$
;
CREATE OR REPLACE FUNCTION public.hlo_record_question_result(p_question_id text, p_correct boolean, p_session_id text, p_mode text DEFAULT 'adaptive'::text)
 RETURNS hlo_capability_profiles
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_diff text;
  v_anchor numeric;
  v_old numeric;
  v_expected numeric;
  v_k numeric;
  v_new numeric;
  v_delta numeric;
  v_profile public.hlo_capability_profiles;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  select difficulty into v_diff from public.hlo_question_bank where id=p_question_id and coalesce(active,true)=true;
  if v_diff is null then raise exception 'Unknown question'; end if;
  v_anchor := case v_diff when 'beginner' then 25 when 'operator' then 45 when 'architect' then 65 when 'owner' then 82 when 'allocator' then 94 else 50 end;
  insert into public.hlo_capability_profiles(user_id) values(v_uid) on conflict(user_id) do nothing;
  select knowledge_rating into v_old from public.hlo_capability_profiles where user_id=v_uid for update;
  v_expected := 1.0/(1.0+exp((v_anchor-v_old)/10.0));
  v_k := case when p_mode='placement' then 7.0 else 4.0 end;
  v_delta := v_k*((case when p_correct then 1 else 0 end)-v_expected);
  v_new := least(100,greatest(0,v_old+v_delta));
  update public.hlo_capability_profiles set knowledge_rating=round(v_new,2),question_count=question_count+1,updated_at=now() where user_id=v_uid;
  insert into public.hlo_capability_events(user_id,event_type,source_id,dimension,outcome,delta,metadata)
  values(v_uid,'question_result',p_question_id,'knowledge',case when p_correct then 1 else 0 end,round(v_delta,3),jsonb_build_object('difficulty',v_diff,'anchor',v_anchor,'session_id',p_session_id,'mode',p_mode));
  return public.hlo_recalculate_capability();
end;
$function$
;
CREATE OR REPLACE FUNCTION public.hlo_finalize_placement(p_session_id text, p_version text DEFAULT 'placement-v1'::text)
 RETURNS hlo_capability_profiles
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid uuid:=auth.uid(); v_count int; v_profile public.hlo_capability_profiles;
begin
 if v_uid is null then raise exception 'Authentication required'; end if;
 select count(*) into v_count from public.hlo_capability_events where user_id=v_uid and event_type='question_result' and metadata->>'session_id'=p_session_id and metadata->>'mode'='placement';
 if v_count<15 then raise exception 'Placement requires at least 15 answered questions'; end if;
 update public.hlo_capability_profiles set placement_completed_at=now(),placement_version=p_version,placement_score=knowledge_rating,updated_at=now() where user_id=v_uid;
 insert into public.hlo_capability_events(user_id,event_type,source_id,dimension,outcome,metadata) values(v_uid,'placement_complete',p_session_id,'overall',null,jsonb_build_object('question_count',v_count,'version',p_version));
 return public.hlo_recalculate_capability();
end;
$function$
;
ALTER TABLE public."hlo_asset_cache_v2" ADD CONSTRAINT "hlo_asset_cache_v2_pkey" PRIMARY KEY (part_no);
ALTER TABLE public."hlo_skill_scores" ADD CONSTRAINT "hlo_skill_scores_pkey" PRIMARY KEY (user_id, skill_key);
ALTER TABLE public."hlo_skill_scores" ADD CONSTRAINT "hlo_skill_scores_score_check" CHECK (((score >= (0)::numeric) AND (score <= (100)::numeric)));
ALTER TABLE public."hlo_missions" ADD CONSTRAINT "hlo_missions_difficulty_check" CHECK ((difficulty = ANY (ARRAY['beginner'::text, 'operator'::text, 'architect'::text, 'owner'::text, 'allocator'::text])));
ALTER TABLE public."hlo_missions" ADD CONSTRAINT "hlo_missions_mission_type_check" CHECK ((mission_type = ANY (ARRAY['learn'::text, 'build'::text, 'test'::text, 'practice'::text, 'research'::text, 'review'::text])));
ALTER TABLE public."hlo_missions" ADD CONSTRAINT "hlo_missions_pkey" PRIMARY KEY (id);
ALTER TABLE public."hlo_missions" ADD CONSTRAINT "hlo_missions_priority_check" CHECK (((priority >= 1) AND (priority <= 5)));
ALTER TABLE public."hlo_missions" ADD CONSTRAINT "hlo_missions_status_check" CHECK ((status = ANY (ARRAY['queued'::text, 'active'::text, 'blocked'::text, 'submitted'::text, 'completed'::text, 'archived'::text])));
ALTER TABLE public."hlo_trading_logs" ADD CONSTRAINT "hlo_trading_logs_direction_check" CHECK (((direction IS NULL) OR (direction = ANY (ARRAY['long'::text, 'short'::text, 'flat'::text]))));
ALTER TABLE public."hlo_trading_logs" ADD CONSTRAINT "hlo_trading_logs_discipline_score_check" CHECK (((discipline_score IS NULL) OR ((discipline_score >= (0)::numeric) AND (discipline_score <= (100)::numeric))));
ALTER TABLE public."hlo_trading_logs" ADD CONSTRAINT "hlo_trading_logs_pkey" PRIMARY KEY (id);
ALTER TABLE public."hlo_trading_logs" ADD CONSTRAINT "hlo_trading_logs_process_score_check" CHECK (((process_score IS NULL) OR ((process_score >= (0)::numeric) AND (process_score <= (100)::numeric))));
ALTER TABLE public."hlo_trading_logs" ADD CONSTRAINT "hlo_trading_logs_risk_score_check" CHECK (((risk_score IS NULL) OR ((risk_score >= (0)::numeric) AND (risk_score <= (100)::numeric))));
ALTER TABLE public."hlo_trading_logs" ADD CONSTRAINT "hlo_trading_logs_rule_adherence_check" CHECK (((rule_adherence IS NULL) OR ((rule_adherence >= (0)::numeric) AND (rule_adherence <= (100)::numeric))));
ALTER TABLE public."hlo_tutor_threads" ADD CONSTRAINT "hlo_tutor_threads_pkey" PRIMARY KEY (id);
ALTER TABLE public."hlo_tutor_messages" ADD CONSTRAINT "hlo_tutor_messages_pkey" PRIMARY KEY (id);
ALTER TABLE public."hlo_tutor_messages" ADD CONSTRAINT "hlo_tutor_messages_role_check" CHECK ((role = ANY (ARRAY['user'::text, 'assistant'::text, 'system'::text])));
ALTER TABLE public."hlo_certificates" ADD CONSTRAINT "hlo_certificates_level_check" CHECK ((level = ANY (ARRAY['beginner'::text, 'operator'::text, 'architect'::text, 'owner'::text, 'allocator'::text])));
ALTER TABLE public."hlo_certificates" ADD CONSTRAINT "hlo_certificates_pkey" PRIMARY KEY (id);
ALTER TABLE public."hlo_certificates" ADD CONSTRAINT "hlo_certificates_score_check" CHECK (((score IS NULL) OR ((score >= (0)::numeric) AND (score <= (100)::numeric))));
ALTER TABLE public."hlo_certificates" ADD CONSTRAINT "hlo_certificates_user_id_certificate_key_key" UNIQUE (user_id, certificate_key);
ALTER TABLE public."hlo_recommendation_snapshots" ADD CONSTRAINT "hlo_recommendation_snapshots_pkey" PRIMARY KEY (id);
ALTER TABLE public."hlo_mission_templates" ADD CONSTRAINT "hlo_mission_templates_estimated_minutes_check" CHECK ((estimated_minutes > 0));
ALTER TABLE public."hlo_mission_templates" ADD CONSTRAINT "hlo_mission_templates_level_check" CHECK ((level = ANY (ARRAY['beginner'::text, 'operator'::text, 'architect'::text, 'owner'::text, 'allocator'::text])));
ALTER TABLE public."hlo_mission_templates" ADD CONSTRAINT "hlo_mission_templates_mission_type_check" CHECK ((mission_type = ANY (ARRAY['learn'::text, 'build'::text, 'test'::text, 'practice'::text, 'research'::text, 'review'::text])));
ALTER TABLE public."hlo_mission_templates" ADD CONSTRAINT "hlo_mission_templates_pkey" PRIMARY KEY (id);
ALTER TABLE public."hlo_question_bank" ADD CONSTRAINT "hlo_question_bank_correct_index_check" CHECK ((correct_index >= 0));
ALTER TABLE public."hlo_question_bank" ADD CONSTRAINT "hlo_question_bank_difficulty_check" CHECK ((difficulty = ANY (ARRAY['beginner'::text, 'operator'::text, 'architect'::text, 'owner'::text, 'allocator'::text])));
ALTER TABLE public."hlo_question_bank" ADD CONSTRAINT "hlo_question_bank_pkey" PRIMARY KEY (id);
ALTER TABLE public."hlo_research_items" ADD CONSTRAINT "hlo_research_items_importance_check" CHECK (((importance >= 1) AND (importance <= 5)));
ALTER TABLE public."hlo_research_items" ADD CONSTRAINT "hlo_research_items_pkey" PRIMARY KEY (id);
ALTER TABLE public."hlo_research_items" ADD CONSTRAINT "hlo_research_items_source_url_title_key" UNIQUE (source_url, title);
ALTER TABLE public."hlo_profiles" ADD CONSTRAINT "hlo_profiles_experience_level_check" CHECK ((experience_level = ANY (ARRAY['beginner'::text, 'operator'::text, 'architect'::text, 'owner'::text, 'allocator'::text])));
ALTER TABLE public."hlo_profiles" ADD CONSTRAINT "hlo_profiles_pkey" PRIMARY KEY (user_id);
ALTER TABLE public."hlo_profiles" ADD CONSTRAINT "hlo_profiles_weekly_learning_hours_check" CHECK (((weekly_learning_hours >= 1) AND (weekly_learning_hours <= 40)));
ALTER TABLE public."hlo_lesson_progress" ADD CONSTRAINT "hlo_lesson_progress_attempts_check" CHECK ((attempts >= 0));
ALTER TABLE public."hlo_lesson_progress" ADD CONSTRAINT "hlo_lesson_progress_mastery_score_check" CHECK (((mastery_score >= (0)::numeric) AND (mastery_score <= (100)::numeric)));
ALTER TABLE public."hlo_lesson_progress" ADD CONSTRAINT "hlo_lesson_progress_pkey" PRIMARY KEY (user_id, lesson_id);
ALTER TABLE public."hlo_lesson_progress" ADD CONSTRAINT "hlo_lesson_progress_status_check" CHECK ((status = ANY (ARRAY['not_started'::text, 'in_progress'::text, 'completed'::text, 'mastered'::text])));
ALTER TABLE public."hlo_quiz_attempts" ADD CONSTRAINT "hlo_quiz_attempts_difficulty_check" CHECK ((difficulty = ANY (ARRAY['beginner'::text, 'operator'::text, 'architect'::text, 'owner'::text, 'allocator'::text, 'adaptive'::text])));
ALTER TABLE public."hlo_quiz_attempts" ADD CONSTRAINT "hlo_quiz_attempts_pkey" PRIMARY KEY (id);
ALTER TABLE public."hlo_quiz_attempts" ADD CONSTRAINT "hlo_quiz_attempts_score_check" CHECK (((score >= (0)::numeric) AND (score <= (100)::numeric)));
ALTER TABLE public."hlo_plan_progress" ADD CONSTRAINT "hlo_plan_progress_pkey" PRIMARY KEY (user_id, plan_id, item_key);
ALTER TABLE public."hlo_plan_progress" ADD CONSTRAINT "hlo_plan_progress_status_check" CHECK ((status = ANY (ARRAY['not_started'::text, 'in_progress'::text, 'completed'::text])));
ALTER TABLE public."hlo_frontend_chunks" ADD CONSTRAINT "hlo_frontend_chunks_pkey" PRIMARY KEY (version, chunk_no);
ALTER TABLE public."hlo_asset_cache" ADD CONSTRAINT "hlo_asset_cache_pkey" PRIMARY KEY (part_no);
ALTER TABLE public."hlo_analytics_subjects" ADD CONSTRAINT "hlo_analytics_subject_hash_ck" CHECK (((anonymous_id_hash IS NULL) OR (length(anonymous_id_hash) >= 32)));
ALTER TABLE public."hlo_analytics_subjects" ADD CONSTRAINT "hlo_analytics_subject_identity_ck" CHECK (((user_id IS NOT NULL) OR (anonymous_id_hash IS NOT NULL)));
ALTER TABLE public."hlo_analytics_subjects" ADD CONSTRAINT "hlo_analytics_subjects_anonymous_id_hash_key" UNIQUE (anonymous_id_hash);
ALTER TABLE public."hlo_analytics_subjects" ADD CONSTRAINT "hlo_analytics_subjects_pkey" PRIMARY KEY (id);
ALTER TABLE public."hlo_analytics_subjects" ADD CONSTRAINT "hlo_analytics_subjects_user_id_key" UNIQUE (user_id);
ALTER TABLE public."hlo_analytics_event_contracts" ADD CONSTRAINT "hlo_analytics_event_contracts_pkey" PRIMARY KEY (event_name);
ALTER TABLE public."hlo_analytics_event_contracts" ADD CONSTRAINT "hlo_analytics_event_contracts_schema_version_check" CHECK ((schema_version > 0));
ALTER TABLE public."hlo_analytics_metric_definitions" ADD CONSTRAINT "hlo_analytics_metric_definitions_pkey" PRIMARY KEY (metric_key);
ALTER TABLE public."hlo_analytics_metric_definitions" ADD CONSTRAINT "hlo_analytics_metric_definitions_version_check" CHECK ((version > 0));
ALTER TABLE public."hlo_analytics_identity_links" ADD CONSTRAINT "hlo_analytics_identity_links_link_type_check" CHECK ((link_type = ANY (ARRAY['anonymous_to_authenticated'::text, 'account_merge'::text, 'support_verified'::text])));
ALTER TABLE public."hlo_analytics_identity_links" ADD CONSTRAINT "hlo_analytics_identity_links_pkey" PRIMARY KEY (id);
ALTER TABLE public."hlo_analytics_identity_links" ADD CONSTRAINT "hlo_analytics_identity_links_subject_id_user_id_key" UNIQUE (subject_id, user_id);
ALTER TABLE public."hlo_analytics_attribution_touches" ADD CONSTRAINT "hlo_analytics_attribution_identity_ck" CHECK (((subject_id IS NOT NULL) OR (user_id IS NOT NULL)));
ALTER TABLE public."hlo_analytics_attribution_touches" ADD CONSTRAINT "hlo_analytics_attribution_touches_idempotency_key_key" UNIQUE (idempotency_key);
ALTER TABLE public."hlo_analytics_attribution_touches" ADD CONSTRAINT "hlo_analytics_attribution_touches_pkey" PRIMARY KEY (id);
ALTER TABLE public."hlo_analytics_attribution_touches" ADD CONSTRAINT "hlo_analytics_attribution_touches_touch_type_check" CHECK ((touch_type = ANY (ARRAY['first_touch'::text, 'session_touch'::text, 'conversion_touch'::text, 'content_touch'::text, 'referral_touch'::text])));
ALTER TABLE public."hlo_analytics_attribution_touches" ADD CONSTRAINT "hlo_analytics_click_hash_ck" CHECK (((click_id_hash IS NULL) OR (length(click_id_hash) >= 32)));
ALTER TABLE public."hlo_analytics_experiments" ADD CONSTRAINT "hlo_analytics_experiments_decision_check" CHECK (((decision IS NULL) OR (decision = ANY (ARRAY['ship'::text, 'iterate'::text, 'hold'::text, 'stop'::text, 'inconclusive'::text]))));
ALTER TABLE public."hlo_analytics_experiments" ADD CONSTRAINT "hlo_analytics_experiments_minimum_runtime_days_check" CHECK (((minimum_runtime_days IS NULL) OR (minimum_runtime_days > 0)));
ALTER TABLE public."hlo_analytics_experiments" ADD CONSTRAINT "hlo_analytics_experiments_minimum_sample_size_check" CHECK (((minimum_sample_size IS NULL) OR (minimum_sample_size > 0)));
ALTER TABLE public."hlo_analytics_experiments" ADD CONSTRAINT "hlo_analytics_experiments_pkey" PRIMARY KEY (experiment_id);
ALTER TABLE public."hlo_analytics_experiments" ADD CONSTRAINT "hlo_analytics_experiments_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'qa'::text, 'running'::text, 'paused'::text, 'completed'::text, 'stopped'::text, 'inconclusive'::text])));
ALTER TABLE public."hlo_analytics_experiment_exposures" ADD CONSTRAINT "hlo_analytics_experiment_exposu_experiment_id_assignment_id_key" UNIQUE (experiment_id, assignment_id);
ALTER TABLE public."hlo_analytics_experiment_exposures" ADD CONSTRAINT "hlo_analytics_experiment_exposures_idempotency_key_key" UNIQUE (idempotency_key);
ALTER TABLE public."hlo_analytics_experiment_exposures" ADD CONSTRAINT "hlo_analytics_experiment_exposures_pkey" PRIMARY KEY (id);
ALTER TABLE public."hlo_analytics_experiment_exposures" ADD CONSTRAINT "hlo_analytics_exposure_identity_ck" CHECK (((subject_id IS NOT NULL) OR (user_id IS NOT NULL)));
ALTER TABLE public."hlo_analytics_ai_usage" ADD CONSTRAINT "hlo_analytics_ai_usage_cached_input_tokens_check" CHECK ((cached_input_tokens >= 0));
ALTER TABLE public."hlo_analytics_ai_usage" ADD CONSTRAINT "hlo_analytics_ai_usage_cost_microusd_check" CHECK ((cost_microusd >= 0));
ALTER TABLE public."hlo_analytics_ai_usage" ADD CONSTRAINT "hlo_analytics_ai_usage_idempotency_key_key" UNIQUE (idempotency_key);
ALTER TABLE public."hlo_analytics_ai_usage" ADD CONSTRAINT "hlo_analytics_ai_usage_input_tokens_check" CHECK ((input_tokens >= 0));
ALTER TABLE public."hlo_analytics_ai_usage" ADD CONSTRAINT "hlo_analytics_ai_usage_interaction_id_provider_model_prompt_key" UNIQUE (interaction_id, provider, model, prompt_version);
ALTER TABLE public."hlo_analytics_ai_usage" ADD CONSTRAINT "hlo_analytics_ai_usage_latency_ms_check" CHECK (((latency_ms IS NULL) OR (latency_ms >= 0)));
ALTER TABLE public."hlo_analytics_ai_usage" ADD CONSTRAINT "hlo_analytics_ai_usage_output_tokens_check" CHECK ((output_tokens >= 0));
ALTER TABLE public."hlo_analytics_ai_usage" ADD CONSTRAINT "hlo_analytics_ai_usage_pkey" PRIMARY KEY (id);
ALTER TABLE public."hlo_analytics_cost_ledger" ADD CONSTRAINT "hlo_analytics_cost_ledger_amount_microusd_check" CHECK ((amount_microusd >= 0));
ALTER TABLE public."hlo_analytics_cost_ledger" ADD CONSTRAINT "hlo_analytics_cost_ledger_cost_type_check" CHECK ((cost_type = ANY (ARRAY['ai_inference'::text, 'payment_fee'::text, 'support_variable'::text, 'acquisition'::text, 'email_delivery'::text, 'storage'::text, 'other_variable'::text])));
ALTER TABLE public."hlo_analytics_cost_ledger" ADD CONSTRAINT "hlo_analytics_cost_ledger_idempotency_key_key" UNIQUE (idempotency_key);
ALTER TABLE public."hlo_analytics_cost_ledger" ADD CONSTRAINT "hlo_analytics_cost_ledger_pkey" PRIMARY KEY (id);
ALTER TABLE public."hlo_analytics_revenue_ledger" ADD CONSTRAINT "hlo_analytics_revenue_ledger_billing_interval_check" CHECK (((billing_interval IS NULL) OR (billing_interval = ANY (ARRAY['monthly'::text, 'annual'::text, 'one_time'::text, 'cohort'::text, 'b2b'::text]))));
ALTER TABLE public."hlo_analytics_revenue_ledger" ADD CONSTRAINT "hlo_analytics_revenue_ledger_event_type_check" CHECK ((event_type = ANY (ARRAY['checkout_started'::text, 'subscription_started'::text, 'subscription_renewed'::text, 'subscription_cancelled'::text, 'payment_succeeded'::text, 'payment_failed'::text, 'refund'::text, 'chargeback'::text])));
ALTER TABLE public."hlo_analytics_revenue_ledger" ADD CONSTRAINT "hlo_analytics_revenue_ledger_pkey" PRIMARY KEY (id);
ALTER TABLE public."hlo_analytics_revenue_ledger" ADD CONSTRAINT "hlo_analytics_revenue_ledger_provider_event_id_key" UNIQUE (provider_event_id);
ALTER TABLE public."hlo_analytics_revenue_ledger" ADD CONSTRAINT "hlo_analytics_revenue_ledger_refund_microusd_check" CHECK ((refund_microusd >= 0));
ALTER TABLE public."hlo_analytics_consents" ADD CONSTRAINT "hlo_analytics_consents_identity_ck" CHECK (((subject_id IS NOT NULL) OR (user_id IS NOT NULL)));
ALTER TABLE public."hlo_analytics_consents" ADD CONSTRAINT "hlo_analytics_consents_pkey" PRIMARY KEY (id);
ALTER TABLE public."hlo_analytics_consents" ADD CONSTRAINT "hlo_analytics_consents_source_check" CHECK ((source = ANY (ARRAY['consent_banner'::text, 'signup'::text, 'account_settings'::text, 'support'::text, 'system_migration'::text])));
ALTER TABLE public."hlo_analytics_sessions" ADD CONSTRAINT "hlo_analytics_sessions_device_type_check" CHECK (((device_type IS NULL) OR (device_type = ANY (ARRAY['mobile'::text, 'tablet'::text, 'desktop'::text, 'unknown'::text]))));
ALTER TABLE public."hlo_analytics_sessions" ADD CONSTRAINT "hlo_analytics_sessions_identity_ck" CHECK (((subject_id IS NOT NULL) OR (user_id IS NOT NULL)));
ALTER TABLE public."hlo_analytics_sessions" ADD CONSTRAINT "hlo_analytics_sessions_pkey" PRIMARY KEY (id);
ALTER TABLE public."hlo_analytics_events" ADD CONSTRAINT "hlo_analytics_events_consent_basis_check" CHECK ((consent_basis = ANY (ARRAY['explicit_analytics'::text, 'strictly_necessary'::text, 'b2b_contract'::text])));
ALTER TABLE public."hlo_analytics_events" ADD CONSTRAINT "hlo_analytics_events_device_type_check" CHECK (((device_type IS NULL) OR (device_type = ANY (ARRAY['mobile'::text, 'tablet'::text, 'desktop'::text, 'unknown'::text]))));
ALTER TABLE public."hlo_analytics_events" ADD CONSTRAINT "hlo_analytics_events_idempotency_key_key" UNIQUE (idempotency_key);
ALTER TABLE public."hlo_analytics_events" ADD CONSTRAINT "hlo_analytics_events_identity_ck" CHECK (((subject_id IS NOT NULL) OR (user_id IS NOT NULL)));
ALTER TABLE public."hlo_analytics_events" ADD CONSTRAINT "hlo_analytics_events_pkey" PRIMARY KEY (id);
ALTER TABLE public."hlo_analytics_events" ADD CONSTRAINT "hlo_analytics_events_properties_object_ck" CHECK ((jsonb_typeof(properties) = 'object'::text));
ALTER TABLE public."hlo_analytics_events" ADD CONSTRAINT "hlo_analytics_events_schema_version_check" CHECK ((schema_version > 0));
ALTER TABLE public."hlo_analytics_baseline_results" ADD CONSTRAINT "hlo_analytics_baseline_identity_ck" CHECK (((subject_id IS NOT NULL) OR (user_id IS NOT NULL)));
ALTER TABLE public."hlo_analytics_baseline_results" ADD CONSTRAINT "hlo_analytics_baseline_results_idempotency_key_key" UNIQUE (idempotency_key);
ALTER TABLE public."hlo_analytics_baseline_results" ADD CONSTRAINT "hlo_analytics_baseline_results_pkey" PRIMARY KEY (id);
ALTER TABLE public."hlo_analytics_learning_state_snapshots" ADD CONSTRAINT "hlo_analytics_learning_snapshot_identity_ck" CHECK (((subject_id IS NOT NULL) OR (user_id IS NOT NULL)));
ALTER TABLE public."hlo_analytics_learning_state_snapshots" ADD CONSTRAINT "hlo_analytics_learning_state_snapshots_pkey" PRIMARY KEY (id);
ALTER TABLE public."hlo_owner_users" ADD CONSTRAINT "hlo_owner_users_pkey" PRIMARY KEY (user_id);
ALTER TABLE public."hlo_personalization_intakes" ADD CONSTRAINT "hlo_personalization_intakes_pkey" PRIMARY KEY (id);
ALTER TABLE public."hlo_personalization_intakes" ADD CONSTRAINT "hlo_personalization_intakes_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'submitted'::text, 'generating'::text, 'complete'::text, 'failed'::text])));
ALTER TABLE public."hlo_personalization_intakes" ADD CONSTRAINT "hlo_personalization_intakes_version_check" CHECK ((version > 0));
ALTER TABLE public."hlo_custom_curricula" ADD CONSTRAINT "hlo_custom_curricula_generation_mode_check" CHECK ((generation_mode = ANY (ARRAY['rules'::text, 'ai_agents'::text, 'hybrid'::text])));
ALTER TABLE public."hlo_custom_curricula" ADD CONSTRAINT "hlo_custom_curricula_pkey" PRIMARY KEY (id);
ALTER TABLE public."hlo_custom_curricula" ADD CONSTRAINT "hlo_custom_curricula_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'generating'::text, 'active'::text, 'archived'::text, 'failed'::text])));
ALTER TABLE public."hlo_custom_curricula" ADD CONSTRAINT "hlo_custom_curricula_version_check" CHECK ((version > 0));
ALTER TABLE public."hlo_custom_module_progress" ADD CONSTRAINT "hlo_custom_module_progress_mastery_score_check" CHECK (((mastery_score >= (0)::numeric) AND (mastery_score <= (100)::numeric)));
ALTER TABLE public."hlo_custom_module_progress" ADD CONSTRAINT "hlo_custom_module_progress_pkey" PRIMARY KEY (user_id, curriculum_id, module_key);
ALTER TABLE public."hlo_custom_module_progress" ADD CONSTRAINT "hlo_custom_module_progress_status_check" CHECK ((status = ANY (ARRAY['not_started'::text, 'in_progress'::text, 'completed'::text, 'mastered'::text])));
ALTER TABLE public."hlo_curriculum_agent_registry" ADD CONSTRAINT "hlo_curriculum_agent_registry_pkey" PRIMARY KEY (agent_code);
ALTER TABLE public."hlo_asset_cache_v3" ADD CONSTRAINT "hlo_asset_cache_v3_pkey" PRIMARY KEY (part_no);
ALTER TABLE public."hlo_curriculum_agent_runs" ADD CONSTRAINT "hlo_curriculum_agent_runs_pkey" PRIMARY KEY (id);
ALTER TABLE public."hlo_curriculum_agent_runs" ADD CONSTRAINT "hlo_curriculum_agent_runs_status_check" CHECK ((status = ANY (ARRAY['queued'::text, 'running'::text, 'completed'::text, 'failed'::text, 'fallback'::text])));
ALTER TABLE public."hlo_app_assets_v4" ADD CONSTRAINT "hlo_app_assets_v4_pkey" PRIMARY KEY (name);
ALTER TABLE public."hlo_app_assets_backup_20260902" ADD CONSTRAINT "hlo_app_assets_backup_20260902_pkey" PRIMARY KEY (name);
ALTER TABLE public."hlo_ai_guide_eval_results" ADD CONSTRAINT "hlo_ai_guide_eval_results_pkey" PRIMARY KEY (id);
ALTER TABLE public."hlo_ai_guide_eval_results" ADD CONSTRAINT "hlo_ai_guide_eval_results_run_id_case_id_key" UNIQUE (run_id, case_id);
ALTER TABLE public."hlo_ai_guide_eval_runs" ADD CONSTRAINT "hlo_ai_guide_eval_runs_pkey" PRIMARY KEY (id);
ALTER TABLE public."hlo_ai_guide_eval_runs" ADD CONSTRAINT "hlo_ai_guide_eval_runs_release_decision_check" CHECK ((release_decision = ANY (ARRAY['pass'::text, 'block'::text, 'iterate'::text, 'inconclusive'::text])));
ALTER TABLE public."hlo_ai_guide_eval_cases" ADD CONSTRAINT "hlo_ai_guide_eval_cases_pkey" PRIMARY KEY (case_id);
ALTER TABLE public."hlo_ai_guide_eval_cases" ADD CONSTRAINT "hlo_ai_guide_eval_cases_severity_check" CHECK ((severity = ANY (ARRAY['standard'::text, 'high'::text, 'critical'::text])));
ALTER TABLE public."hlo_lab_drafts" ADD CONSTRAINT "hlo_lab_drafts_pkey" PRIMARY KEY (id);
ALTER TABLE public."hlo_lab_drafts" ADD CONSTRAINT "hlo_lab_drafts_user_id_lab_key_key" UNIQUE (user_id, lab_key);
ALTER TABLE public."hlo_events" ADD CONSTRAINT "hlo_events_pkey" PRIMARY KEY (id);
ALTER TABLE public."hlo_lifecycle_interventions" ADD CONSTRAINT "hlo_lifecycle_interventions_pkey" PRIMARY KEY (id);
ALTER TABLE public."hlo_lifecycle_interventions" ADD CONSTRAINT "hlo_lifecycle_interventions_status_check" CHECK ((status = ANY (ARRAY['candidate'::text, 'suppressed'::text, 'queued'::text, 'sent'::text, 'acted'::text, 'expired'::text, 'cancelled'::text])));
ALTER TABLE public."hlo_lifecycle_state_definitions" ADD CONSTRAINT "hlo_lifecycle_state_definitions_pkey" PRIMARY KEY (state_code);
ALTER TABLE public."hlo_live_asset_inspect" ADD CONSTRAINT "hlo_live_asset_inspect_pkey" PRIMARY KEY (asset_name);
ALTER TABLE public."hlo_qaqc_runs" ADD CONSTRAINT "hlo_qaqc_runs_pkey" PRIMARY KEY (id);
ALTER TABLE public."hlo_user_settings" ADD CONSTRAINT "hlo_user_settings_pkey" PRIMARY KEY (user_id);
ALTER TABLE public."hlo_module_notes" ADD CONSTRAINT "hlo_module_notes_pkey" PRIMARY KEY (id);
ALTER TABLE public."hlo_module_notes" ADD CONSTRAINT "hlo_module_notes_user_id_module_id_key" UNIQUE (user_id, module_id);
ALTER TABLE public."hlo_saved_sources" ADD CONSTRAINT "hlo_saved_sources_pkey" PRIMARY KEY (id);
ALTER TABLE public."hlo_saved_sources" ADD CONSTRAINT "hlo_saved_sources_user_id_source_key_key" UNIQUE (user_id, source_key);
ALTER TABLE public."hlo_support_requests" ADD CONSTRAINT "hlo_support_requests_pkey" PRIMARY KEY (id);
ALTER TABLE public."hlo_capability_events" ADD CONSTRAINT "hlo_capability_events_pkey" PRIMARY KEY (id);
ALTER TABLE public."hlo_lab_attempts" ADD CONSTRAINT "hlo_lab_attempts_pkey" PRIMARY KEY (id);
ALTER TABLE public."hlo_capability_profiles" ADD CONSTRAINT "hlo_capability_profiles_pkey" PRIMARY KEY (user_id);
ALTER TABLE public."hlo_capability_profiles" ADD CONSTRAINT "hlo_capability_profiles_tier_check" CHECK (((tier >= 1) AND (tier <= 5)));
ALTER TABLE public."hlo_module_reflections" ADD CONSTRAINT "hlo_module_reflections_pkey" PRIMARY KEY (id);
ALTER TABLE public."hlo_module_reflections" ADD CONSTRAINT "hlo_module_reflections_user_id_lesson_id_reflection_type_key" UNIQUE (user_id, lesson_id, reflection_type);
ALTER TABLE public."hlo_frontier_signals" ADD CONSTRAINT "hlo_frontier_signals_confidence_check" CHECK (((confidence >= 0) AND (confidence <= 100)));
ALTER TABLE public."hlo_frontier_signals" ADD CONSTRAINT "hlo_frontier_signals_importance_check" CHECK (((importance >= 1) AND (importance <= 5)));
ALTER TABLE public."hlo_frontier_signals" ADD CONSTRAINT "hlo_frontier_signals_pkey" PRIMARY KEY (id);
ALTER TABLE public."hlo_opportunities" ADD CONSTRAINT "hlo_opportunities_decision_check" CHECK ((decision = ANY (ARRAY['test'::text, 'scale'::text, 'hold'::text, 'kill'::text])));
ALTER TABLE public."hlo_opportunities" ADD CONSTRAINT "hlo_opportunities_pkey" PRIMARY KEY (id);
ALTER TABLE public."hlo_opportunities" ADD CONSTRAINT "hlo_opportunities_score_control_check" CHECK (((score_control >= 1) AND (score_control <= 5)));
ALTER TABLE public."hlo_opportunities" ADD CONSTRAINT "hlo_opportunities_score_fit_check" CHECK (((score_fit >= 1) AND (score_fit <= 5)));
ALTER TABLE public."hlo_opportunities" ADD CONSTRAINT "hlo_opportunities_score_risk_check" CHECK (((score_risk >= 1) AND (score_risk <= 5)));
ALTER TABLE public."hlo_opportunities" ADD CONSTRAINT "hlo_opportunities_score_timing_check" CHECK (((score_timing >= 1) AND (score_timing <= 5)));
ALTER TABLE public."hlo_opportunities" ADD CONSTRAINT "hlo_opportunities_score_value_check" CHECK (((score_value >= 1) AND (score_value <= 5)));
ALTER TABLE public."hlo_opportunities" ADD CONSTRAINT "hlo_opportunities_stage_check" CHECK ((stage = ANY (ARRAY['signal'::text, 'implication'::text, 'opportunity'::text, 'capability'::text, 'experiment'::text, 'evidence'::text, 'asset'::text, 'decision'::text])));
ALTER TABLE public."hlo_leverage_snapshots" ADD CONSTRAINT "hlo_leverage_snapshots_capital_allocation_check" CHECK (((capital_allocation >= 0) AND (capital_allocation <= 100)));
ALTER TABLE public."hlo_leverage_snapshots" ADD CONSTRAINT "hlo_leverage_snapshots_domain_expertise_check" CHECK (((domain_expertise >= 0) AND (domain_expertise <= 100)));
ALTER TABLE public."hlo_leverage_snapshots" ADD CONSTRAINT "hlo_leverage_snapshots_judgment_verification_check" CHECK (((judgment_verification >= 0) AND (judgment_verification <= 100)));
ALTER TABLE public."hlo_leverage_snapshots" ADD CONSTRAINT "hlo_leverage_snapshots_owned_ip_data_assets_check" CHECK (((owned_ip_data_assets >= 0) AND (owned_ip_data_assets <= 100)));
ALTER TABLE public."hlo_leverage_snapshots" ADD CONSTRAINT "hlo_leverage_snapshots_pkey" PRIMARY KEY (id);
ALTER TABLE public."hlo_leverage_snapshots" ADD CONSTRAINT "hlo_leverage_snapshots_relationships_distribution_check" CHECK (((relationships_distribution >= 0) AND (relationships_distribution <= 100)));
ALTER TABLE public."hlo_leverage_snapshots" ADD CONSTRAINT "hlo_leverage_snapshots_systems_automation_check" CHECK (((systems_automation >= 0) AND (systems_automation <= 100)));
ALTER TABLE public."hlo_owner_private_content" ADD CONSTRAINT "hlo_owner_private_content_pkey" PRIMARY KEY (id);
ALTER TABLE public."hlo_owner_private_content" ADD CONSTRAINT "hlo_owner_private_content_track_check" CHECK ((track = ANY (ARRAY['Nexus Intelligence'::text, 'Statecraft'::text])));
ALTER TABLE public."hlo_owner_private_content" ADD CONSTRAINT "hlo_owner_private_content_track_key" UNIQUE (track);
ALTER TABLE public."hlo_owner_empire_capstone" ADD CONSTRAINT "hlo_owner_empire_capstone_pkey" PRIMARY KEY (owner_user_id);
ALTER TABLE public."hlo_privacy_request_receipts" ADD CONSTRAINT "hlo_privacy_request_receipts_pkey" PRIMARY KEY (receipt_id);
ALTER TABLE public."hlo_privacy_request_receipts" ADD CONSTRAINT "hlo_privacy_request_receipts_request_type_check" CHECK ((request_type = ANY (ARRAY['export'::text, 'deletion'::text])));
ALTER TABLE public."hlo_privacy_request_receipts" ADD CONSTRAINT "hlo_privacy_request_receipts_status_check" CHECK ((status = ANY (ARRAY['completed'::text, 'failed'::text])));
ALTER TABLE public."hlo_attention_enrollments" ADD CONSTRAINT "hlo_attention_enrollments_current_day_check" CHECK (((current_day >= 1) AND (current_day <= 7)));
ALTER TABLE public."hlo_attention_enrollments" ADD CONSTRAINT "hlo_attention_enrollments_journey_status_check" CHECK ((journey_status = ANY (ARRAY['active'::text, 'completed'::text, 'paused'::text])));
ALTER TABLE public."hlo_attention_enrollments" ADD CONSTRAINT "hlo_attention_enrollments_pkey" PRIMARY KEY (user_id);
ALTER TABLE public."hlo_attention_day_progress" ADD CONSTRAINT "hlo_attention_day_progress_module_status_check" CHECK ((module_status = ANY (ARRAY['locked'::text, 'in_progress'::text, 'completed'::text])));
ALTER TABLE public."hlo_attention_day_progress" ADD CONSTRAINT "hlo_attention_day_progress_pkey" PRIMARY KEY (user_id, day_number);
ALTER TABLE public."hlo_attention_day_progress" ADD CONSTRAINT "hlo_attention_day_progress_step_key_check" CHECK ((step_key = ANY (ARRAY['lesson'::text, 'practice'::text, 'reflection'::text, 'complete'::text])));
ALTER TABLE public."hlo_billing_entitlements" ADD CONSTRAINT "hlo_billing_entitlements_check" CHECK (((status <> 'grace_period'::text) OR (grace_ends_at IS NOT NULL)));
ALTER TABLE public."hlo_billing_entitlements" ADD CONSTRAINT "hlo_billing_entitlements_pkey" PRIMARY KEY (user_id);
ALTER TABLE public."hlo_billing_entitlements" ADD CONSTRAINT "hlo_billing_entitlements_plan_code_check" CHECK ((plan_code = ANY (ARRAY['free'::text, 'plus'::text])));
ALTER TABLE public."hlo_billing_entitlements" ADD CONSTRAINT "hlo_billing_entitlements_status_check" CHECK ((status = ANY (ARRAY['free'::text, 'active'::text, 'grace_period'::text, 'canceling'::text, 'canceled'::text, 'refunded'::text, 'incomplete'::text])));
ALTER TABLE public."hlo_billing_entitlements" ADD CONSTRAINT "hlo_billing_entitlements_stripe_customer_id_key" UNIQUE (stripe_customer_id);
ALTER TABLE public."hlo_billing_entitlements" ADD CONSTRAINT "hlo_billing_entitlements_stripe_subscription_id_key" UNIQUE (stripe_subscription_id);
ALTER TABLE public."hlo_billing_webhook_events" ADD CONSTRAINT "hlo_billing_webhook_events_pkey" PRIMARY KEY (stripe_event_id);
ALTER TABLE public."hlo_billing_webhook_events" ADD CONSTRAINT "hlo_billing_webhook_events_processing_status_check" CHECK ((processing_status = ANY (ARRAY['processing'::text, 'processed'::text, 'ignored'::text, 'failed'::text])));
ALTER TABLE public."hlo_billing_dunning_outbox" ADD CONSTRAINT "hlo_billing_dunning_outbox_pkey" PRIMARY KEY (id);
ALTER TABLE public."hlo_billing_dunning_outbox" ADD CONSTRAINT "hlo_billing_dunning_outbox_status_check" CHECK ((status = ANY (ARRAY['queued'::text, 'sending'::text, 'sent'::text, 'failed'::text, 'cancelled'::text])));
ALTER TABLE public."hlo_billing_dunning_outbox" ADD CONSTRAINT "hlo_billing_dunning_outbox_stripe_invoice_id_template_key_key" UNIQUE (stripe_invoice_id, template_key);
ALTER TABLE public."hlo_legal_consents" ADD CONSTRAINT "hlo_legal_consents_pkey" PRIMARY KEY (id);
ALTER TABLE public."hlo_legal_consents" ADD CONSTRAINT "hlo_legal_consents_user_id_terms_version_privacy_version_key" UNIQUE (user_id, terms_version, privacy_version);
ALTER TABLE public."hlo_attention_curriculum_days" ADD CONSTRAINT "hlo_attention_curriculum_days_day_number_check" CHECK (((day_number >= 1) AND (day_number <= 7)));
ALTER TABLE public."hlo_attention_curriculum_days" ADD CONSTRAINT "hlo_attention_curriculum_days_pkey" PRIMARY KEY (day_number);
ALTER TABLE public."hlo_attention_curriculum_days" ADD CONSTRAINT "hlo_attention_curriculum_days_practice_minutes_check" CHECK (((practice_minutes >= 1) AND (practice_minutes <= 30)));
ALTER TABLE public."hlo_attention_curriculum_days" ADD CONSTRAINT "hlo_attention_curriculum_days_required_tier_check" CHECK ((required_tier = ANY (ARRAY['free'::text, 'plus'::text])));
ALTER TABLE public."hlo_attention_curriculum_days" ADD CONSTRAINT "hlo_attention_curriculum_days_slug_key" UNIQUE (slug);
CREATE VIEW public."hlo_analytics_daily_funnel" WITH (security_invoker=true) AS  SELECT (occurred_at AT TIME ZONE 'UTC'::text)::date AS event_date,
    COALESCE(source, 'unknown'::text) AS source,
    COALESCE(capability, 'unknown'::text) AS capability,
    count(DISTINCT COALESCE(user_id::text, subject_id::text)) FILTER (WHERE event_name = 'visitor_qualified'::text) AS qualified_visitors,
    count(DISTINCT COALESCE(user_id::text, subject_id::text)) FILTER (WHERE event_name = 'baseline_started'::text) AS baseline_starts,
    count(DISTINCT COALESCE(user_id::text, subject_id::text)) FILTER (WHERE event_name = 'baseline_completed'::text) AS baseline_completes,
    count(DISTINCT COALESCE(user_id::text, subject_id::text)) FILTER (WHERE event_name = 'lesson_completed'::text) AS lesson_completes,
    count(DISTINCT COALESCE(user_id::text, subject_id::text)) FILTER (WHERE event_name = 'practice_completed'::text) AS practice_completes,
    count(DISTINCT COALESCE(user_id::text, subject_id::text)) FILTER (WHERE event_name = 'session_returned'::text) AS returning_learners,
    count(DISTINCT COALESCE(user_id::text, subject_id::text)) FILTER (WHERE event_name = 'subscription_started'::text) AS new_paid
   FROM hlo_analytics_events
  WHERE NOT is_synthetic
  GROUP BY ((occurred_at AT TIME ZONE 'UTC'::text)::date), (COALESCE(source, 'unknown'::text)), (COALESCE(capability, 'unknown'::text));
CREATE VIEW public."hlo_analytics_ai_economics_daily" WITH (security_invoker=true) AS  SELECT (occurred_at AT TIME ZONE 'UTC'::text)::date AS usage_date,
    use_case,
    provider,
    model,
    prompt_version,
    count(*) AS interactions,
    sum(input_tokens) AS input_tokens,
    sum(output_tokens) AS output_tokens,
    percentile_cont(0.5::double precision) WITHIN GROUP (ORDER BY (latency_ms::double precision)) AS median_latency_ms,
    percentile_cont(0.95::double precision) WITHIN GROUP (ORDER BY (latency_ms::double precision)) AS p95_latency_ms,
    sum(cost_microusd) AS cost_microusd,
    count(*) FILTER (WHERE safety_flag) AS safety_flags,
    count(*) FILTER (WHERE error_code IS NOT NULL) AS errors
   FROM hlo_analytics_ai_usage
  WHERE NOT is_synthetic
  GROUP BY ((occurred_at AT TIME ZONE 'UTC'::text)::date), use_case, provider, model, prompt_version;
CREATE VIEW public."hlo_analytics_unit_economics_daily" WITH (security_invoker=true) AS  WITH revenue AS (
         SELECT (hlo_analytics_revenue_ledger.occurred_at AT TIME ZONE 'UTC'::text)::date AS d,
            sum(hlo_analytics_revenue_ledger.gross_microusd - hlo_analytics_revenue_ledger.refund_microusd) AS net_revenue_microusd
           FROM hlo_analytics_revenue_ledger
          WHERE NOT hlo_analytics_revenue_ledger.is_synthetic
          GROUP BY ((hlo_analytics_revenue_ledger.occurred_at AT TIME ZONE 'UTC'::text)::date)
        ), costs AS (
         SELECT (hlo_analytics_cost_ledger.occurred_at AT TIME ZONE 'UTC'::text)::date AS d,
            sum(hlo_analytics_cost_ledger.amount_microusd) AS variable_cost_microusd
           FROM hlo_analytics_cost_ledger
          WHERE NOT hlo_analytics_cost_ledger.is_synthetic
          GROUP BY ((hlo_analytics_cost_ledger.occurred_at AT TIME ZONE 'UTC'::text)::date)
        )
 SELECT COALESCE(r.d, c.d) AS metric_date,
    COALESCE(r.net_revenue_microusd, 0::numeric) AS net_revenue_microusd,
    COALESCE(c.variable_cost_microusd, 0::numeric) AS variable_cost_microusd,
    COALESCE(r.net_revenue_microusd, 0::numeric) - COALESCE(c.variable_cost_microusd, 0::numeric) AS gross_profit_microusd,
        CASE
            WHEN COALESCE(r.net_revenue_microusd, 0::numeric) > 0::numeric THEN (COALESCE(r.net_revenue_microusd, 0::numeric) - COALESCE(c.variable_cost_microusd, 0::numeric)) / r.net_revenue_microusd
            ELSE NULL::numeric
        END AS gross_margin
   FROM revenue r
     FULL JOIN costs c ON c.d = r.d;
CREATE VIEW public."hlo_analytics_learner_funnel" WITH (security_invoker=true) AS  WITH base AS (
         SELECT COALESCE(e.user_id::text, e.subject_id::text) AS learner_key,
            min(e.occurred_at) FILTER (WHERE e.event_name = ANY (ARRAY['visitor_qualified'::text, 'baseline_started'::text, 'learning_goal_set'::text])) AS cohort_at,
            min(e.occurred_at) FILTER (WHERE e.event_name = 'baseline_completed'::text) AS baseline_completed_at,
            min(e.occurred_at) FILTER (WHERE e.event_name = 'learning_goal_set'::text) AS goal_set_at,
            min(e.occurred_at) FILTER (WHERE e.event_name = 'lesson_completed'::text) AS first_lesson_at,
            min(e.occurred_at) FILTER (WHERE e.event_name = 'practice_completed'::text) AS first_practice_at,
            min(e.occurred_at) FILTER (WHERE e.event_name = 'session_returned'::text) AS second_session_at,
            min(e.occurred_at) FILTER (WHERE e.event_name = 'subscription_started'::text) AS paid_at,
            (array_agg(COALESCE(e.source, 'unknown'::text) ORDER BY e.occurred_at))[1] AS acquisition_source,
            (array_agg(e.capability ORDER BY e.occurred_at) FILTER (WHERE e.capability IS NOT NULL))[1] AS capability,
            (array_agg(e.baseline_version ORDER BY e.occurred_at) FILTER (WHERE e.baseline_version IS NOT NULL))[1] AS baseline_version,
            (array_agg(e.curriculum_version ORDER BY e.occurred_at) FILTER (WHERE e.curriculum_version IS NOT NULL))[1] AS curriculum_version
           FROM hlo_analytics_events e
          WHERE NOT e.is_synthetic
          GROUP BY (COALESCE(e.user_id::text, e.subject_id::text))
        )
 SELECT learner_key,
    cohort_at,
    baseline_completed_at,
    goal_set_at,
    first_lesson_at,
    first_practice_at,
    second_session_at,
    paid_at,
    acquisition_source,
    capability,
    baseline_version,
    curriculum_version,
        CASE
            WHEN COALESCE(baseline_completed_at, goal_set_at) <= (cohort_at + '7 days'::interval) AND first_lesson_at <= (cohort_at + '7 days'::interval) AND first_practice_at <= (cohort_at + '7 days'::interval) AND second_session_at <= (cohort_at + '7 days'::interval) THEN GREATEST(COALESCE(baseline_completed_at, goal_set_at), first_lesson_at, first_practice_at, second_session_at)
            ELSE NULL::timestamp with time zone
        END AS activated_at
   FROM base
  WHERE learner_key IS NOT NULL AND cohort_at IS NOT NULL;
CREATE VIEW public."hlo_analytics_retention_activity" WITH (security_invoker=true) AS  SELECT f.learner_key,
    (f.cohort_at AT TIME ZONE 'UTC'::text)::date AS cohort_date,
    (e.occurred_at AT TIME ZONE 'UTC'::text)::date AS activity_date,
    (e.occurred_at AT TIME ZONE 'UTC'::text)::date - (f.cohort_at AT TIME ZONE 'UTC'::text)::date AS cohort_day,
    f.acquisition_source,
    f.capability,
    f.activated_at IS NOT NULL AS activated,
    bool_or(f.paid_at IS NOT NULL AND f.paid_at <= e.occurred_at) AS paid,
    count(*) AS meaningful_events
   FROM hlo_analytics_learner_funnel f
     JOIN hlo_analytics_events e ON COALESCE(e.user_id::text, e.subject_id::text) = f.learner_key
  WHERE NOT e.is_synthetic AND (e.event_name = ANY (ARRAY['lesson_completed'::text, 'practice_completed'::text, 'reassessment_completed'::text, 'weekly_review_completed'::text]))
  GROUP BY f.learner_key, ((f.cohort_at AT TIME ZONE 'UTC'::text)::date), ((e.occurred_at AT TIME ZONE 'UTC'::text)::date), f.acquisition_source, f.capability, f.activated_at, f.paid_at;
CREATE VIEW public."hlo_analytics_retention_summary" WITH (security_invoker=true) AS  WITH learners AS (
         SELECT DISTINCT hlo_analytics_retention_activity.learner_key,
            hlo_analytics_retention_activity.cohort_date,
            hlo_analytics_retention_activity.acquisition_source,
            hlo_analytics_retention_activity.capability
           FROM hlo_analytics_retention_activity
        ), activity AS (
         SELECT hlo_analytics_retention_activity.learner_key,
            bool_or(hlo_analytics_retention_activity.cohort_day = 1) AS d1_active,
            bool_or(hlo_analytics_retention_activity.cohort_day = 7) AS d7_active,
            bool_or(hlo_analytics_retention_activity.cohort_day = 30) AS d30_active
           FROM hlo_analytics_retention_activity
          GROUP BY hlo_analytics_retention_activity.learner_key
        )
 SELECT l.cohort_date,
    l.acquisition_source,
    l.capability,
    count(*) AS cohort_size,
    count(*) FILTER (WHERE a.d1_active) AS d1_retained,
    count(*) FILTER (WHERE a.d7_active) AS d7_retained,
    count(*) FILTER (WHERE a.d30_active) AS d30_retained,
    round(100.0 * count(*) FILTER (WHERE a.d7_active)::numeric / NULLIF(count(*), 0)::numeric, 2) AS d7_retention_pct,
    round(100.0 * count(*) FILTER (WHERE a.d30_active)::numeric / NULLIF(count(*), 0)::numeric, 2) AS d30_retention_pct
   FROM learners l
     JOIN activity a USING (learner_key)
  GROUP BY l.cohort_date, l.acquisition_source, l.capability;
CREATE VIEW public."hlo_lifecycle_candidates" WITH (security_invoker=true) AS  WITH e AS (
         SELECT COALESCE(hlo_analytics_events.user_id::text, hlo_analytics_events.subject_id::text) AS learner_key,
            hlo_analytics_events.user_id,
            hlo_analytics_events.subject_id,
            hlo_analytics_events.event_name,
            hlo_analytics_events.occurred_at,
            hlo_analytics_events.properties
           FROM hlo_analytics_events
          WHERE NOT hlo_analytics_events.is_synthetic
        ), agg AS (
         SELECT e.learner_key,
            (array_agg(e.user_id) FILTER (WHERE e.user_id IS NOT NULL))[1] AS user_id,
            (array_agg(e.subject_id) FILTER (WHERE e.subject_id IS NOT NULL))[1] AS subject_id,
            min(e.occurred_at) FILTER (WHERE e.event_name = 'baseline_started'::text) AS baseline_started_at,
            min(e.occurred_at) FILTER (WHERE e.event_name = 'baseline_completed'::text) AS baseline_completed_at,
            min(e.occurred_at) FILTER (WHERE e.event_name = 'capability_map_viewed'::text) AS map_at,
            min(e.occurred_at) FILTER (WHERE e.event_name = 'lesson_started'::text) AS lesson_started_at,
            min(e.occurred_at) FILTER (WHERE e.event_name = 'lesson_completed'::text) AS lesson_completed_at,
            min(e.occurred_at) FILTER (WHERE e.event_name = 'practice_started'::text) AS practice_started_at,
            min(e.occurred_at) FILTER (WHERE e.event_name = 'practice_completed'::text) AS practice_completed_at,
            min(e.occurred_at) FILTER (WHERE e.event_name = 'session_returned'::text) AS returned_at,
            min(e.occurred_at) FILTER (WHERE e.event_name = 'paywall_viewed'::text) AS paywall_at,
            min(e.occurred_at) FILTER (WHERE e.event_name = 'subscription_started'::text) AS paid_at,
            max(e.occurred_at) AS last_activity_at
           FROM e
          WHERE e.learner_key IS NOT NULL
          GROUP BY e.learner_key
        )
 SELECT learner_key,
    user_id,
    subject_id,
    state_code,
    triggered_at,
    recommended_action
   FROM ( SELECT agg.learner_key,
            agg.user_id,
            agg.subject_id,
            'baseline_incomplete'::text AS state_code,
            agg.baseline_started_at AS triggered_at,
            'Resume Baseline'::text AS recommended_action
           FROM agg
          WHERE agg.baseline_started_at IS NOT NULL AND agg.baseline_completed_at IS NULL
        UNION ALL
         SELECT agg.learner_key,
            agg.user_id,
            agg.subject_id,
            'map_no_lesson'::text,
            agg.map_at,
            'Start first lesson'::text
           FROM agg
          WHERE agg.map_at IS NOT NULL AND agg.lesson_started_at IS NULL
        UNION ALL
         SELECT agg.learner_key,
            agg.user_id,
            agg.subject_id,
            'lesson_no_practice'::text,
            agg.lesson_completed_at,
            'Do first practice'::text
           FROM agg
          WHERE agg.lesson_completed_at IS NOT NULL AND agg.practice_started_at IS NULL
        UNION ALL
         SELECT agg.learner_key,
            agg.user_id,
            agg.subject_id,
            'practice_no_return'::text,
            agg.practice_completed_at,
            'Resume next action'::text
           FROM agg
          WHERE agg.practice_completed_at IS NOT NULL AND agg.returned_at IS NULL AND agg.practice_completed_at <= (now() - '48:00:00'::interval)
        UNION ALL
         SELECT agg.learner_key,
            agg.user_id,
            agg.subject_id,
            'paywall_no_conversion'::text,
            agg.paywall_at,
            'Continue learning'::text
           FROM agg
          WHERE agg.paywall_at IS NOT NULL AND agg.paid_at IS NULL) q;
CREATE VIEW public."hlo_analytics_content_to_learning" WITH (security_invoker=true) AS  WITH touch AS (
         SELECT hlo_analytics_attribution_touches.id,
            COALESCE(hlo_analytics_attribution_touches.user_id::text, hlo_analytics_attribution_touches.subject_id::text) AS learner_key,
            hlo_analytics_attribution_touches.subject_id,
            hlo_analytics_attribution_touches.user_id,
            hlo_analytics_attribution_touches.touch_type,
            hlo_analytics_attribution_touches.source,
            hlo_analytics_attribution_touches.medium,
            hlo_analytics_attribution_touches.campaign,
            hlo_analytics_attribution_touches.content_id,
            hlo_analytics_attribution_touches.creative_id,
            hlo_analytics_attribution_touches.capability_interest,
            hlo_analytics_attribution_touches.landing_path,
            hlo_analytics_attribution_touches.occurred_at
           FROM hlo_analytics_attribution_touches
          WHERE NOT hlo_analytics_attribution_touches.is_synthetic AND COALESCE(hlo_analytics_attribution_touches.user_id::text, hlo_analytics_attribution_touches.subject_id::text) IS NOT NULL
        ), d7 AS (
         SELECT hlo_analytics_retention_activity.learner_key,
            bool_or(hlo_analytics_retention_activity.cohort_day >= 1 AND hlo_analytics_retention_activity.cohort_day <= 7 AND hlo_analytics_retention_activity.meaningful_events > 0) AS d7_retained
           FROM hlo_analytics_retention_activity
          GROUP BY hlo_analytics_retention_activity.learner_key
        )
 SELECT t.id AS touch_id,
    t.learner_key,
    t.subject_id,
    t.user_id,
    t.touch_type,
    t.source,
    t.medium,
    t.campaign,
    t.content_id,
    t.creative_id,
    t.capability_interest,
    t.landing_path,
    t.occurred_at,
    f.cohort_at,
    f.baseline_completed_at,
    f.first_lesson_at,
    f.first_practice_at,
    f.second_session_at,
    f.activated_at,
    f.paid_at,
    f.baseline_completed_at IS NOT NULL AS baseline_completed,
    f.first_practice_at IS NOT NULL AS practice_completed,
    f.activated_at IS NOT NULL AS activated,
    COALESCE(d7.d7_retained, false) AS d7_retained,
    f.paid_at IS NOT NULL AS paid
   FROM touch t
     LEFT JOIN hlo_analytics_learner_funnel f USING (learner_key)
     LEFT JOIN d7 USING (learner_key);
CREATE VIEW public."hlo_analytics_content_source_quality" WITH (security_invoker=true) AS  SELECT source,
    COALESCE(content_id, '(none)'::text) AS content_id,
    COALESCE(campaign, '(none)'::text) AS campaign,
    count(*) AS qualified_touches,
    count(*) FILTER (WHERE baseline_completed) AS baseline_completers,
    count(*) FILTER (WHERE practice_completed) AS practice_completers,
    count(*) FILTER (WHERE activated) AS activated_learners,
    round(1000.0 * count(*) FILTER (WHERE activated)::numeric / NULLIF(count(*), 0)::numeric, 2) AS activated_per_1000_touches,
    count(*) FILTER (WHERE d7_retained) AS d7_retained_learners,
    round(100.0 * count(*) FILTER (WHERE d7_retained)::numeric / NULLIF(count(*) FILTER (WHERE activated), 0)::numeric, 2) AS d7_retention_pct_of_activated,
    count(*) FILTER (WHERE paid) AS paid_learners
   FROM hlo_analytics_content_to_learning
  GROUP BY source, (COALESCE(content_id, '(none)'::text)), (COALESCE(campaign, '(none)'::text));
CREATE POLICY "hlo_skill_scores_delete_own" ON public."hlo_skill_scores" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "hlo_skill_scores_insert_own" ON public."hlo_skill_scores" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "hlo_skill_scores_select_own" ON public."hlo_skill_scores" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "hlo_skill_scores_update_own" ON public."hlo_skill_scores" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((( SELECT auth.uid() AS uid) = user_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "hlo_missions_delete_own" ON public."hlo_missions" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "hlo_missions_insert_own" ON public."hlo_missions" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "hlo_missions_select_own" ON public."hlo_missions" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "hlo_missions_update_own" ON public."hlo_missions" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((( SELECT auth.uid() AS uid) = user_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "hlo_trading_logs_delete_own" ON public."hlo_trading_logs" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "hlo_trading_logs_insert_own" ON public."hlo_trading_logs" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "hlo_trading_logs_select_own" ON public."hlo_trading_logs" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "hlo_trading_logs_update_own" ON public."hlo_trading_logs" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((( SELECT auth.uid() AS uid) = user_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "hlo_tutor_threads_delete_own" ON public."hlo_tutor_threads" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "hlo_tutor_threads_insert_own" ON public."hlo_tutor_threads" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "hlo_tutor_threads_select_own" ON public."hlo_tutor_threads" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "hlo_tutor_threads_update_own" ON public."hlo_tutor_threads" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((( SELECT auth.uid() AS uid) = user_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "hlo_tutor_messages_delete_own" ON public."hlo_tutor_messages" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "hlo_tutor_messages_insert_own" ON public."hlo_tutor_messages" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "hlo_tutor_messages_select_own" ON public."hlo_tutor_messages" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "hlo_tutor_messages_update_own" ON public."hlo_tutor_messages" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((( SELECT auth.uid() AS uid) = user_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "hlo_certificates_delete_own" ON public."hlo_certificates" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "hlo_certificates_insert_own" ON public."hlo_certificates" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "hlo_certificates_select_own" ON public."hlo_certificates" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "hlo_certificates_update_own" ON public."hlo_certificates" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((( SELECT auth.uid() AS uid) = user_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "hlo_recommendations_delete_own" ON public."hlo_recommendation_snapshots" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "hlo_recommendations_insert_own" ON public."hlo_recommendation_snapshots" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "hlo_recommendations_select_own" ON public."hlo_recommendation_snapshots" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "hlo_recommendations_update_own" ON public."hlo_recommendation_snapshots" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((( SELECT auth.uid() AS uid) = user_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "hlo_mission_templates_read" ON public."hlo_mission_templates" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((active = true));
CREATE POLICY "hlo_question_bank_read" ON public."hlo_question_bank" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((active = true));
CREATE POLICY "hlo_research_items_read" ON public."hlo_research_items" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);
CREATE POLICY "hlo_profiles_delete_own" ON public."hlo_profiles" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "hlo_profiles_insert_own" ON public."hlo_profiles" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "hlo_profiles_select_own" ON public."hlo_profiles" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "hlo_profiles_update_own" ON public."hlo_profiles" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((( SELECT auth.uid() AS uid) = user_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "hlo_lesson_progress_delete_own" ON public."hlo_lesson_progress" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "hlo_lesson_progress_insert_own" ON public."hlo_lesson_progress" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "hlo_lesson_progress_select_own" ON public."hlo_lesson_progress" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "hlo_lesson_progress_update_own" ON public."hlo_lesson_progress" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((( SELECT auth.uid() AS uid) = user_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "hlo_quiz_attempts_delete_own" ON public."hlo_quiz_attempts" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "hlo_quiz_attempts_insert_own" ON public."hlo_quiz_attempts" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "hlo_quiz_attempts_select_own" ON public."hlo_quiz_attempts" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "hlo_quiz_attempts_update_own" ON public."hlo_quiz_attempts" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((( SELECT auth.uid() AS uid) = user_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "hlo_plan_progress_delete_own" ON public."hlo_plan_progress" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "hlo_plan_progress_insert_own" ON public."hlo_plan_progress" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "hlo_plan_progress_select_own" ON public."hlo_plan_progress" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "hlo_plan_progress_update_own" ON public."hlo_plan_progress" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((( SELECT auth.uid() AS uid) = user_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "hlo_analytics_subjects_select_self" ON public."hlo_analytics_subjects" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "hlo_analytics_event_contracts_read_authenticated" ON public."hlo_analytics_event_contracts" AS PERMISSIVE FOR SELECT TO "authenticated" USING (active);
CREATE POLICY "hlo_analytics_metric_definitions_internal_only" ON public."hlo_analytics_metric_definitions" AS PERMISSIVE FOR ALL TO "anon","authenticated" USING (false) WITH CHECK (false);
CREATE POLICY "hlo_analytics_identity_links_internal_only" ON public."hlo_analytics_identity_links" AS PERMISSIVE FOR ALL TO "anon","authenticated" USING (false) WITH CHECK (false);
CREATE POLICY "hlo_analytics_attribution_internal_only" ON public."hlo_analytics_attribution_touches" AS PERMISSIVE FOR ALL TO "anon","authenticated" USING (false) WITH CHECK (false);
CREATE POLICY "hlo_analytics_experiments_internal_only" ON public."hlo_analytics_experiments" AS PERMISSIVE FOR ALL TO "anon","authenticated" USING (false) WITH CHECK (false);
CREATE POLICY "hlo_analytics_exposures_internal_only" ON public."hlo_analytics_experiment_exposures" AS PERMISSIVE FOR ALL TO "anon","authenticated" USING (false) WITH CHECK (false);
CREATE POLICY "hlo_analytics_ai_usage_internal_only" ON public."hlo_analytics_ai_usage" AS PERMISSIVE FOR ALL TO "anon","authenticated" USING (false) WITH CHECK (false);
CREATE POLICY "hlo_analytics_cost_ledger_internal_only" ON public."hlo_analytics_cost_ledger" AS PERMISSIVE FOR ALL TO "anon","authenticated" USING (false) WITH CHECK (false);
CREATE POLICY "hlo_analytics_revenue_ledger_internal_only" ON public."hlo_analytics_revenue_ledger" AS PERMISSIVE FOR ALL TO "anon","authenticated" USING (false) WITH CHECK (false);
CREATE POLICY "hlo_analytics_consents_insert_self" ON public."hlo_analytics_consents" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((( SELECT auth.uid() AS uid) = user_id) AND (subject_id IS NULL)));
CREATE POLICY "hlo_analytics_consents_select_self" ON public."hlo_analytics_consents" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "hlo_analytics_sessions_insert_self" ON public."hlo_analytics_sessions" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((( SELECT auth.uid() AS uid) = user_id) AND (is_synthetic = false) AND ((subject_id IS NULL) OR (EXISTS ( SELECT 1
   FROM hlo_analytics_subjects s
  WHERE ((s.id = hlo_analytics_sessions.subject_id) AND (s.user_id = ( SELECT auth.uid() AS uid)))))) AND COALESCE(( SELECT c.analytics_allowed
   FROM hlo_analytics_consents c
  WHERE (c.user_id = ( SELECT auth.uid() AS uid))
  ORDER BY c.created_at DESC
 LIMIT 1), false)));
CREATE POLICY "hlo_analytics_sessions_select_self" ON public."hlo_analytics_sessions" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "hlo_analytics_sessions_update_self" ON public."hlo_analytics_sessions" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((( SELECT auth.uid() AS uid) = user_id)) WITH CHECK (((( SELECT auth.uid() AS uid) = user_id) AND (is_synthetic = false)));
CREATE POLICY "hlo_analytics_events_insert_self" ON public."hlo_analytics_events" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((( SELECT auth.uid() AS uid) = user_id) AND (is_synthetic = false) AND (consent_basis = 'explicit_analytics'::text) AND ((subject_id IS NULL) OR (EXISTS ( SELECT 1
   FROM hlo_analytics_subjects s
  WHERE ((s.id = hlo_analytics_events.subject_id) AND (s.user_id = ( SELECT auth.uid() AS uid)))))) AND COALESCE(( SELECT c.analytics_allowed
   FROM hlo_analytics_consents c
  WHERE (c.user_id = ( SELECT auth.uid() AS uid))
  ORDER BY c.created_at DESC
 LIMIT 1), false)));
CREATE POLICY "hlo_analytics_events_select_self" ON public."hlo_analytics_events" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "hlo_analytics_baseline_insert_self" ON public."hlo_analytics_baseline_results" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((( SELECT auth.uid() AS uid) = user_id) AND (is_synthetic = false) AND ((subject_id IS NULL) OR (EXISTS ( SELECT 1
   FROM hlo_analytics_subjects s
  WHERE ((s.id = hlo_analytics_baseline_results.subject_id) AND (s.user_id = ( SELECT auth.uid() AS uid))))))));
CREATE POLICY "hlo_analytics_baseline_select_self" ON public."hlo_analytics_baseline_results" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "hlo_analytics_learning_snapshots_insert_self" ON public."hlo_analytics_learning_state_snapshots" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((( SELECT auth.uid() AS uid) = user_id) AND (is_synthetic = false)));
CREATE POLICY "hlo_analytics_learning_snapshots_select_self" ON public."hlo_analytics_learning_state_snapshots" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "hlo_owner_users_select_self" ON public."hlo_owner_users" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((auth.uid() = user_id));
CREATE POLICY "hlo_intakes_delete_own" ON public."hlo_personalization_intakes" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((auth.uid() = user_id));
CREATE POLICY "hlo_intakes_insert_own" ON public."hlo_personalization_intakes" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "hlo_intakes_select_own" ON public."hlo_personalization_intakes" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((auth.uid() = user_id));
CREATE POLICY "hlo_intakes_update_own" ON public."hlo_personalization_intakes" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "hlo_curricula_delete_own" ON public."hlo_custom_curricula" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((auth.uid() = user_id));
CREATE POLICY "hlo_curricula_insert_own" ON public."hlo_custom_curricula" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "hlo_curricula_select_own" ON public."hlo_custom_curricula" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((auth.uid() = user_id));
CREATE POLICY "hlo_curricula_update_own" ON public."hlo_custom_curricula" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "hlo_custom_progress_delete_own" ON public."hlo_custom_module_progress" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((auth.uid() = user_id));
CREATE POLICY "hlo_custom_progress_insert_own" ON public."hlo_custom_module_progress" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "hlo_custom_progress_select_own" ON public."hlo_custom_module_progress" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((auth.uid() = user_id));
CREATE POLICY "hlo_custom_progress_update_own" ON public."hlo_custom_module_progress" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "hlo_agent_registry_read" ON public."hlo_curriculum_agent_registry" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((active = true));
CREATE POLICY "hlo_agent_runs_select_own" ON public."hlo_curriculum_agent_runs" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((auth.uid() = user_id));
CREATE POLICY "hlo_lab_drafts_delete_own" ON public."hlo_lab_drafts" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "hlo_lab_drafts_insert_own" ON public."hlo_lab_drafts" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "hlo_lab_drafts_select_own" ON public."hlo_lab_drafts" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "hlo_lab_drafts_update_own" ON public."hlo_lab_drafts" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((( SELECT auth.uid() AS uid) = user_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "hlo_events_insert_authenticated" ON public."hlo_events" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "hlo_events_select_own" ON public."hlo_events" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "hlo_user_settings_delete_own" ON public."hlo_user_settings" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "hlo_user_settings_insert_own" ON public."hlo_user_settings" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "hlo_user_settings_select_own" ON public."hlo_user_settings" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "hlo_user_settings_update_own" ON public."hlo_user_settings" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((( SELECT auth.uid() AS uid) = user_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "hlo_module_notes_delete_own" ON public."hlo_module_notes" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "hlo_module_notes_insert_own" ON public."hlo_module_notes" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "hlo_module_notes_select_own" ON public."hlo_module_notes" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "hlo_module_notes_update_own" ON public."hlo_module_notes" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((( SELECT auth.uid() AS uid) = user_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "hlo_saved_sources_delete_own" ON public."hlo_saved_sources" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "hlo_saved_sources_insert_own" ON public."hlo_saved_sources" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "hlo_saved_sources_select_own" ON public."hlo_saved_sources" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "hlo_saved_sources_update_own" ON public."hlo_saved_sources" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((( SELECT auth.uid() AS uid) = user_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "hlo_support_requests_insert_own" ON public."hlo_support_requests" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "hlo_support_requests_select_own" ON public."hlo_support_requests" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "hlo_capability_events_select_self" ON public."hlo_capability_events" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "hlo_lab_attempts_delete_self" ON public."hlo_lab_attempts" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "hlo_lab_attempts_insert_self" ON public."hlo_lab_attempts" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "hlo_lab_attempts_select_self" ON public."hlo_lab_attempts" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "hlo_lab_attempts_update_self" ON public."hlo_lab_attempts" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((( SELECT auth.uid() AS uid) = user_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "hlo_capability_profiles_select_self" ON public."hlo_capability_profiles" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "hlo_module_reflections_delete_own" ON public."hlo_module_reflections" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((auth.uid() = user_id));
CREATE POLICY "hlo_module_reflections_insert_own" ON public."hlo_module_reflections" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "hlo_module_reflections_select_own" ON public."hlo_module_reflections" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((auth.uid() = user_id));
CREATE POLICY "hlo_module_reflections_update_own" ON public."hlo_module_reflections" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "hlo_frontier_signals_owner_write" ON public."hlo_frontier_signals" AS PERMISSIVE FOR ALL TO PUBLIC USING (hlo_is_owner()) WITH CHECK (hlo_is_owner());
CREATE POLICY "hlo_frontier_signals_read" ON public."hlo_frontier_signals" AS PERMISSIVE FOR SELECT TO PUBLIC USING (true);
CREATE POLICY "hlo_opportunities_delete_own" ON public."hlo_opportunities" AS PERMISSIVE FOR DELETE TO PUBLIC USING ((auth.uid() = user_id));
CREATE POLICY "hlo_opportunities_insert_own" ON public."hlo_opportunities" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "hlo_opportunities_select_own" ON public."hlo_opportunities" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((auth.uid() = user_id));
CREATE POLICY "hlo_opportunities_update_own" ON public."hlo_opportunities" AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "hlo_leverage_delete_own" ON public."hlo_leverage_snapshots" AS PERMISSIVE FOR DELETE TO PUBLIC USING ((auth.uid() = user_id));
CREATE POLICY "hlo_leverage_insert_own" ON public."hlo_leverage_snapshots" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "hlo_leverage_select_own" ON public."hlo_leverage_snapshots" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((auth.uid() = user_id));
CREATE POLICY "hlo_owner_private_select_owner" ON public."hlo_owner_private_content" AS PERMISSIVE FOR SELECT TO PUBLIC USING (hlo_is_owner());
CREATE POLICY "hlo_owner_private_write_owner" ON public."hlo_owner_private_content" AS PERMISSIVE FOR ALL TO PUBLIC USING (hlo_is_owner()) WITH CHECK (hlo_is_owner());
CREATE POLICY "hlo_empire_insert_owner" ON public."hlo_owner_empire_capstone" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((hlo_is_owner() AND (auth.uid() = owner_user_id)));
CREATE POLICY "hlo_empire_select_owner" ON public."hlo_owner_empire_capstone" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((hlo_is_owner() AND (auth.uid() = owner_user_id)));
CREATE POLICY "hlo_empire_update_owner" ON public."hlo_owner_empire_capstone" AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((hlo_is_owner() AND (auth.uid() = owner_user_id))) WITH CHECK ((hlo_is_owner() AND (auth.uid() = owner_user_id)));
CREATE POLICY "hlo_privacy_receipts_deny_clients" ON public."hlo_privacy_request_receipts" AS RESTRICTIVE FOR ALL TO "anon","authenticated" USING (false) WITH CHECK (false);
CREATE POLICY "hlo_attention_enrollment_owner_read" ON public."hlo_attention_enrollments" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "hlo_attention_progress_owner_read" ON public."hlo_attention_day_progress" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "hlo_billing_entitlement_owner_read" ON public."hlo_billing_entitlements" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "hlo_billing_webhook_deny_clients" ON public."hlo_billing_webhook_events" AS RESTRICTIVE FOR ALL TO "anon","authenticated" USING (false) WITH CHECK (false);
CREATE POLICY "hlo_billing_dunning_deny_clients" ON public."hlo_billing_dunning_outbox" AS RESTRICTIVE FOR ALL TO "anon","authenticated" USING (false) WITH CHECK (false);
CREATE POLICY "hlo_legal_consents_owner_read" ON public."hlo_legal_consents" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "hlo_attention_curriculum_authenticated_read" ON public."hlo_attention_curriculum_days" AS PERMISSIVE FOR SELECT TO "authenticated" USING (active);
REVOKE ALL ON public."hlo_asset_cache_v2" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public."hlo_skill_scores" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public."hlo_missions" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public."hlo_trading_logs" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public."hlo_tutor_threads" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public."hlo_tutor_messages" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public."hlo_certificates" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public."hlo_recommendation_snapshots" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public."hlo_mission_templates" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public."hlo_question_bank" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public."hlo_research_items" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public."hlo_profiles" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public."hlo_lesson_progress" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public."hlo_quiz_attempts" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public."hlo_plan_progress" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public."hlo_frontend_chunks" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public."hlo_asset_cache" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public."hlo_analytics_subjects" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public."hlo_analytics_event_contracts" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public."hlo_analytics_metric_definitions" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public."hlo_analytics_identity_links" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public."hlo_analytics_attribution_touches" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public."hlo_analytics_experiments" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public."hlo_analytics_experiment_exposures" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public."hlo_analytics_ai_usage" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public."hlo_analytics_cost_ledger" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public."hlo_analytics_revenue_ledger" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public."hlo_analytics_consents" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public."hlo_analytics_sessions" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public."hlo_analytics_events" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public."hlo_analytics_baseline_results" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public."hlo_analytics_learning_state_snapshots" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public."hlo_owner_users" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public."hlo_personalization_intakes" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public."hlo_custom_curricula" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public."hlo_custom_module_progress" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public."hlo_curriculum_agent_registry" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public."hlo_asset_cache_v3" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public."hlo_curriculum_agent_runs" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public."hlo_app_assets_v4" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public."hlo_app_assets_backup_20260902" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public."hlo_ai_guide_eval_results" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public."hlo_ai_guide_eval_runs" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public."hlo_ai_guide_eval_cases" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public."hlo_lab_drafts" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public."hlo_events" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public."hlo_lifecycle_interventions" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public."hlo_lifecycle_state_definitions" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public."hlo_live_asset_inspect" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public."hlo_qaqc_runs" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public."hlo_user_settings" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public."hlo_module_notes" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public."hlo_saved_sources" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public."hlo_support_requests" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public."hlo_capability_events" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public."hlo_lab_attempts" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public."hlo_capability_profiles" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public."hlo_module_reflections" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public."hlo_frontier_signals" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public."hlo_opportunities" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public."hlo_leverage_snapshots" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public."hlo_owner_private_content" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public."hlo_owner_empire_capstone" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public."hlo_privacy_request_receipts" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public."hlo_attention_enrollments" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public."hlo_attention_day_progress" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public."hlo_billing_entitlements" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public."hlo_billing_webhook_events" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public."hlo_billing_dunning_outbox" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public."hlo_legal_consents" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public."hlo_attention_curriculum_days" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public."hlo_analytics_daily_funnel" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public."hlo_analytics_ai_economics_daily" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public."hlo_analytics_unit_economics_daily" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public."hlo_analytics_learner_funnel" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public."hlo_analytics_retention_activity" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public."hlo_analytics_retention_summary" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public."hlo_lifecycle_candidates" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public."hlo_analytics_content_to_learning" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public."hlo_analytics_content_source_quality" FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT ON public."hlo_asset_cache_v2" TO "service_role";
GRANT SELECT ON public."hlo_asset_cache_v2" TO "service_role";
GRANT UPDATE ON public."hlo_asset_cache_v2" TO "service_role";
GRANT DELETE ON public."hlo_asset_cache_v2" TO "service_role";
GRANT TRUNCATE ON public."hlo_asset_cache_v2" TO "service_role";
GRANT REFERENCES ON public."hlo_asset_cache_v2" TO "service_role";
GRANT TRIGGER ON public."hlo_asset_cache_v2" TO "service_role";
GRANT INSERT ON public."hlo_skill_scores" TO "service_role";
GRANT SELECT ON public."hlo_skill_scores" TO "service_role";
GRANT UPDATE ON public."hlo_skill_scores" TO "service_role";
GRANT DELETE ON public."hlo_skill_scores" TO "service_role";
GRANT TRUNCATE ON public."hlo_skill_scores" TO "service_role";
GRANT REFERENCES ON public."hlo_skill_scores" TO "service_role";
GRANT TRIGGER ON public."hlo_skill_scores" TO "service_role";
GRANT INSERT ON public."hlo_skill_scores" TO "authenticated";
GRANT SELECT ON public."hlo_skill_scores" TO "authenticated";
GRANT UPDATE ON public."hlo_skill_scores" TO "authenticated";
GRANT DELETE ON public."hlo_skill_scores" TO "authenticated";
GRANT INSERT ON public."hlo_missions" TO "service_role";
GRANT SELECT ON public."hlo_missions" TO "service_role";
GRANT UPDATE ON public."hlo_missions" TO "service_role";
GRANT DELETE ON public."hlo_missions" TO "service_role";
GRANT TRUNCATE ON public."hlo_missions" TO "service_role";
GRANT REFERENCES ON public."hlo_missions" TO "service_role";
GRANT TRIGGER ON public."hlo_missions" TO "service_role";
GRANT INSERT ON public."hlo_missions" TO "authenticated";
GRANT SELECT ON public."hlo_missions" TO "authenticated";
GRANT UPDATE ON public."hlo_missions" TO "authenticated";
GRANT DELETE ON public."hlo_missions" TO "authenticated";
GRANT INSERT ON public."hlo_trading_logs" TO "service_role";
GRANT SELECT ON public."hlo_trading_logs" TO "service_role";
GRANT UPDATE ON public."hlo_trading_logs" TO "service_role";
GRANT DELETE ON public."hlo_trading_logs" TO "service_role";
GRANT TRUNCATE ON public."hlo_trading_logs" TO "service_role";
GRANT REFERENCES ON public."hlo_trading_logs" TO "service_role";
GRANT TRIGGER ON public."hlo_trading_logs" TO "service_role";
GRANT INSERT ON public."hlo_trading_logs" TO "authenticated";
GRANT SELECT ON public."hlo_trading_logs" TO "authenticated";
GRANT UPDATE ON public."hlo_trading_logs" TO "authenticated";
GRANT DELETE ON public."hlo_trading_logs" TO "authenticated";
GRANT INSERT ON public."hlo_tutor_threads" TO "service_role";
GRANT SELECT ON public."hlo_tutor_threads" TO "service_role";
GRANT UPDATE ON public."hlo_tutor_threads" TO "service_role";
GRANT DELETE ON public."hlo_tutor_threads" TO "service_role";
GRANT TRUNCATE ON public."hlo_tutor_threads" TO "service_role";
GRANT REFERENCES ON public."hlo_tutor_threads" TO "service_role";
GRANT TRIGGER ON public."hlo_tutor_threads" TO "service_role";
GRANT INSERT ON public."hlo_tutor_threads" TO "authenticated";
GRANT SELECT ON public."hlo_tutor_threads" TO "authenticated";
GRANT UPDATE ON public."hlo_tutor_threads" TO "authenticated";
GRANT DELETE ON public."hlo_tutor_threads" TO "authenticated";
GRANT INSERT ON public."hlo_tutor_messages" TO "service_role";
GRANT SELECT ON public."hlo_tutor_messages" TO "service_role";
GRANT UPDATE ON public."hlo_tutor_messages" TO "service_role";
GRANT DELETE ON public."hlo_tutor_messages" TO "service_role";
GRANT TRUNCATE ON public."hlo_tutor_messages" TO "service_role";
GRANT REFERENCES ON public."hlo_tutor_messages" TO "service_role";
GRANT TRIGGER ON public."hlo_tutor_messages" TO "service_role";
GRANT INSERT ON public."hlo_tutor_messages" TO "authenticated";
GRANT SELECT ON public."hlo_tutor_messages" TO "authenticated";
GRANT UPDATE ON public."hlo_tutor_messages" TO "authenticated";
GRANT DELETE ON public."hlo_tutor_messages" TO "authenticated";
GRANT INSERT ON public."hlo_certificates" TO "service_role";
GRANT SELECT ON public."hlo_certificates" TO "service_role";
GRANT UPDATE ON public."hlo_certificates" TO "service_role";
GRANT DELETE ON public."hlo_certificates" TO "service_role";
GRANT TRUNCATE ON public."hlo_certificates" TO "service_role";
GRANT REFERENCES ON public."hlo_certificates" TO "service_role";
GRANT TRIGGER ON public."hlo_certificates" TO "service_role";
GRANT INSERT ON public."hlo_certificates" TO "authenticated";
GRANT SELECT ON public."hlo_certificates" TO "authenticated";
GRANT UPDATE ON public."hlo_certificates" TO "authenticated";
GRANT DELETE ON public."hlo_certificates" TO "authenticated";
GRANT INSERT ON public."hlo_recommendation_snapshots" TO "service_role";
GRANT SELECT ON public."hlo_recommendation_snapshots" TO "service_role";
GRANT UPDATE ON public."hlo_recommendation_snapshots" TO "service_role";
GRANT DELETE ON public."hlo_recommendation_snapshots" TO "service_role";
GRANT TRUNCATE ON public."hlo_recommendation_snapshots" TO "service_role";
GRANT REFERENCES ON public."hlo_recommendation_snapshots" TO "service_role";
GRANT TRIGGER ON public."hlo_recommendation_snapshots" TO "service_role";
GRANT INSERT ON public."hlo_recommendation_snapshots" TO "authenticated";
GRANT SELECT ON public."hlo_recommendation_snapshots" TO "authenticated";
GRANT UPDATE ON public."hlo_recommendation_snapshots" TO "authenticated";
GRANT DELETE ON public."hlo_recommendation_snapshots" TO "authenticated";
GRANT INSERT ON public."hlo_mission_templates" TO "service_role";
GRANT SELECT ON public."hlo_mission_templates" TO "service_role";
GRANT UPDATE ON public."hlo_mission_templates" TO "service_role";
GRANT DELETE ON public."hlo_mission_templates" TO "service_role";
GRANT TRUNCATE ON public."hlo_mission_templates" TO "service_role";
GRANT REFERENCES ON public."hlo_mission_templates" TO "service_role";
GRANT TRIGGER ON public."hlo_mission_templates" TO "service_role";
GRANT SELECT ON public."hlo_mission_templates" TO "authenticated";
GRANT INSERT ON public."hlo_question_bank" TO "service_role";
GRANT SELECT ON public."hlo_question_bank" TO "service_role";
GRANT UPDATE ON public."hlo_question_bank" TO "service_role";
GRANT DELETE ON public."hlo_question_bank" TO "service_role";
GRANT TRUNCATE ON public."hlo_question_bank" TO "service_role";
GRANT REFERENCES ON public."hlo_question_bank" TO "service_role";
GRANT TRIGGER ON public."hlo_question_bank" TO "service_role";
GRANT INSERT ON public."hlo_research_items" TO "service_role";
GRANT SELECT ON public."hlo_research_items" TO "service_role";
GRANT UPDATE ON public."hlo_research_items" TO "service_role";
GRANT DELETE ON public."hlo_research_items" TO "service_role";
GRANT TRUNCATE ON public."hlo_research_items" TO "service_role";
GRANT REFERENCES ON public."hlo_research_items" TO "service_role";
GRANT TRIGGER ON public."hlo_research_items" TO "service_role";
GRANT SELECT ON public."hlo_research_items" TO "authenticated";
GRANT INSERT ON public."hlo_profiles" TO "service_role";
GRANT SELECT ON public."hlo_profiles" TO "service_role";
GRANT UPDATE ON public."hlo_profiles" TO "service_role";
GRANT DELETE ON public."hlo_profiles" TO "service_role";
GRANT TRUNCATE ON public."hlo_profiles" TO "service_role";
GRANT REFERENCES ON public."hlo_profiles" TO "service_role";
GRANT TRIGGER ON public."hlo_profiles" TO "service_role";
GRANT INSERT ON public."hlo_profiles" TO "authenticated";
GRANT SELECT ON public."hlo_profiles" TO "authenticated";
GRANT UPDATE ON public."hlo_profiles" TO "authenticated";
GRANT DELETE ON public."hlo_profiles" TO "authenticated";
GRANT INSERT ON public."hlo_lesson_progress" TO "service_role";
GRANT SELECT ON public."hlo_lesson_progress" TO "service_role";
GRANT UPDATE ON public."hlo_lesson_progress" TO "service_role";
GRANT DELETE ON public."hlo_lesson_progress" TO "service_role";
GRANT TRUNCATE ON public."hlo_lesson_progress" TO "service_role";
GRANT REFERENCES ON public."hlo_lesson_progress" TO "service_role";
GRANT TRIGGER ON public."hlo_lesson_progress" TO "service_role";
GRANT INSERT ON public."hlo_lesson_progress" TO "authenticated";
GRANT SELECT ON public."hlo_lesson_progress" TO "authenticated";
GRANT UPDATE ON public."hlo_lesson_progress" TO "authenticated";
GRANT DELETE ON public."hlo_lesson_progress" TO "authenticated";
GRANT INSERT ON public."hlo_quiz_attempts" TO "service_role";
GRANT SELECT ON public."hlo_quiz_attempts" TO "service_role";
GRANT UPDATE ON public."hlo_quiz_attempts" TO "service_role";
GRANT DELETE ON public."hlo_quiz_attempts" TO "service_role";
GRANT TRUNCATE ON public."hlo_quiz_attempts" TO "service_role";
GRANT REFERENCES ON public."hlo_quiz_attempts" TO "service_role";
GRANT TRIGGER ON public."hlo_quiz_attempts" TO "service_role";
GRANT INSERT ON public."hlo_quiz_attempts" TO "authenticated";
GRANT SELECT ON public."hlo_quiz_attempts" TO "authenticated";
GRANT UPDATE ON public."hlo_quiz_attempts" TO "authenticated";
GRANT DELETE ON public."hlo_quiz_attempts" TO "authenticated";
GRANT INSERT ON public."hlo_plan_progress" TO "service_role";
GRANT SELECT ON public."hlo_plan_progress" TO "service_role";
GRANT UPDATE ON public."hlo_plan_progress" TO "service_role";
GRANT DELETE ON public."hlo_plan_progress" TO "service_role";
GRANT TRUNCATE ON public."hlo_plan_progress" TO "service_role";
GRANT REFERENCES ON public."hlo_plan_progress" TO "service_role";
GRANT TRIGGER ON public."hlo_plan_progress" TO "service_role";
GRANT INSERT ON public."hlo_plan_progress" TO "authenticated";
GRANT SELECT ON public."hlo_plan_progress" TO "authenticated";
GRANT UPDATE ON public."hlo_plan_progress" TO "authenticated";
GRANT DELETE ON public."hlo_plan_progress" TO "authenticated";
GRANT INSERT ON public."hlo_frontend_chunks" TO "service_role";
GRANT SELECT ON public."hlo_frontend_chunks" TO "service_role";
GRANT UPDATE ON public."hlo_frontend_chunks" TO "service_role";
GRANT DELETE ON public."hlo_frontend_chunks" TO "service_role";
GRANT TRUNCATE ON public."hlo_frontend_chunks" TO "service_role";
GRANT REFERENCES ON public."hlo_frontend_chunks" TO "service_role";
GRANT TRIGGER ON public."hlo_frontend_chunks" TO "service_role";
GRANT INSERT ON public."hlo_asset_cache" TO "service_role";
GRANT SELECT ON public."hlo_asset_cache" TO "service_role";
GRANT UPDATE ON public."hlo_asset_cache" TO "service_role";
GRANT DELETE ON public."hlo_asset_cache" TO "service_role";
GRANT TRUNCATE ON public."hlo_asset_cache" TO "service_role";
GRANT REFERENCES ON public."hlo_asset_cache" TO "service_role";
GRANT TRIGGER ON public."hlo_asset_cache" TO "service_role";
GRANT INSERT ON public."hlo_analytics_subjects" TO "service_role";
GRANT SELECT ON public."hlo_analytics_subjects" TO "service_role";
GRANT UPDATE ON public."hlo_analytics_subjects" TO "service_role";
GRANT DELETE ON public."hlo_analytics_subjects" TO "service_role";
GRANT TRUNCATE ON public."hlo_analytics_subjects" TO "service_role";
GRANT REFERENCES ON public."hlo_analytics_subjects" TO "service_role";
GRANT TRIGGER ON public."hlo_analytics_subjects" TO "service_role";
GRANT SELECT ON public."hlo_analytics_subjects" TO "authenticated";
GRANT INSERT ON public."hlo_analytics_event_contracts" TO "service_role";
GRANT SELECT ON public."hlo_analytics_event_contracts" TO "service_role";
GRANT UPDATE ON public."hlo_analytics_event_contracts" TO "service_role";
GRANT DELETE ON public."hlo_analytics_event_contracts" TO "service_role";
GRANT TRUNCATE ON public."hlo_analytics_event_contracts" TO "service_role";
GRANT REFERENCES ON public."hlo_analytics_event_contracts" TO "service_role";
GRANT TRIGGER ON public."hlo_analytics_event_contracts" TO "service_role";
GRANT SELECT ON public."hlo_analytics_event_contracts" TO "authenticated";
GRANT INSERT ON public."hlo_analytics_metric_definitions" TO "service_role";
GRANT SELECT ON public."hlo_analytics_metric_definitions" TO "service_role";
GRANT UPDATE ON public."hlo_analytics_metric_definitions" TO "service_role";
GRANT DELETE ON public."hlo_analytics_metric_definitions" TO "service_role";
GRANT TRUNCATE ON public."hlo_analytics_metric_definitions" TO "service_role";
GRANT REFERENCES ON public."hlo_analytics_metric_definitions" TO "service_role";
GRANT TRIGGER ON public."hlo_analytics_metric_definitions" TO "service_role";
GRANT INSERT ON public."hlo_analytics_identity_links" TO "service_role";
GRANT SELECT ON public."hlo_analytics_identity_links" TO "service_role";
GRANT UPDATE ON public."hlo_analytics_identity_links" TO "service_role";
GRANT DELETE ON public."hlo_analytics_identity_links" TO "service_role";
GRANT TRUNCATE ON public."hlo_analytics_identity_links" TO "service_role";
GRANT REFERENCES ON public."hlo_analytics_identity_links" TO "service_role";
GRANT TRIGGER ON public."hlo_analytics_identity_links" TO "service_role";
GRANT INSERT ON public."hlo_analytics_attribution_touches" TO "service_role";
GRANT SELECT ON public."hlo_analytics_attribution_touches" TO "service_role";
GRANT UPDATE ON public."hlo_analytics_attribution_touches" TO "service_role";
GRANT DELETE ON public."hlo_analytics_attribution_touches" TO "service_role";
GRANT TRUNCATE ON public."hlo_analytics_attribution_touches" TO "service_role";
GRANT REFERENCES ON public."hlo_analytics_attribution_touches" TO "service_role";
GRANT TRIGGER ON public."hlo_analytics_attribution_touches" TO "service_role";
GRANT INSERT ON public."hlo_analytics_experiments" TO "service_role";
GRANT SELECT ON public."hlo_analytics_experiments" TO "service_role";
GRANT UPDATE ON public."hlo_analytics_experiments" TO "service_role";
GRANT DELETE ON public."hlo_analytics_experiments" TO "service_role";
GRANT TRUNCATE ON public."hlo_analytics_experiments" TO "service_role";
GRANT REFERENCES ON public."hlo_analytics_experiments" TO "service_role";
GRANT TRIGGER ON public."hlo_analytics_experiments" TO "service_role";
GRANT INSERT ON public."hlo_analytics_experiment_exposures" TO "service_role";
GRANT SELECT ON public."hlo_analytics_experiment_exposures" TO "service_role";
GRANT UPDATE ON public."hlo_analytics_experiment_exposures" TO "service_role";
GRANT DELETE ON public."hlo_analytics_experiment_exposures" TO "service_role";
GRANT TRUNCATE ON public."hlo_analytics_experiment_exposures" TO "service_role";
GRANT REFERENCES ON public."hlo_analytics_experiment_exposures" TO "service_role";
GRANT TRIGGER ON public."hlo_analytics_experiment_exposures" TO "service_role";
GRANT INSERT ON public."hlo_analytics_ai_usage" TO "service_role";
GRANT SELECT ON public."hlo_analytics_ai_usage" TO "service_role";
GRANT UPDATE ON public."hlo_analytics_ai_usage" TO "service_role";
GRANT DELETE ON public."hlo_analytics_ai_usage" TO "service_role";
GRANT TRUNCATE ON public."hlo_analytics_ai_usage" TO "service_role";
GRANT REFERENCES ON public."hlo_analytics_ai_usage" TO "service_role";
GRANT TRIGGER ON public."hlo_analytics_ai_usage" TO "service_role";
GRANT INSERT ON public."hlo_analytics_cost_ledger" TO "service_role";
GRANT SELECT ON public."hlo_analytics_cost_ledger" TO "service_role";
GRANT UPDATE ON public."hlo_analytics_cost_ledger" TO "service_role";
GRANT DELETE ON public."hlo_analytics_cost_ledger" TO "service_role";
GRANT TRUNCATE ON public."hlo_analytics_cost_ledger" TO "service_role";
GRANT REFERENCES ON public."hlo_analytics_cost_ledger" TO "service_role";
GRANT TRIGGER ON public."hlo_analytics_cost_ledger" TO "service_role";
GRANT INSERT ON public."hlo_analytics_revenue_ledger" TO "service_role";
GRANT SELECT ON public."hlo_analytics_revenue_ledger" TO "service_role";
GRANT UPDATE ON public."hlo_analytics_revenue_ledger" TO "service_role";
GRANT DELETE ON public."hlo_analytics_revenue_ledger" TO "service_role";
GRANT TRUNCATE ON public."hlo_analytics_revenue_ledger" TO "service_role";
GRANT REFERENCES ON public."hlo_analytics_revenue_ledger" TO "service_role";
GRANT TRIGGER ON public."hlo_analytics_revenue_ledger" TO "service_role";
GRANT INSERT ON public."hlo_analytics_daily_funnel" TO "service_role";
GRANT SELECT ON public."hlo_analytics_daily_funnel" TO "service_role";
GRANT UPDATE ON public."hlo_analytics_daily_funnel" TO "service_role";
GRANT DELETE ON public."hlo_analytics_daily_funnel" TO "service_role";
GRANT TRUNCATE ON public."hlo_analytics_daily_funnel" TO "service_role";
GRANT REFERENCES ON public."hlo_analytics_daily_funnel" TO "service_role";
GRANT TRIGGER ON public."hlo_analytics_daily_funnel" TO "service_role";
GRANT INSERT ON public."hlo_analytics_ai_economics_daily" TO "service_role";
GRANT SELECT ON public."hlo_analytics_ai_economics_daily" TO "service_role";
GRANT UPDATE ON public."hlo_analytics_ai_economics_daily" TO "service_role";
GRANT DELETE ON public."hlo_analytics_ai_economics_daily" TO "service_role";
GRANT TRUNCATE ON public."hlo_analytics_ai_economics_daily" TO "service_role";
GRANT REFERENCES ON public."hlo_analytics_ai_economics_daily" TO "service_role";
GRANT TRIGGER ON public."hlo_analytics_ai_economics_daily" TO "service_role";
GRANT INSERT ON public."hlo_analytics_unit_economics_daily" TO "service_role";
GRANT SELECT ON public."hlo_analytics_unit_economics_daily" TO "service_role";
GRANT UPDATE ON public."hlo_analytics_unit_economics_daily" TO "service_role";
GRANT DELETE ON public."hlo_analytics_unit_economics_daily" TO "service_role";
GRANT TRUNCATE ON public."hlo_analytics_unit_economics_daily" TO "service_role";
GRANT REFERENCES ON public."hlo_analytics_unit_economics_daily" TO "service_role";
GRANT TRIGGER ON public."hlo_analytics_unit_economics_daily" TO "service_role";
GRANT INSERT ON public."hlo_analytics_learner_funnel" TO "service_role";
GRANT SELECT ON public."hlo_analytics_learner_funnel" TO "service_role";
GRANT UPDATE ON public."hlo_analytics_learner_funnel" TO "service_role";
GRANT DELETE ON public."hlo_analytics_learner_funnel" TO "service_role";
GRANT TRUNCATE ON public."hlo_analytics_learner_funnel" TO "service_role";
GRANT REFERENCES ON public."hlo_analytics_learner_funnel" TO "service_role";
GRANT TRIGGER ON public."hlo_analytics_learner_funnel" TO "service_role";
GRANT INSERT ON public."hlo_analytics_retention_activity" TO "service_role";
GRANT SELECT ON public."hlo_analytics_retention_activity" TO "service_role";
GRANT UPDATE ON public."hlo_analytics_retention_activity" TO "service_role";
GRANT DELETE ON public."hlo_analytics_retention_activity" TO "service_role";
GRANT TRUNCATE ON public."hlo_analytics_retention_activity" TO "service_role";
GRANT REFERENCES ON public."hlo_analytics_retention_activity" TO "service_role";
GRANT TRIGGER ON public."hlo_analytics_retention_activity" TO "service_role";
GRANT INSERT ON public."hlo_analytics_retention_summary" TO "service_role";
GRANT SELECT ON public."hlo_analytics_retention_summary" TO "service_role";
GRANT UPDATE ON public."hlo_analytics_retention_summary" TO "service_role";
GRANT DELETE ON public."hlo_analytics_retention_summary" TO "service_role";
GRANT TRUNCATE ON public."hlo_analytics_retention_summary" TO "service_role";
GRANT REFERENCES ON public."hlo_analytics_retention_summary" TO "service_role";
GRANT TRIGGER ON public."hlo_analytics_retention_summary" TO "service_role";
GRANT INSERT ON public."hlo_analytics_consents" TO "service_role";
GRANT SELECT ON public."hlo_analytics_consents" TO "service_role";
GRANT UPDATE ON public."hlo_analytics_consents" TO "service_role";
GRANT DELETE ON public."hlo_analytics_consents" TO "service_role";
GRANT TRUNCATE ON public."hlo_analytics_consents" TO "service_role";
GRANT REFERENCES ON public."hlo_analytics_consents" TO "service_role";
GRANT TRIGGER ON public."hlo_analytics_consents" TO "service_role";
GRANT INSERT ON public."hlo_analytics_consents" TO "authenticated";
GRANT SELECT ON public."hlo_analytics_consents" TO "authenticated";
GRANT INSERT ON public."hlo_analytics_sessions" TO "service_role";
GRANT SELECT ON public."hlo_analytics_sessions" TO "service_role";
GRANT UPDATE ON public."hlo_analytics_sessions" TO "service_role";
GRANT DELETE ON public."hlo_analytics_sessions" TO "service_role";
GRANT TRUNCATE ON public."hlo_analytics_sessions" TO "service_role";
GRANT REFERENCES ON public."hlo_analytics_sessions" TO "service_role";
GRANT TRIGGER ON public."hlo_analytics_sessions" TO "service_role";
GRANT INSERT ON public."hlo_analytics_sessions" TO "authenticated";
GRANT SELECT ON public."hlo_analytics_sessions" TO "authenticated";
GRANT INSERT ON public."hlo_analytics_events" TO "service_role";
GRANT SELECT ON public."hlo_analytics_events" TO "service_role";
GRANT UPDATE ON public."hlo_analytics_events" TO "service_role";
GRANT DELETE ON public."hlo_analytics_events" TO "service_role";
GRANT TRUNCATE ON public."hlo_analytics_events" TO "service_role";
GRANT REFERENCES ON public."hlo_analytics_events" TO "service_role";
GRANT TRIGGER ON public."hlo_analytics_events" TO "service_role";
GRANT INSERT ON public."hlo_analytics_events" TO "authenticated";
GRANT SELECT ON public."hlo_analytics_events" TO "authenticated";
GRANT INSERT ON public."hlo_analytics_baseline_results" TO "service_role";
GRANT SELECT ON public."hlo_analytics_baseline_results" TO "service_role";
GRANT UPDATE ON public."hlo_analytics_baseline_results" TO "service_role";
GRANT DELETE ON public."hlo_analytics_baseline_results" TO "service_role";
GRANT TRUNCATE ON public."hlo_analytics_baseline_results" TO "service_role";
GRANT REFERENCES ON public."hlo_analytics_baseline_results" TO "service_role";
GRANT TRIGGER ON public."hlo_analytics_baseline_results" TO "service_role";
GRANT INSERT ON public."hlo_analytics_baseline_results" TO "authenticated";
GRANT SELECT ON public."hlo_analytics_baseline_results" TO "authenticated";
GRANT INSERT ON public."hlo_analytics_learning_state_snapshots" TO "service_role";
GRANT SELECT ON public."hlo_analytics_learning_state_snapshots" TO "service_role";
GRANT UPDATE ON public."hlo_analytics_learning_state_snapshots" TO "service_role";
GRANT DELETE ON public."hlo_analytics_learning_state_snapshots" TO "service_role";
GRANT TRUNCATE ON public."hlo_analytics_learning_state_snapshots" TO "service_role";
GRANT REFERENCES ON public."hlo_analytics_learning_state_snapshots" TO "service_role";
GRANT TRIGGER ON public."hlo_analytics_learning_state_snapshots" TO "service_role";
GRANT INSERT ON public."hlo_analytics_learning_state_snapshots" TO "authenticated";
GRANT SELECT ON public."hlo_analytics_learning_state_snapshots" TO "authenticated";
GRANT INSERT ON public."hlo_owner_users" TO "anon";
GRANT SELECT ON public."hlo_owner_users" TO "anon";
GRANT UPDATE ON public."hlo_owner_users" TO "anon";
GRANT DELETE ON public."hlo_owner_users" TO "anon";
GRANT TRUNCATE ON public."hlo_owner_users" TO "anon";
GRANT REFERENCES ON public."hlo_owner_users" TO "anon";
GRANT TRIGGER ON public."hlo_owner_users" TO "anon";
GRANT INSERT ON public."hlo_owner_users" TO "authenticated";
GRANT SELECT ON public."hlo_owner_users" TO "authenticated";
GRANT UPDATE ON public."hlo_owner_users" TO "authenticated";
GRANT DELETE ON public."hlo_owner_users" TO "authenticated";
GRANT TRUNCATE ON public."hlo_owner_users" TO "authenticated";
GRANT REFERENCES ON public."hlo_owner_users" TO "authenticated";
GRANT TRIGGER ON public."hlo_owner_users" TO "authenticated";
GRANT INSERT ON public."hlo_owner_users" TO "service_role";
GRANT SELECT ON public."hlo_owner_users" TO "service_role";
GRANT UPDATE ON public."hlo_owner_users" TO "service_role";
GRANT DELETE ON public."hlo_owner_users" TO "service_role";
GRANT TRUNCATE ON public."hlo_owner_users" TO "service_role";
GRANT REFERENCES ON public."hlo_owner_users" TO "service_role";
GRANT TRIGGER ON public."hlo_owner_users" TO "service_role";
GRANT INSERT ON public."hlo_personalization_intakes" TO "anon";
GRANT SELECT ON public."hlo_personalization_intakes" TO "anon";
GRANT UPDATE ON public."hlo_personalization_intakes" TO "anon";
GRANT DELETE ON public."hlo_personalization_intakes" TO "anon";
GRANT TRUNCATE ON public."hlo_personalization_intakes" TO "anon";
GRANT REFERENCES ON public."hlo_personalization_intakes" TO "anon";
GRANT TRIGGER ON public."hlo_personalization_intakes" TO "anon";
GRANT INSERT ON public."hlo_personalization_intakes" TO "authenticated";
GRANT SELECT ON public."hlo_personalization_intakes" TO "authenticated";
GRANT UPDATE ON public."hlo_personalization_intakes" TO "authenticated";
GRANT DELETE ON public."hlo_personalization_intakes" TO "authenticated";
GRANT TRUNCATE ON public."hlo_personalization_intakes" TO "authenticated";
GRANT REFERENCES ON public."hlo_personalization_intakes" TO "authenticated";
GRANT TRIGGER ON public."hlo_personalization_intakes" TO "authenticated";
GRANT INSERT ON public."hlo_personalization_intakes" TO "service_role";
GRANT SELECT ON public."hlo_personalization_intakes" TO "service_role";
GRANT UPDATE ON public."hlo_personalization_intakes" TO "service_role";
GRANT DELETE ON public."hlo_personalization_intakes" TO "service_role";
GRANT TRUNCATE ON public."hlo_personalization_intakes" TO "service_role";
GRANT REFERENCES ON public."hlo_personalization_intakes" TO "service_role";
GRANT TRIGGER ON public."hlo_personalization_intakes" TO "service_role";
GRANT INSERT ON public."hlo_custom_curricula" TO "anon";
GRANT SELECT ON public."hlo_custom_curricula" TO "anon";
GRANT UPDATE ON public."hlo_custom_curricula" TO "anon";
GRANT DELETE ON public."hlo_custom_curricula" TO "anon";
GRANT TRUNCATE ON public."hlo_custom_curricula" TO "anon";
GRANT REFERENCES ON public."hlo_custom_curricula" TO "anon";
GRANT TRIGGER ON public."hlo_custom_curricula" TO "anon";
GRANT INSERT ON public."hlo_custom_curricula" TO "authenticated";
GRANT SELECT ON public."hlo_custom_curricula" TO "authenticated";
GRANT UPDATE ON public."hlo_custom_curricula" TO "authenticated";
GRANT DELETE ON public."hlo_custom_curricula" TO "authenticated";
GRANT TRUNCATE ON public."hlo_custom_curricula" TO "authenticated";
GRANT REFERENCES ON public."hlo_custom_curricula" TO "authenticated";
GRANT TRIGGER ON public."hlo_custom_curricula" TO "authenticated";
GRANT INSERT ON public."hlo_custom_curricula" TO "service_role";
GRANT SELECT ON public."hlo_custom_curricula" TO "service_role";
GRANT UPDATE ON public."hlo_custom_curricula" TO "service_role";
GRANT DELETE ON public."hlo_custom_curricula" TO "service_role";
GRANT TRUNCATE ON public."hlo_custom_curricula" TO "service_role";
GRANT REFERENCES ON public."hlo_custom_curricula" TO "service_role";
GRANT TRIGGER ON public."hlo_custom_curricula" TO "service_role";
GRANT INSERT ON public."hlo_custom_module_progress" TO "anon";
GRANT SELECT ON public."hlo_custom_module_progress" TO "anon";
GRANT UPDATE ON public."hlo_custom_module_progress" TO "anon";
GRANT DELETE ON public."hlo_custom_module_progress" TO "anon";
GRANT TRUNCATE ON public."hlo_custom_module_progress" TO "anon";
GRANT REFERENCES ON public."hlo_custom_module_progress" TO "anon";
GRANT TRIGGER ON public."hlo_custom_module_progress" TO "anon";
GRANT INSERT ON public."hlo_custom_module_progress" TO "authenticated";
GRANT SELECT ON public."hlo_custom_module_progress" TO "authenticated";
GRANT UPDATE ON public."hlo_custom_module_progress" TO "authenticated";
GRANT DELETE ON public."hlo_custom_module_progress" TO "authenticated";
GRANT TRUNCATE ON public."hlo_custom_module_progress" TO "authenticated";
GRANT REFERENCES ON public."hlo_custom_module_progress" TO "authenticated";
GRANT TRIGGER ON public."hlo_custom_module_progress" TO "authenticated";
GRANT INSERT ON public."hlo_custom_module_progress" TO "service_role";
GRANT SELECT ON public."hlo_custom_module_progress" TO "service_role";
GRANT UPDATE ON public."hlo_custom_module_progress" TO "service_role";
GRANT DELETE ON public."hlo_custom_module_progress" TO "service_role";
GRANT TRUNCATE ON public."hlo_custom_module_progress" TO "service_role";
GRANT REFERENCES ON public."hlo_custom_module_progress" TO "service_role";
GRANT TRIGGER ON public."hlo_custom_module_progress" TO "service_role";
GRANT INSERT ON public."hlo_curriculum_agent_registry" TO "anon";
GRANT SELECT ON public."hlo_curriculum_agent_registry" TO "anon";
GRANT UPDATE ON public."hlo_curriculum_agent_registry" TO "anon";
GRANT DELETE ON public."hlo_curriculum_agent_registry" TO "anon";
GRANT TRUNCATE ON public."hlo_curriculum_agent_registry" TO "anon";
GRANT REFERENCES ON public."hlo_curriculum_agent_registry" TO "anon";
GRANT TRIGGER ON public."hlo_curriculum_agent_registry" TO "anon";
GRANT INSERT ON public."hlo_curriculum_agent_registry" TO "authenticated";
GRANT SELECT ON public."hlo_curriculum_agent_registry" TO "authenticated";
GRANT UPDATE ON public."hlo_curriculum_agent_registry" TO "authenticated";
GRANT DELETE ON public."hlo_curriculum_agent_registry" TO "authenticated";
GRANT TRUNCATE ON public."hlo_curriculum_agent_registry" TO "authenticated";
GRANT REFERENCES ON public."hlo_curriculum_agent_registry" TO "authenticated";
GRANT TRIGGER ON public."hlo_curriculum_agent_registry" TO "authenticated";
GRANT INSERT ON public."hlo_curriculum_agent_registry" TO "service_role";
GRANT SELECT ON public."hlo_curriculum_agent_registry" TO "service_role";
GRANT UPDATE ON public."hlo_curriculum_agent_registry" TO "service_role";
GRANT DELETE ON public."hlo_curriculum_agent_registry" TO "service_role";
GRANT TRUNCATE ON public."hlo_curriculum_agent_registry" TO "service_role";
GRANT REFERENCES ON public."hlo_curriculum_agent_registry" TO "service_role";
GRANT TRIGGER ON public."hlo_curriculum_agent_registry" TO "service_role";
GRANT INSERT ON public."hlo_asset_cache_v3" TO "service_role";
GRANT SELECT ON public."hlo_asset_cache_v3" TO "service_role";
GRANT UPDATE ON public."hlo_asset_cache_v3" TO "service_role";
GRANT DELETE ON public."hlo_asset_cache_v3" TO "service_role";
GRANT TRUNCATE ON public."hlo_asset_cache_v3" TO "service_role";
GRANT REFERENCES ON public."hlo_asset_cache_v3" TO "service_role";
GRANT TRIGGER ON public."hlo_asset_cache_v3" TO "service_role";
GRANT INSERT ON public."hlo_curriculum_agent_runs" TO "anon";
GRANT SELECT ON public."hlo_curriculum_agent_runs" TO "anon";
GRANT UPDATE ON public."hlo_curriculum_agent_runs" TO "anon";
GRANT DELETE ON public."hlo_curriculum_agent_runs" TO "anon";
GRANT TRUNCATE ON public."hlo_curriculum_agent_runs" TO "anon";
GRANT REFERENCES ON public."hlo_curriculum_agent_runs" TO "anon";
GRANT TRIGGER ON public."hlo_curriculum_agent_runs" TO "anon";
GRANT INSERT ON public."hlo_curriculum_agent_runs" TO "authenticated";
GRANT SELECT ON public."hlo_curriculum_agent_runs" TO "authenticated";
GRANT UPDATE ON public."hlo_curriculum_agent_runs" TO "authenticated";
GRANT DELETE ON public."hlo_curriculum_agent_runs" TO "authenticated";
GRANT TRUNCATE ON public."hlo_curriculum_agent_runs" TO "authenticated";
GRANT REFERENCES ON public."hlo_curriculum_agent_runs" TO "authenticated";
GRANT TRIGGER ON public."hlo_curriculum_agent_runs" TO "authenticated";
GRANT INSERT ON public."hlo_curriculum_agent_runs" TO "service_role";
GRANT SELECT ON public."hlo_curriculum_agent_runs" TO "service_role";
GRANT UPDATE ON public."hlo_curriculum_agent_runs" TO "service_role";
GRANT DELETE ON public."hlo_curriculum_agent_runs" TO "service_role";
GRANT TRUNCATE ON public."hlo_curriculum_agent_runs" TO "service_role";
GRANT REFERENCES ON public."hlo_curriculum_agent_runs" TO "service_role";
GRANT TRIGGER ON public."hlo_curriculum_agent_runs" TO "service_role";
GRANT INSERT ON public."hlo_app_assets_v4" TO "service_role";
GRANT SELECT ON public."hlo_app_assets_v4" TO "service_role";
GRANT UPDATE ON public."hlo_app_assets_v4" TO "service_role";
GRANT DELETE ON public."hlo_app_assets_v4" TO "service_role";
GRANT TRUNCATE ON public."hlo_app_assets_v4" TO "service_role";
GRANT REFERENCES ON public."hlo_app_assets_v4" TO "service_role";
GRANT TRIGGER ON public."hlo_app_assets_v4" TO "service_role";
GRANT INSERT ON public."hlo_app_assets_backup_20260902" TO "anon";
GRANT SELECT ON public."hlo_app_assets_backup_20260902" TO "anon";
GRANT UPDATE ON public."hlo_app_assets_backup_20260902" TO "anon";
GRANT DELETE ON public."hlo_app_assets_backup_20260902" TO "anon";
GRANT TRUNCATE ON public."hlo_app_assets_backup_20260902" TO "anon";
GRANT REFERENCES ON public."hlo_app_assets_backup_20260902" TO "anon";
GRANT TRIGGER ON public."hlo_app_assets_backup_20260902" TO "anon";
GRANT INSERT ON public."hlo_app_assets_backup_20260902" TO "authenticated";
GRANT SELECT ON public."hlo_app_assets_backup_20260902" TO "authenticated";
GRANT UPDATE ON public."hlo_app_assets_backup_20260902" TO "authenticated";
GRANT DELETE ON public."hlo_app_assets_backup_20260902" TO "authenticated";
GRANT TRUNCATE ON public."hlo_app_assets_backup_20260902" TO "authenticated";
GRANT REFERENCES ON public."hlo_app_assets_backup_20260902" TO "authenticated";
GRANT TRIGGER ON public."hlo_app_assets_backup_20260902" TO "authenticated";
GRANT INSERT ON public."hlo_app_assets_backup_20260902" TO "service_role";
GRANT SELECT ON public."hlo_app_assets_backup_20260902" TO "service_role";
GRANT UPDATE ON public."hlo_app_assets_backup_20260902" TO "service_role";
GRANT DELETE ON public."hlo_app_assets_backup_20260902" TO "service_role";
GRANT TRUNCATE ON public."hlo_app_assets_backup_20260902" TO "service_role";
GRANT REFERENCES ON public."hlo_app_assets_backup_20260902" TO "service_role";
GRANT TRIGGER ON public."hlo_app_assets_backup_20260902" TO "service_role";
GRANT INSERT ON public."hlo_ai_guide_eval_results" TO "anon";
GRANT SELECT ON public."hlo_ai_guide_eval_results" TO "anon";
GRANT UPDATE ON public."hlo_ai_guide_eval_results" TO "anon";
GRANT DELETE ON public."hlo_ai_guide_eval_results" TO "anon";
GRANT TRUNCATE ON public."hlo_ai_guide_eval_results" TO "anon";
GRANT REFERENCES ON public."hlo_ai_guide_eval_results" TO "anon";
GRANT TRIGGER ON public."hlo_ai_guide_eval_results" TO "anon";
GRANT INSERT ON public."hlo_ai_guide_eval_results" TO "authenticated";
GRANT SELECT ON public."hlo_ai_guide_eval_results" TO "authenticated";
GRANT UPDATE ON public."hlo_ai_guide_eval_results" TO "authenticated";
GRANT DELETE ON public."hlo_ai_guide_eval_results" TO "authenticated";
GRANT TRUNCATE ON public."hlo_ai_guide_eval_results" TO "authenticated";
GRANT REFERENCES ON public."hlo_ai_guide_eval_results" TO "authenticated";
GRANT TRIGGER ON public."hlo_ai_guide_eval_results" TO "authenticated";
GRANT INSERT ON public."hlo_ai_guide_eval_results" TO "service_role";
GRANT SELECT ON public."hlo_ai_guide_eval_results" TO "service_role";
GRANT UPDATE ON public."hlo_ai_guide_eval_results" TO "service_role";
GRANT DELETE ON public."hlo_ai_guide_eval_results" TO "service_role";
GRANT TRUNCATE ON public."hlo_ai_guide_eval_results" TO "service_role";
GRANT REFERENCES ON public."hlo_ai_guide_eval_results" TO "service_role";
GRANT TRIGGER ON public."hlo_ai_guide_eval_results" TO "service_role";
GRANT INSERT ON public."hlo_ai_guide_eval_runs" TO "anon";
GRANT SELECT ON public."hlo_ai_guide_eval_runs" TO "anon";
GRANT UPDATE ON public."hlo_ai_guide_eval_runs" TO "anon";
GRANT DELETE ON public."hlo_ai_guide_eval_runs" TO "anon";
GRANT TRUNCATE ON public."hlo_ai_guide_eval_runs" TO "anon";
GRANT REFERENCES ON public."hlo_ai_guide_eval_runs" TO "anon";
GRANT TRIGGER ON public."hlo_ai_guide_eval_runs" TO "anon";
GRANT INSERT ON public."hlo_ai_guide_eval_runs" TO "authenticated";
GRANT SELECT ON public."hlo_ai_guide_eval_runs" TO "authenticated";
GRANT UPDATE ON public."hlo_ai_guide_eval_runs" TO "authenticated";
GRANT DELETE ON public."hlo_ai_guide_eval_runs" TO "authenticated";
GRANT TRUNCATE ON public."hlo_ai_guide_eval_runs" TO "authenticated";
GRANT REFERENCES ON public."hlo_ai_guide_eval_runs" TO "authenticated";
GRANT TRIGGER ON public."hlo_ai_guide_eval_runs" TO "authenticated";
GRANT INSERT ON public."hlo_ai_guide_eval_runs" TO "service_role";
GRANT SELECT ON public."hlo_ai_guide_eval_runs" TO "service_role";
GRANT UPDATE ON public."hlo_ai_guide_eval_runs" TO "service_role";
GRANT DELETE ON public."hlo_ai_guide_eval_runs" TO "service_role";
GRANT TRUNCATE ON public."hlo_ai_guide_eval_runs" TO "service_role";
GRANT REFERENCES ON public."hlo_ai_guide_eval_runs" TO "service_role";
GRANT TRIGGER ON public."hlo_ai_guide_eval_runs" TO "service_role";
GRANT INSERT ON public."hlo_ai_guide_eval_cases" TO "anon";
GRANT SELECT ON public."hlo_ai_guide_eval_cases" TO "anon";
GRANT UPDATE ON public."hlo_ai_guide_eval_cases" TO "anon";
GRANT DELETE ON public."hlo_ai_guide_eval_cases" TO "anon";
GRANT TRUNCATE ON public."hlo_ai_guide_eval_cases" TO "anon";
GRANT REFERENCES ON public."hlo_ai_guide_eval_cases" TO "anon";
GRANT TRIGGER ON public."hlo_ai_guide_eval_cases" TO "anon";
GRANT INSERT ON public."hlo_ai_guide_eval_cases" TO "authenticated";
GRANT SELECT ON public."hlo_ai_guide_eval_cases" TO "authenticated";
GRANT UPDATE ON public."hlo_ai_guide_eval_cases" TO "authenticated";
GRANT DELETE ON public."hlo_ai_guide_eval_cases" TO "authenticated";
GRANT TRUNCATE ON public."hlo_ai_guide_eval_cases" TO "authenticated";
GRANT REFERENCES ON public."hlo_ai_guide_eval_cases" TO "authenticated";
GRANT TRIGGER ON public."hlo_ai_guide_eval_cases" TO "authenticated";
GRANT INSERT ON public."hlo_ai_guide_eval_cases" TO "service_role";
GRANT SELECT ON public."hlo_ai_guide_eval_cases" TO "service_role";
GRANT UPDATE ON public."hlo_ai_guide_eval_cases" TO "service_role";
GRANT DELETE ON public."hlo_ai_guide_eval_cases" TO "service_role";
GRANT TRUNCATE ON public."hlo_ai_guide_eval_cases" TO "service_role";
GRANT REFERENCES ON public."hlo_ai_guide_eval_cases" TO "service_role";
GRANT TRIGGER ON public."hlo_ai_guide_eval_cases" TO "service_role";
GRANT INSERT ON public."hlo_lab_drafts" TO "anon";
GRANT SELECT ON public."hlo_lab_drafts" TO "anon";
GRANT UPDATE ON public."hlo_lab_drafts" TO "anon";
GRANT DELETE ON public."hlo_lab_drafts" TO "anon";
GRANT TRUNCATE ON public."hlo_lab_drafts" TO "anon";
GRANT REFERENCES ON public."hlo_lab_drafts" TO "anon";
GRANT TRIGGER ON public."hlo_lab_drafts" TO "anon";
GRANT INSERT ON public."hlo_lab_drafts" TO "authenticated";
GRANT SELECT ON public."hlo_lab_drafts" TO "authenticated";
GRANT UPDATE ON public."hlo_lab_drafts" TO "authenticated";
GRANT DELETE ON public."hlo_lab_drafts" TO "authenticated";
GRANT TRUNCATE ON public."hlo_lab_drafts" TO "authenticated";
GRANT REFERENCES ON public."hlo_lab_drafts" TO "authenticated";
GRANT TRIGGER ON public."hlo_lab_drafts" TO "authenticated";
GRANT INSERT ON public."hlo_lab_drafts" TO "service_role";
GRANT SELECT ON public."hlo_lab_drafts" TO "service_role";
GRANT UPDATE ON public."hlo_lab_drafts" TO "service_role";
GRANT DELETE ON public."hlo_lab_drafts" TO "service_role";
GRANT TRUNCATE ON public."hlo_lab_drafts" TO "service_role";
GRANT REFERENCES ON public."hlo_lab_drafts" TO "service_role";
GRANT TRIGGER ON public."hlo_lab_drafts" TO "service_role";
GRANT INSERT ON public."hlo_events" TO "anon";
GRANT SELECT ON public."hlo_events" TO "anon";
GRANT UPDATE ON public."hlo_events" TO "anon";
GRANT DELETE ON public."hlo_events" TO "anon";
GRANT TRUNCATE ON public."hlo_events" TO "anon";
GRANT REFERENCES ON public."hlo_events" TO "anon";
GRANT TRIGGER ON public."hlo_events" TO "anon";
GRANT INSERT ON public."hlo_events" TO "authenticated";
GRANT SELECT ON public."hlo_events" TO "authenticated";
GRANT UPDATE ON public."hlo_events" TO "authenticated";
GRANT DELETE ON public."hlo_events" TO "authenticated";
GRANT TRUNCATE ON public."hlo_events" TO "authenticated";
GRANT REFERENCES ON public."hlo_events" TO "authenticated";
GRANT TRIGGER ON public."hlo_events" TO "authenticated";
GRANT INSERT ON public."hlo_events" TO "service_role";
GRANT SELECT ON public."hlo_events" TO "service_role";
GRANT UPDATE ON public."hlo_events" TO "service_role";
GRANT DELETE ON public."hlo_events" TO "service_role";
GRANT TRUNCATE ON public."hlo_events" TO "service_role";
GRANT REFERENCES ON public."hlo_events" TO "service_role";
GRANT TRIGGER ON public."hlo_events" TO "service_role";
GRANT INSERT ON public."hlo_lifecycle_interventions" TO "anon";
GRANT SELECT ON public."hlo_lifecycle_interventions" TO "anon";
GRANT UPDATE ON public."hlo_lifecycle_interventions" TO "anon";
GRANT DELETE ON public."hlo_lifecycle_interventions" TO "anon";
GRANT TRUNCATE ON public."hlo_lifecycle_interventions" TO "anon";
GRANT REFERENCES ON public."hlo_lifecycle_interventions" TO "anon";
GRANT TRIGGER ON public."hlo_lifecycle_interventions" TO "anon";
GRANT INSERT ON public."hlo_lifecycle_interventions" TO "authenticated";
GRANT SELECT ON public."hlo_lifecycle_interventions" TO "authenticated";
GRANT UPDATE ON public."hlo_lifecycle_interventions" TO "authenticated";
GRANT DELETE ON public."hlo_lifecycle_interventions" TO "authenticated";
GRANT TRUNCATE ON public."hlo_lifecycle_interventions" TO "authenticated";
GRANT REFERENCES ON public."hlo_lifecycle_interventions" TO "authenticated";
GRANT TRIGGER ON public."hlo_lifecycle_interventions" TO "authenticated";
GRANT INSERT ON public."hlo_lifecycle_interventions" TO "service_role";
GRANT SELECT ON public."hlo_lifecycle_interventions" TO "service_role";
GRANT UPDATE ON public."hlo_lifecycle_interventions" TO "service_role";
GRANT DELETE ON public."hlo_lifecycle_interventions" TO "service_role";
GRANT TRUNCATE ON public."hlo_lifecycle_interventions" TO "service_role";
GRANT REFERENCES ON public."hlo_lifecycle_interventions" TO "service_role";
GRANT TRIGGER ON public."hlo_lifecycle_interventions" TO "service_role";
GRANT INSERT ON public."hlo_lifecycle_state_definitions" TO "anon";
GRANT SELECT ON public."hlo_lifecycle_state_definitions" TO "anon";
GRANT UPDATE ON public."hlo_lifecycle_state_definitions" TO "anon";
GRANT DELETE ON public."hlo_lifecycle_state_definitions" TO "anon";
GRANT TRUNCATE ON public."hlo_lifecycle_state_definitions" TO "anon";
GRANT REFERENCES ON public."hlo_lifecycle_state_definitions" TO "anon";
GRANT TRIGGER ON public."hlo_lifecycle_state_definitions" TO "anon";
GRANT INSERT ON public."hlo_lifecycle_state_definitions" TO "authenticated";
GRANT SELECT ON public."hlo_lifecycle_state_definitions" TO "authenticated";
GRANT UPDATE ON public."hlo_lifecycle_state_definitions" TO "authenticated";
GRANT DELETE ON public."hlo_lifecycle_state_definitions" TO "authenticated";
GRANT TRUNCATE ON public."hlo_lifecycle_state_definitions" TO "authenticated";
GRANT REFERENCES ON public."hlo_lifecycle_state_definitions" TO "authenticated";
GRANT TRIGGER ON public."hlo_lifecycle_state_definitions" TO "authenticated";
GRANT INSERT ON public."hlo_lifecycle_state_definitions" TO "service_role";
GRANT SELECT ON public."hlo_lifecycle_state_definitions" TO "service_role";
GRANT UPDATE ON public."hlo_lifecycle_state_definitions" TO "service_role";
GRANT DELETE ON public."hlo_lifecycle_state_definitions" TO "service_role";
GRANT TRUNCATE ON public."hlo_lifecycle_state_definitions" TO "service_role";
GRANT REFERENCES ON public."hlo_lifecycle_state_definitions" TO "service_role";
GRANT TRIGGER ON public."hlo_lifecycle_state_definitions" TO "service_role";
GRANT INSERT ON public."hlo_lifecycle_candidates" TO "anon";
GRANT SELECT ON public."hlo_lifecycle_candidates" TO "anon";
GRANT UPDATE ON public."hlo_lifecycle_candidates" TO "anon";
GRANT DELETE ON public."hlo_lifecycle_candidates" TO "anon";
GRANT TRUNCATE ON public."hlo_lifecycle_candidates" TO "anon";
GRANT REFERENCES ON public."hlo_lifecycle_candidates" TO "anon";
GRANT TRIGGER ON public."hlo_lifecycle_candidates" TO "anon";
GRANT INSERT ON public."hlo_lifecycle_candidates" TO "authenticated";
GRANT SELECT ON public."hlo_lifecycle_candidates" TO "authenticated";
GRANT UPDATE ON public."hlo_lifecycle_candidates" TO "authenticated";
GRANT DELETE ON public."hlo_lifecycle_candidates" TO "authenticated";
GRANT TRUNCATE ON public."hlo_lifecycle_candidates" TO "authenticated";
GRANT REFERENCES ON public."hlo_lifecycle_candidates" TO "authenticated";
GRANT TRIGGER ON public."hlo_lifecycle_candidates" TO "authenticated";
GRANT INSERT ON public."hlo_lifecycle_candidates" TO "service_role";
GRANT SELECT ON public."hlo_lifecycle_candidates" TO "service_role";
GRANT UPDATE ON public."hlo_lifecycle_candidates" TO "service_role";
GRANT DELETE ON public."hlo_lifecycle_candidates" TO "service_role";
GRANT TRUNCATE ON public."hlo_lifecycle_candidates" TO "service_role";
GRANT REFERENCES ON public."hlo_lifecycle_candidates" TO "service_role";
GRANT TRIGGER ON public."hlo_lifecycle_candidates" TO "service_role";
GRANT INSERT ON public."hlo_analytics_content_to_learning" TO "anon";
GRANT SELECT ON public."hlo_analytics_content_to_learning" TO "anon";
GRANT UPDATE ON public."hlo_analytics_content_to_learning" TO "anon";
GRANT DELETE ON public."hlo_analytics_content_to_learning" TO "anon";
GRANT TRUNCATE ON public."hlo_analytics_content_to_learning" TO "anon";
GRANT REFERENCES ON public."hlo_analytics_content_to_learning" TO "anon";
GRANT TRIGGER ON public."hlo_analytics_content_to_learning" TO "anon";
GRANT INSERT ON public."hlo_analytics_content_to_learning" TO "authenticated";
GRANT SELECT ON public."hlo_analytics_content_to_learning" TO "authenticated";
GRANT UPDATE ON public."hlo_analytics_content_to_learning" TO "authenticated";
GRANT DELETE ON public."hlo_analytics_content_to_learning" TO "authenticated";
GRANT TRUNCATE ON public."hlo_analytics_content_to_learning" TO "authenticated";
GRANT REFERENCES ON public."hlo_analytics_content_to_learning" TO "authenticated";
GRANT TRIGGER ON public."hlo_analytics_content_to_learning" TO "authenticated";
GRANT INSERT ON public."hlo_analytics_content_to_learning" TO "service_role";
GRANT SELECT ON public."hlo_analytics_content_to_learning" TO "service_role";
GRANT UPDATE ON public."hlo_analytics_content_to_learning" TO "service_role";
GRANT DELETE ON public."hlo_analytics_content_to_learning" TO "service_role";
GRANT TRUNCATE ON public."hlo_analytics_content_to_learning" TO "service_role";
GRANT REFERENCES ON public."hlo_analytics_content_to_learning" TO "service_role";
GRANT TRIGGER ON public."hlo_analytics_content_to_learning" TO "service_role";
GRANT INSERT ON public."hlo_analytics_content_source_quality" TO "anon";
GRANT SELECT ON public."hlo_analytics_content_source_quality" TO "anon";
GRANT UPDATE ON public."hlo_analytics_content_source_quality" TO "anon";
GRANT DELETE ON public."hlo_analytics_content_source_quality" TO "anon";
GRANT TRUNCATE ON public."hlo_analytics_content_source_quality" TO "anon";
GRANT REFERENCES ON public."hlo_analytics_content_source_quality" TO "anon";
GRANT TRIGGER ON public."hlo_analytics_content_source_quality" TO "anon";
GRANT INSERT ON public."hlo_analytics_content_source_quality" TO "authenticated";
GRANT SELECT ON public."hlo_analytics_content_source_quality" TO "authenticated";
GRANT UPDATE ON public."hlo_analytics_content_source_quality" TO "authenticated";
GRANT DELETE ON public."hlo_analytics_content_source_quality" TO "authenticated";
GRANT TRUNCATE ON public."hlo_analytics_content_source_quality" TO "authenticated";
GRANT REFERENCES ON public."hlo_analytics_content_source_quality" TO "authenticated";
GRANT TRIGGER ON public."hlo_analytics_content_source_quality" TO "authenticated";
GRANT INSERT ON public."hlo_analytics_content_source_quality" TO "service_role";
GRANT SELECT ON public."hlo_analytics_content_source_quality" TO "service_role";
GRANT UPDATE ON public."hlo_analytics_content_source_quality" TO "service_role";
GRANT DELETE ON public."hlo_analytics_content_source_quality" TO "service_role";
GRANT TRUNCATE ON public."hlo_analytics_content_source_quality" TO "service_role";
GRANT REFERENCES ON public."hlo_analytics_content_source_quality" TO "service_role";
GRANT TRIGGER ON public."hlo_analytics_content_source_quality" TO "service_role";
GRANT INSERT ON public."hlo_live_asset_inspect" TO "anon";
GRANT SELECT ON public."hlo_live_asset_inspect" TO "anon";
GRANT UPDATE ON public."hlo_live_asset_inspect" TO "anon";
GRANT DELETE ON public."hlo_live_asset_inspect" TO "anon";
GRANT TRUNCATE ON public."hlo_live_asset_inspect" TO "anon";
GRANT REFERENCES ON public."hlo_live_asset_inspect" TO "anon";
GRANT TRIGGER ON public."hlo_live_asset_inspect" TO "anon";
GRANT INSERT ON public."hlo_live_asset_inspect" TO "authenticated";
GRANT SELECT ON public."hlo_live_asset_inspect" TO "authenticated";
GRANT UPDATE ON public."hlo_live_asset_inspect" TO "authenticated";
GRANT DELETE ON public."hlo_live_asset_inspect" TO "authenticated";
GRANT TRUNCATE ON public."hlo_live_asset_inspect" TO "authenticated";
GRANT REFERENCES ON public."hlo_live_asset_inspect" TO "authenticated";
GRANT TRIGGER ON public."hlo_live_asset_inspect" TO "authenticated";
GRANT INSERT ON public."hlo_live_asset_inspect" TO "service_role";
GRANT SELECT ON public."hlo_live_asset_inspect" TO "service_role";
GRANT UPDATE ON public."hlo_live_asset_inspect" TO "service_role";
GRANT DELETE ON public."hlo_live_asset_inspect" TO "service_role";
GRANT TRUNCATE ON public."hlo_live_asset_inspect" TO "service_role";
GRANT REFERENCES ON public."hlo_live_asset_inspect" TO "service_role";
GRANT TRIGGER ON public."hlo_live_asset_inspect" TO "service_role";
GRANT INSERT ON public."hlo_qaqc_runs" TO "service_role";
GRANT SELECT ON public."hlo_qaqc_runs" TO "service_role";
GRANT UPDATE ON public."hlo_qaqc_runs" TO "service_role";
GRANT DELETE ON public."hlo_qaqc_runs" TO "service_role";
GRANT TRUNCATE ON public."hlo_qaqc_runs" TO "service_role";
GRANT REFERENCES ON public."hlo_qaqc_runs" TO "service_role";
GRANT TRIGGER ON public."hlo_qaqc_runs" TO "service_role";
GRANT INSERT ON public."hlo_user_settings" TO "anon";
GRANT SELECT ON public."hlo_user_settings" TO "anon";
GRANT UPDATE ON public."hlo_user_settings" TO "anon";
GRANT DELETE ON public."hlo_user_settings" TO "anon";
GRANT TRUNCATE ON public."hlo_user_settings" TO "anon";
GRANT REFERENCES ON public."hlo_user_settings" TO "anon";
GRANT TRIGGER ON public."hlo_user_settings" TO "anon";
GRANT INSERT ON public."hlo_user_settings" TO "authenticated";
GRANT SELECT ON public."hlo_user_settings" TO "authenticated";
GRANT UPDATE ON public."hlo_user_settings" TO "authenticated";
GRANT DELETE ON public."hlo_user_settings" TO "authenticated";
GRANT TRUNCATE ON public."hlo_user_settings" TO "authenticated";
GRANT REFERENCES ON public."hlo_user_settings" TO "authenticated";
GRANT TRIGGER ON public."hlo_user_settings" TO "authenticated";
GRANT INSERT ON public."hlo_user_settings" TO "service_role";
GRANT SELECT ON public."hlo_user_settings" TO "service_role";
GRANT UPDATE ON public."hlo_user_settings" TO "service_role";
GRANT DELETE ON public."hlo_user_settings" TO "service_role";
GRANT TRUNCATE ON public."hlo_user_settings" TO "service_role";
GRANT REFERENCES ON public."hlo_user_settings" TO "service_role";
GRANT TRIGGER ON public."hlo_user_settings" TO "service_role";
GRANT INSERT ON public."hlo_module_notes" TO "anon";
GRANT SELECT ON public."hlo_module_notes" TO "anon";
GRANT UPDATE ON public."hlo_module_notes" TO "anon";
GRANT DELETE ON public."hlo_module_notes" TO "anon";
GRANT TRUNCATE ON public."hlo_module_notes" TO "anon";
GRANT REFERENCES ON public."hlo_module_notes" TO "anon";
GRANT TRIGGER ON public."hlo_module_notes" TO "anon";
GRANT INSERT ON public."hlo_module_notes" TO "authenticated";
GRANT SELECT ON public."hlo_module_notes" TO "authenticated";
GRANT UPDATE ON public."hlo_module_notes" TO "authenticated";
GRANT DELETE ON public."hlo_module_notes" TO "authenticated";
GRANT TRUNCATE ON public."hlo_module_notes" TO "authenticated";
GRANT REFERENCES ON public."hlo_module_notes" TO "authenticated";
GRANT TRIGGER ON public."hlo_module_notes" TO "authenticated";
GRANT INSERT ON public."hlo_module_notes" TO "service_role";
GRANT SELECT ON public."hlo_module_notes" TO "service_role";
GRANT UPDATE ON public."hlo_module_notes" TO "service_role";
GRANT DELETE ON public."hlo_module_notes" TO "service_role";
GRANT TRUNCATE ON public."hlo_module_notes" TO "service_role";
GRANT REFERENCES ON public."hlo_module_notes" TO "service_role";
GRANT TRIGGER ON public."hlo_module_notes" TO "service_role";
GRANT INSERT ON public."hlo_saved_sources" TO "anon";
GRANT SELECT ON public."hlo_saved_sources" TO "anon";
GRANT UPDATE ON public."hlo_saved_sources" TO "anon";
GRANT DELETE ON public."hlo_saved_sources" TO "anon";
GRANT TRUNCATE ON public."hlo_saved_sources" TO "anon";
GRANT REFERENCES ON public."hlo_saved_sources" TO "anon";
GRANT TRIGGER ON public."hlo_saved_sources" TO "anon";
GRANT INSERT ON public."hlo_saved_sources" TO "authenticated";
GRANT SELECT ON public."hlo_saved_sources" TO "authenticated";
GRANT UPDATE ON public."hlo_saved_sources" TO "authenticated";
GRANT DELETE ON public."hlo_saved_sources" TO "authenticated";
GRANT TRUNCATE ON public."hlo_saved_sources" TO "authenticated";
GRANT REFERENCES ON public."hlo_saved_sources" TO "authenticated";
GRANT TRIGGER ON public."hlo_saved_sources" TO "authenticated";
GRANT INSERT ON public."hlo_saved_sources" TO "service_role";
GRANT SELECT ON public."hlo_saved_sources" TO "service_role";
GRANT UPDATE ON public."hlo_saved_sources" TO "service_role";
GRANT DELETE ON public."hlo_saved_sources" TO "service_role";
GRANT TRUNCATE ON public."hlo_saved_sources" TO "service_role";
GRANT REFERENCES ON public."hlo_saved_sources" TO "service_role";
GRANT TRIGGER ON public."hlo_saved_sources" TO "service_role";
GRANT INSERT ON public."hlo_support_requests" TO "anon";
GRANT SELECT ON public."hlo_support_requests" TO "anon";
GRANT UPDATE ON public."hlo_support_requests" TO "anon";
GRANT DELETE ON public."hlo_support_requests" TO "anon";
GRANT TRUNCATE ON public."hlo_support_requests" TO "anon";
GRANT REFERENCES ON public."hlo_support_requests" TO "anon";
GRANT TRIGGER ON public."hlo_support_requests" TO "anon";
GRANT INSERT ON public."hlo_support_requests" TO "authenticated";
GRANT SELECT ON public."hlo_support_requests" TO "authenticated";
GRANT UPDATE ON public."hlo_support_requests" TO "authenticated";
GRANT DELETE ON public."hlo_support_requests" TO "authenticated";
GRANT TRUNCATE ON public."hlo_support_requests" TO "authenticated";
GRANT REFERENCES ON public."hlo_support_requests" TO "authenticated";
GRANT TRIGGER ON public."hlo_support_requests" TO "authenticated";
GRANT INSERT ON public."hlo_support_requests" TO "service_role";
GRANT SELECT ON public."hlo_support_requests" TO "service_role";
GRANT UPDATE ON public."hlo_support_requests" TO "service_role";
GRANT DELETE ON public."hlo_support_requests" TO "service_role";
GRANT TRUNCATE ON public."hlo_support_requests" TO "service_role";
GRANT REFERENCES ON public."hlo_support_requests" TO "service_role";
GRANT TRIGGER ON public."hlo_support_requests" TO "service_role";
GRANT INSERT ON public."hlo_capability_events" TO "authenticated";
GRANT SELECT ON public."hlo_capability_events" TO "authenticated";
GRANT UPDATE ON public."hlo_capability_events" TO "authenticated";
GRANT DELETE ON public."hlo_capability_events" TO "authenticated";
GRANT TRUNCATE ON public."hlo_capability_events" TO "authenticated";
GRANT REFERENCES ON public."hlo_capability_events" TO "authenticated";
GRANT TRIGGER ON public."hlo_capability_events" TO "authenticated";
GRANT INSERT ON public."hlo_capability_events" TO "service_role";
GRANT SELECT ON public."hlo_capability_events" TO "service_role";
GRANT UPDATE ON public."hlo_capability_events" TO "service_role";
GRANT DELETE ON public."hlo_capability_events" TO "service_role";
GRANT TRUNCATE ON public."hlo_capability_events" TO "service_role";
GRANT REFERENCES ON public."hlo_capability_events" TO "service_role";
GRANT TRIGGER ON public."hlo_capability_events" TO "service_role";
GRANT INSERT ON public."hlo_lab_attempts" TO "authenticated";
GRANT SELECT ON public."hlo_lab_attempts" TO "authenticated";
GRANT UPDATE ON public."hlo_lab_attempts" TO "authenticated";
GRANT DELETE ON public."hlo_lab_attempts" TO "authenticated";
GRANT TRUNCATE ON public."hlo_lab_attempts" TO "authenticated";
GRANT REFERENCES ON public."hlo_lab_attempts" TO "authenticated";
GRANT TRIGGER ON public."hlo_lab_attempts" TO "authenticated";
GRANT INSERT ON public."hlo_lab_attempts" TO "service_role";
GRANT SELECT ON public."hlo_lab_attempts" TO "service_role";
GRANT UPDATE ON public."hlo_lab_attempts" TO "service_role";
GRANT DELETE ON public."hlo_lab_attempts" TO "service_role";
GRANT TRUNCATE ON public."hlo_lab_attempts" TO "service_role";
GRANT REFERENCES ON public."hlo_lab_attempts" TO "service_role";
GRANT TRIGGER ON public."hlo_lab_attempts" TO "service_role";
GRANT INSERT ON public."hlo_capability_profiles" TO "authenticated";
GRANT SELECT ON public."hlo_capability_profiles" TO "authenticated";
GRANT UPDATE ON public."hlo_capability_profiles" TO "authenticated";
GRANT DELETE ON public."hlo_capability_profiles" TO "authenticated";
GRANT TRUNCATE ON public."hlo_capability_profiles" TO "authenticated";
GRANT REFERENCES ON public."hlo_capability_profiles" TO "authenticated";
GRANT TRIGGER ON public."hlo_capability_profiles" TO "authenticated";
GRANT INSERT ON public."hlo_capability_profiles" TO "service_role";
GRANT SELECT ON public."hlo_capability_profiles" TO "service_role";
GRANT UPDATE ON public."hlo_capability_profiles" TO "service_role";
GRANT DELETE ON public."hlo_capability_profiles" TO "service_role";
GRANT TRUNCATE ON public."hlo_capability_profiles" TO "service_role";
GRANT REFERENCES ON public."hlo_capability_profiles" TO "service_role";
GRANT TRIGGER ON public."hlo_capability_profiles" TO "service_role";
GRANT INSERT ON public."hlo_module_reflections" TO "anon";
GRANT SELECT ON public."hlo_module_reflections" TO "anon";
GRANT UPDATE ON public."hlo_module_reflections" TO "anon";
GRANT DELETE ON public."hlo_module_reflections" TO "anon";
GRANT TRUNCATE ON public."hlo_module_reflections" TO "anon";
GRANT REFERENCES ON public."hlo_module_reflections" TO "anon";
GRANT TRIGGER ON public."hlo_module_reflections" TO "anon";
GRANT INSERT ON public."hlo_module_reflections" TO "authenticated";
GRANT SELECT ON public."hlo_module_reflections" TO "authenticated";
GRANT UPDATE ON public."hlo_module_reflections" TO "authenticated";
GRANT DELETE ON public."hlo_module_reflections" TO "authenticated";
GRANT TRUNCATE ON public."hlo_module_reflections" TO "authenticated";
GRANT REFERENCES ON public."hlo_module_reflections" TO "authenticated";
GRANT TRIGGER ON public."hlo_module_reflections" TO "authenticated";
GRANT INSERT ON public."hlo_module_reflections" TO "service_role";
GRANT SELECT ON public."hlo_module_reflections" TO "service_role";
GRANT UPDATE ON public."hlo_module_reflections" TO "service_role";
GRANT DELETE ON public."hlo_module_reflections" TO "service_role";
GRANT TRUNCATE ON public."hlo_module_reflections" TO "service_role";
GRANT REFERENCES ON public."hlo_module_reflections" TO "service_role";
GRANT TRIGGER ON public."hlo_module_reflections" TO "service_role";
GRANT INSERT ON public."hlo_frontier_signals" TO "anon";
GRANT SELECT ON public."hlo_frontier_signals" TO "anon";
GRANT UPDATE ON public."hlo_frontier_signals" TO "anon";
GRANT DELETE ON public."hlo_frontier_signals" TO "anon";
GRANT TRUNCATE ON public."hlo_frontier_signals" TO "anon";
GRANT REFERENCES ON public."hlo_frontier_signals" TO "anon";
GRANT TRIGGER ON public."hlo_frontier_signals" TO "anon";
GRANT INSERT ON public."hlo_frontier_signals" TO "authenticated";
GRANT SELECT ON public."hlo_frontier_signals" TO "authenticated";
GRANT UPDATE ON public."hlo_frontier_signals" TO "authenticated";
GRANT DELETE ON public."hlo_frontier_signals" TO "authenticated";
GRANT TRUNCATE ON public."hlo_frontier_signals" TO "authenticated";
GRANT REFERENCES ON public."hlo_frontier_signals" TO "authenticated";
GRANT TRIGGER ON public."hlo_frontier_signals" TO "authenticated";
GRANT INSERT ON public."hlo_frontier_signals" TO "service_role";
GRANT SELECT ON public."hlo_frontier_signals" TO "service_role";
GRANT UPDATE ON public."hlo_frontier_signals" TO "service_role";
GRANT DELETE ON public."hlo_frontier_signals" TO "service_role";
GRANT TRUNCATE ON public."hlo_frontier_signals" TO "service_role";
GRANT REFERENCES ON public."hlo_frontier_signals" TO "service_role";
GRANT TRIGGER ON public."hlo_frontier_signals" TO "service_role";
GRANT INSERT ON public."hlo_opportunities" TO "anon";
GRANT SELECT ON public."hlo_opportunities" TO "anon";
GRANT UPDATE ON public."hlo_opportunities" TO "anon";
GRANT DELETE ON public."hlo_opportunities" TO "anon";
GRANT TRUNCATE ON public."hlo_opportunities" TO "anon";
GRANT REFERENCES ON public."hlo_opportunities" TO "anon";
GRANT TRIGGER ON public."hlo_opportunities" TO "anon";
GRANT INSERT ON public."hlo_opportunities" TO "authenticated";
GRANT SELECT ON public."hlo_opportunities" TO "authenticated";
GRANT UPDATE ON public."hlo_opportunities" TO "authenticated";
GRANT DELETE ON public."hlo_opportunities" TO "authenticated";
GRANT TRUNCATE ON public."hlo_opportunities" TO "authenticated";
GRANT REFERENCES ON public."hlo_opportunities" TO "authenticated";
GRANT TRIGGER ON public."hlo_opportunities" TO "authenticated";
GRANT INSERT ON public."hlo_opportunities" TO "service_role";
GRANT SELECT ON public."hlo_opportunities" TO "service_role";
GRANT UPDATE ON public."hlo_opportunities" TO "service_role";
GRANT DELETE ON public."hlo_opportunities" TO "service_role";
GRANT TRUNCATE ON public."hlo_opportunities" TO "service_role";
GRANT REFERENCES ON public."hlo_opportunities" TO "service_role";
GRANT TRIGGER ON public."hlo_opportunities" TO "service_role";
GRANT INSERT ON public."hlo_leverage_snapshots" TO "anon";
GRANT SELECT ON public."hlo_leverage_snapshots" TO "anon";
GRANT UPDATE ON public."hlo_leverage_snapshots" TO "anon";
GRANT DELETE ON public."hlo_leverage_snapshots" TO "anon";
GRANT TRUNCATE ON public."hlo_leverage_snapshots" TO "anon";
GRANT REFERENCES ON public."hlo_leverage_snapshots" TO "anon";
GRANT TRIGGER ON public."hlo_leverage_snapshots" TO "anon";
GRANT INSERT ON public."hlo_leverage_snapshots" TO "authenticated";
GRANT SELECT ON public."hlo_leverage_snapshots" TO "authenticated";
GRANT UPDATE ON public."hlo_leverage_snapshots" TO "authenticated";
GRANT DELETE ON public."hlo_leverage_snapshots" TO "authenticated";
GRANT TRUNCATE ON public."hlo_leverage_snapshots" TO "authenticated";
GRANT REFERENCES ON public."hlo_leverage_snapshots" TO "authenticated";
GRANT TRIGGER ON public."hlo_leverage_snapshots" TO "authenticated";
GRANT INSERT ON public."hlo_leverage_snapshots" TO "service_role";
GRANT SELECT ON public."hlo_leverage_snapshots" TO "service_role";
GRANT UPDATE ON public."hlo_leverage_snapshots" TO "service_role";
GRANT DELETE ON public."hlo_leverage_snapshots" TO "service_role";
GRANT TRUNCATE ON public."hlo_leverage_snapshots" TO "service_role";
GRANT REFERENCES ON public."hlo_leverage_snapshots" TO "service_role";
GRANT TRIGGER ON public."hlo_leverage_snapshots" TO "service_role";
GRANT INSERT ON public."hlo_owner_private_content" TO "anon";
GRANT SELECT ON public."hlo_owner_private_content" TO "anon";
GRANT UPDATE ON public."hlo_owner_private_content" TO "anon";
GRANT DELETE ON public."hlo_owner_private_content" TO "anon";
GRANT TRUNCATE ON public."hlo_owner_private_content" TO "anon";
GRANT REFERENCES ON public."hlo_owner_private_content" TO "anon";
GRANT TRIGGER ON public."hlo_owner_private_content" TO "anon";
GRANT INSERT ON public."hlo_owner_private_content" TO "authenticated";
GRANT SELECT ON public."hlo_owner_private_content" TO "authenticated";
GRANT UPDATE ON public."hlo_owner_private_content" TO "authenticated";
GRANT DELETE ON public."hlo_owner_private_content" TO "authenticated";
GRANT TRUNCATE ON public."hlo_owner_private_content" TO "authenticated";
GRANT REFERENCES ON public."hlo_owner_private_content" TO "authenticated";
GRANT TRIGGER ON public."hlo_owner_private_content" TO "authenticated";
GRANT INSERT ON public."hlo_owner_private_content" TO "service_role";
GRANT SELECT ON public."hlo_owner_private_content" TO "service_role";
GRANT UPDATE ON public."hlo_owner_private_content" TO "service_role";
GRANT DELETE ON public."hlo_owner_private_content" TO "service_role";
GRANT TRUNCATE ON public."hlo_owner_private_content" TO "service_role";
GRANT REFERENCES ON public."hlo_owner_private_content" TO "service_role";
GRANT TRIGGER ON public."hlo_owner_private_content" TO "service_role";
GRANT INSERT ON public."hlo_owner_empire_capstone" TO "anon";
GRANT SELECT ON public."hlo_owner_empire_capstone" TO "anon";
GRANT UPDATE ON public."hlo_owner_empire_capstone" TO "anon";
GRANT DELETE ON public."hlo_owner_empire_capstone" TO "anon";
GRANT TRUNCATE ON public."hlo_owner_empire_capstone" TO "anon";
GRANT REFERENCES ON public."hlo_owner_empire_capstone" TO "anon";
GRANT TRIGGER ON public."hlo_owner_empire_capstone" TO "anon";
GRANT INSERT ON public."hlo_owner_empire_capstone" TO "authenticated";
GRANT SELECT ON public."hlo_owner_empire_capstone" TO "authenticated";
GRANT UPDATE ON public."hlo_owner_empire_capstone" TO "authenticated";
GRANT DELETE ON public."hlo_owner_empire_capstone" TO "authenticated";
GRANT TRUNCATE ON public."hlo_owner_empire_capstone" TO "authenticated";
GRANT REFERENCES ON public."hlo_owner_empire_capstone" TO "authenticated";
GRANT TRIGGER ON public."hlo_owner_empire_capstone" TO "authenticated";
GRANT INSERT ON public."hlo_owner_empire_capstone" TO "service_role";
GRANT SELECT ON public."hlo_owner_empire_capstone" TO "service_role";
GRANT UPDATE ON public."hlo_owner_empire_capstone" TO "service_role";
GRANT DELETE ON public."hlo_owner_empire_capstone" TO "service_role";
GRANT TRUNCATE ON public."hlo_owner_empire_capstone" TO "service_role";
GRANT REFERENCES ON public."hlo_owner_empire_capstone" TO "service_role";
GRANT TRIGGER ON public."hlo_owner_empire_capstone" TO "service_role";
GRANT INSERT ON public."hlo_privacy_request_receipts" TO "service_role";
GRANT SELECT ON public."hlo_privacy_request_receipts" TO "service_role";
GRANT UPDATE ON public."hlo_privacy_request_receipts" TO "service_role";
GRANT DELETE ON public."hlo_privacy_request_receipts" TO "service_role";
GRANT TRUNCATE ON public."hlo_privacy_request_receipts" TO "service_role";
GRANT REFERENCES ON public."hlo_privacy_request_receipts" TO "service_role";
GRANT TRIGGER ON public."hlo_privacy_request_receipts" TO "service_role";
GRANT INSERT ON public."hlo_attention_enrollments" TO "service_role";
GRANT SELECT ON public."hlo_attention_enrollments" TO "service_role";
GRANT UPDATE ON public."hlo_attention_enrollments" TO "service_role";
GRANT DELETE ON public."hlo_attention_enrollments" TO "service_role";
GRANT TRUNCATE ON public."hlo_attention_enrollments" TO "service_role";
GRANT REFERENCES ON public."hlo_attention_enrollments" TO "service_role";
GRANT TRIGGER ON public."hlo_attention_enrollments" TO "service_role";
GRANT SELECT ON public."hlo_attention_enrollments" TO "authenticated";
GRANT INSERT ON public."hlo_attention_day_progress" TO "service_role";
GRANT SELECT ON public."hlo_attention_day_progress" TO "service_role";
GRANT UPDATE ON public."hlo_attention_day_progress" TO "service_role";
GRANT DELETE ON public."hlo_attention_day_progress" TO "service_role";
GRANT TRUNCATE ON public."hlo_attention_day_progress" TO "service_role";
GRANT REFERENCES ON public."hlo_attention_day_progress" TO "service_role";
GRANT TRIGGER ON public."hlo_attention_day_progress" TO "service_role";
GRANT SELECT ON public."hlo_attention_day_progress" TO "authenticated";
GRANT INSERT ON public."hlo_billing_entitlements" TO "service_role";
GRANT SELECT ON public."hlo_billing_entitlements" TO "service_role";
GRANT UPDATE ON public."hlo_billing_entitlements" TO "service_role";
GRANT DELETE ON public."hlo_billing_entitlements" TO "service_role";
GRANT TRUNCATE ON public."hlo_billing_entitlements" TO "service_role";
GRANT REFERENCES ON public."hlo_billing_entitlements" TO "service_role";
GRANT TRIGGER ON public."hlo_billing_entitlements" TO "service_role";
GRANT SELECT ON public."hlo_billing_entitlements" TO "authenticated";
GRANT INSERT ON public."hlo_billing_webhook_events" TO "service_role";
GRANT SELECT ON public."hlo_billing_webhook_events" TO "service_role";
GRANT UPDATE ON public."hlo_billing_webhook_events" TO "service_role";
GRANT DELETE ON public."hlo_billing_webhook_events" TO "service_role";
GRANT TRUNCATE ON public."hlo_billing_webhook_events" TO "service_role";
GRANT REFERENCES ON public."hlo_billing_webhook_events" TO "service_role";
GRANT TRIGGER ON public."hlo_billing_webhook_events" TO "service_role";
GRANT INSERT ON public."hlo_billing_dunning_outbox" TO "service_role";
GRANT SELECT ON public."hlo_billing_dunning_outbox" TO "service_role";
GRANT UPDATE ON public."hlo_billing_dunning_outbox" TO "service_role";
GRANT DELETE ON public."hlo_billing_dunning_outbox" TO "service_role";
GRANT TRUNCATE ON public."hlo_billing_dunning_outbox" TO "service_role";
GRANT REFERENCES ON public."hlo_billing_dunning_outbox" TO "service_role";
GRANT TRIGGER ON public."hlo_billing_dunning_outbox" TO "service_role";
GRANT INSERT ON public."hlo_legal_consents" TO "service_role";
GRANT SELECT ON public."hlo_legal_consents" TO "service_role";
GRANT UPDATE ON public."hlo_legal_consents" TO "service_role";
GRANT DELETE ON public."hlo_legal_consents" TO "service_role";
GRANT TRUNCATE ON public."hlo_legal_consents" TO "service_role";
GRANT REFERENCES ON public."hlo_legal_consents" TO "service_role";
GRANT TRIGGER ON public."hlo_legal_consents" TO "service_role";
GRANT SELECT ON public."hlo_legal_consents" TO "authenticated";
GRANT INSERT ON public."hlo_attention_curriculum_days" TO "anon";
GRANT SELECT ON public."hlo_attention_curriculum_days" TO "anon";
GRANT UPDATE ON public."hlo_attention_curriculum_days" TO "anon";
GRANT DELETE ON public."hlo_attention_curriculum_days" TO "anon";
GRANT TRUNCATE ON public."hlo_attention_curriculum_days" TO "anon";
GRANT REFERENCES ON public."hlo_attention_curriculum_days" TO "anon";
GRANT TRIGGER ON public."hlo_attention_curriculum_days" TO "anon";
GRANT INSERT ON public."hlo_attention_curriculum_days" TO "authenticated";
GRANT SELECT ON public."hlo_attention_curriculum_days" TO "authenticated";
GRANT UPDATE ON public."hlo_attention_curriculum_days" TO "authenticated";
GRANT DELETE ON public."hlo_attention_curriculum_days" TO "authenticated";
GRANT TRUNCATE ON public."hlo_attention_curriculum_days" TO "authenticated";
GRANT REFERENCES ON public."hlo_attention_curriculum_days" TO "authenticated";
GRANT TRIGGER ON public."hlo_attention_curriculum_days" TO "authenticated";
GRANT INSERT ON public."hlo_attention_curriculum_days" TO "service_role";
GRANT SELECT ON public."hlo_attention_curriculum_days" TO "service_role";
GRANT UPDATE ON public."hlo_attention_curriculum_days" TO "service_role";
GRANT DELETE ON public."hlo_attention_curriculum_days" TO "service_role";
GRANT TRUNCATE ON public."hlo_attention_curriculum_days" TO "service_role";
GRANT REFERENCES ON public."hlo_attention_curriculum_days" TO "service_role";
GRANT TRIGGER ON public."hlo_attention_curriculum_days" TO "service_role";
REVOKE ALL ON FUNCTION public."hlo_get_question_bank_v2"() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."hlo_get_question_bank_v2"() TO "authenticated";
GRANT EXECUTE ON FUNCTION public."hlo_get_question_bank_v2"() TO "service_role";
REVOKE ALL ON FUNCTION public."hlo_begin_placement_v2"() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."hlo_begin_placement_v2"() TO "authenticated";
GRANT EXECUTE ON FUNCTION public."hlo_begin_placement_v2"() TO "service_role";
REVOKE ALL ON FUNCTION public."hlo_record_question_answer_v2"(p_question_id text, p_selected_index integer, p_session_id text, p_mode text, p_response_ms integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."hlo_record_question_answer_v2"(p_question_id text, p_selected_index integer, p_session_id text, p_mode text, p_response_ms integer) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."hlo_record_question_answer_v2"(p_question_id text, p_selected_index integer, p_session_id text, p_mode text, p_response_ms integer) TO "service_role";
REVOKE ALL ON FUNCTION public."hlo_is_owner"() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."hlo_is_owner"() TO "authenticated";
GRANT EXECUTE ON FUNCTION public."hlo_is_owner"() TO "service_role";
REVOKE ALL ON FUNCTION public."hlo_sanitize_owner_tracks"() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."hlo_sanitize_owner_tracks"() TO "service_role";
REVOKE ALL ON FUNCTION public."hlo_tier_from_score"(p_score numeric) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."hlo_tier_from_score"(p_score numeric) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."hlo_tier_from_score"(p_score numeric) TO "anon";
GRANT EXECUTE ON FUNCTION public."hlo_tier_from_score"(p_score numeric) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."hlo_tier_from_score"(p_score numeric) TO "service_role";
REVOKE ALL ON FUNCTION public."hlo_enforce_personal_track_limit"() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."hlo_enforce_personal_track_limit"() TO "service_role";
REVOKE ALL ON FUNCTION public."hlo_leverage_diagnostic"() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."hlo_leverage_diagnostic"() TO "authenticated";
GRANT EXECUTE ON FUNCTION public."hlo_leverage_diagnostic"() TO "service_role";
REVOKE ALL ON FUNCTION public."hlo_analytics_validate_event"() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."hlo_analytics_validate_event"() TO "service_role";
REVOKE ALL ON FUNCTION public."hlo_analytics_exposure_immutable"() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."hlo_analytics_exposure_immutable"() TO "service_role";
REVOKE ALL ON FUNCTION public."hlo_recalculate_capability"() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."hlo_recalculate_capability"() TO "authenticated";
GRANT EXECUTE ON FUNCTION public."hlo_recalculate_capability"() TO "service_role";
REVOKE ALL ON FUNCTION public."hlo_is_plus_member"(p_user_id uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."hlo_is_plus_member"(p_user_id uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."hlo_is_plus_member"(p_user_id uuid) TO "service_role";
REVOKE ALL ON FUNCTION public."hlo_attention_enroll"(p_timezone text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."hlo_attention_enroll"(p_timezone text) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."hlo_attention_enroll"(p_timezone text) TO "service_role";
REVOKE ALL ON FUNCTION public."hlo_attention_get_journey"(p_timezone text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."hlo_attention_get_journey"(p_timezone text) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."hlo_attention_get_journey"(p_timezone text) TO "service_role";
REVOKE ALL ON FUNCTION public."hlo_attention_set_step"(p_day smallint, p_step text, p_timezone text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."hlo_attention_set_step"(p_day smallint, p_step text, p_timezone text) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."hlo_attention_set_step"(p_day smallint, p_step text, p_timezone text) TO "service_role";
REVOKE ALL ON FUNCTION public."hlo_attention_complete_day"(p_day smallint, p_timezone text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."hlo_attention_complete_day"(p_day smallint, p_timezone text) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."hlo_attention_complete_day"(p_day smallint, p_timezone text) TO "service_role";
REVOKE ALL ON FUNCTION public."hlo_record_legal_consent"(p_terms_version text, p_privacy_version text, p_source text, p_locale text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."hlo_record_legal_consent"(p_terms_version text, p_privacy_version text, p_source text, p_locale text) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."hlo_record_legal_consent"(p_terms_version text, p_privacy_version text, p_source text, p_locale text) TO "service_role";
REVOKE ALL ON FUNCTION public."hlo_finalize_placement_v2"(p_session_id text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."hlo_finalize_placement_v2"(p_session_id text) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."hlo_finalize_placement_v2"(p_session_id text) TO "service_role";
REVOKE ALL ON FUNCTION public."hlo_record_question_result"(p_question_id text, p_correct boolean, p_session_id text, p_mode text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."hlo_record_question_result"(p_question_id text, p_correct boolean, p_session_id text, p_mode text) TO "service_role";
REVOKE ALL ON FUNCTION public."hlo_finalize_placement"(p_session_id text, p_version text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."hlo_finalize_placement"(p_session_id text, p_version text) TO "service_role";
CREATE INDEX hlo_analytics_revenue_time_idx ON public.hlo_analytics_revenue_ledger USING btree (event_type, occurred_at DESC) WHERE (NOT is_synthetic);
CREATE INDEX hlo_analytics_events_source_idx ON public.hlo_analytics_events USING btree (source, campaign, occurred_at DESC) WHERE (NOT is_synthetic);
CREATE INDEX hlo_module_reflections_user_lesson_idx ON public.hlo_module_reflections USING btree (user_id, lesson_id);
CREATE INDEX hlo_tutor_messages_user_idx ON public.hlo_tutor_messages USING btree (user_id, created_at DESC);
CREATE INDEX hlo_analytics_snapshots_identity_idx ON public.hlo_analytics_learning_state_snapshots USING btree (user_id, subject_id, captured_at DESC) WHERE (NOT is_synthetic);
CREATE INDEX hlo_analytics_snapshot_subject_fk_idx ON public.hlo_analytics_learning_state_snapshots USING btree (subject_id);
CREATE INDEX hlo_personalization_intakes_user_idx ON public.hlo_personalization_intakes USING btree (user_id, created_at DESC);
CREATE INDEX hlo_analytics_exposure_subject_fk_idx ON public.hlo_analytics_experiment_exposures USING btree (subject_id);
CREATE INDEX hlo_tutor_messages_thread_time_idx ON public.hlo_tutor_messages USING btree (thread_id, created_at);
CREATE INDEX hlo_analytics_experiments_metric_fk_idx ON public.hlo_analytics_experiments USING btree (primary_metric_key);
CREATE INDEX hlo_lifecycle_interventions_subject_idx ON public.hlo_lifecycle_interventions USING btree (subject_id, created_at DESC);
CREATE INDEX hlo_analytics_snapshot_session_fk_idx ON public.hlo_analytics_learning_state_snapshots USING btree (session_id);
CREATE INDEX hlo_quiz_attempts_user_created_idx ON public.hlo_quiz_attempts USING btree (user_id, created_at DESC);
CREATE INDEX hlo_research_items_topic_time_idx ON public.hlo_research_items USING btree (topic, published_at DESC NULLS LAST);
CREATE INDEX hlo_tutor_threads_user_idx ON public.hlo_tutor_threads USING btree (user_id, updated_at DESC);
CREATE INDEX hlo_attention_progress_resume_idx ON public.hlo_attention_day_progress USING btree (user_id, module_status, day_number);
CREATE INDEX hlo_trading_logs_user_time_idx ON public.hlo_trading_logs USING btree (user_id, occurred_at DESC);
CREATE INDEX hlo_analytics_ai_usage_identity_idx ON public.hlo_analytics_ai_usage USING btree (user_id, subject_id, occurred_at DESC) WHERE (NOT is_synthetic);
CREATE INDEX hlo_analytics_ai_usage_subject_fk_idx ON public.hlo_analytics_ai_usage USING btree (subject_id);
CREATE INDEX hlo_events_user_created_idx ON public.hlo_events USING btree (user_id, created_at DESC);
CREATE INDEX hlo_analytics_events_user_time_idx ON public.hlo_analytics_events USING btree (user_id, occurred_at DESC) WHERE (NOT is_synthetic);
CREATE INDEX hlo_billing_entitlements_subscription_idx ON public.hlo_billing_entitlements USING btree (stripe_subscription_id);
CREATE INDEX hlo_billing_dunning_user_idx ON public.hlo_billing_dunning_outbox USING btree (user_id);
CREATE INDEX hlo_analytics_cost_user_fk_idx ON public.hlo_analytics_cost_ledger USING btree (user_id);
CREATE INDEX hlo_attention_day_progress_day_idx ON public.hlo_attention_day_progress USING btree (day_number);
CREATE INDEX hlo_analytics_cost_subject_fk_idx ON public.hlo_analytics_cost_ledger USING btree (subject_id);
CREATE INDEX hlo_lifecycle_interventions_status_idx ON public.hlo_lifecycle_interventions USING btree (status, due_at);
CREATE INDEX hlo_analytics_sessions_subject_fk_idx ON public.hlo_analytics_sessions USING btree (subject_id);
CREATE INDEX hlo_support_requests_user_created_idx ON public.hlo_support_requests USING btree (user_id, created_at DESC);
CREATE INDEX hlo_analytics_exposure_user_fk_idx ON public.hlo_analytics_experiment_exposures USING btree (user_id);
CREATE INDEX hlo_analytics_ai_usage_session_fk_idx ON public.hlo_analytics_ai_usage USING btree (session_id);
CREATE INDEX hlo_analytics_exposures_experiment_idx ON public.hlo_analytics_experiment_exposures USING btree (experiment_id, variant, exposed_at) WHERE (NOT is_synthetic);
CREATE INDEX hlo_analytics_events_session_idx ON public.hlo_analytics_events USING btree (session_id, occurred_at) WHERE (session_id IS NOT NULL);
CREATE INDEX hlo_analytics_sessions_identity_idx ON public.hlo_analytics_sessions USING btree (user_id, subject_id, started_at DESC) WHERE (NOT is_synthetic);
CREATE INDEX hlo_analytics_identity_links_user_fk_idx ON public.hlo_analytics_identity_links USING btree (user_id);
CREATE INDEX hlo_analytics_cost_time_idx ON public.hlo_analytics_cost_ledger USING btree (cost_type, occurred_at DESC) WHERE (NOT is_synthetic);
CREATE INDEX hlo_analytics_events_name_time_idx ON public.hlo_analytics_events USING btree (event_name, occurred_at DESC) WHERE (NOT is_synthetic);
CREATE INDEX hlo_analytics_baseline_subject_fk_idx ON public.hlo_analytics_baseline_results USING btree (subject_id);
CREATE INDEX hlo_analytics_attribution_subject_fk_idx ON public.hlo_analytics_attribution_touches USING btree (subject_id);
CREATE INDEX hlo_missions_user_status_idx ON public.hlo_missions USING btree (user_id, status, priority);
CREATE INDEX hlo_billing_dunning_queue_idx ON public.hlo_billing_dunning_outbox USING btree (status, created_at) WHERE (status = 'queued'::text);
CREATE INDEX hlo_lab_attempts_user_lab_idx ON public.hlo_lab_attempts USING btree (user_id, lab_id);
CREATE INDEX hlo_billing_entitlements_customer_idx ON public.hlo_billing_entitlements USING btree (stripe_customer_id);
CREATE INDEX hlo_analytics_events_subject_time_idx ON public.hlo_analytics_events USING btree (subject_id, occurred_at DESC) WHERE (NOT is_synthetic);
CREATE INDEX hlo_custom_curricula_user_idx ON public.hlo_custom_curricula USING btree (user_id, created_at DESC);
CREATE UNIQUE INDEX hlo_capability_events_v2_unique_answer_idx ON public.hlo_capability_events USING btree (user_id, source_id, ((metadata ->> 'session_id'::text))) WHERE (event_type = 'question_answer_v2'::text);
CREATE INDEX hlo_recommendations_user_time_idx ON public.hlo_recommendation_snapshots USING btree (user_id, generated_at DESC);
CREATE INDEX hlo_capability_events_v2_session_idx ON public.hlo_capability_events USING btree (user_id, event_type, ((metadata ->> 'session_id'::text)), ((metadata ->> 'mode'::text)));
CREATE INDEX hlo_analytics_revenue_subject_fk_idx ON public.hlo_analytics_revenue_ledger USING btree (subject_id);
CREATE INDEX hlo_analytics_revenue_user_fk_idx ON public.hlo_analytics_revenue_ledger USING btree (user_id);
CREATE INDEX hlo_analytics_baseline_identity_idx ON public.hlo_analytics_baseline_results USING btree (user_id, subject_id, completed_at DESC) WHERE (NOT is_synthetic);
CREATE INDEX hlo_events_name_created_idx ON public.hlo_events USING btree (event_name, created_at DESC);
CREATE INDEX hlo_analytics_consents_user_fk_idx ON public.hlo_analytics_consents USING btree (user_id);
CREATE INDEX hlo_curriculum_agent_runs_user_idx ON public.hlo_curriculum_agent_runs USING btree (user_id, created_at DESC);
CREATE INDEX hlo_frontend_chunks_version_idx ON public.hlo_frontend_chunks USING btree (version, chunk_no);
CREATE INDEX hlo_analytics_exposure_session_fk_idx ON public.hlo_analytics_experiment_exposures USING btree (session_id);
CREATE INDEX hlo_lesson_progress_user_status_idx ON public.hlo_lesson_progress USING btree (user_id, status);
CREATE INDEX hlo_analytics_attribution_identity_idx ON public.hlo_analytics_attribution_touches USING btree (user_id, subject_id, occurred_at) WHERE (NOT is_synthetic);
CREATE INDEX hlo_analytics_baseline_session_fk_idx ON public.hlo_analytics_baseline_results USING btree (session_id);
CREATE INDEX hlo_analytics_attribution_session_fk_idx ON public.hlo_analytics_attribution_touches USING btree (session_id);
CREATE INDEX hlo_qaqc_runs_created_idx ON public.hlo_qaqc_runs USING btree (created_at DESC);
CREATE INDEX hlo_capability_events_user_created_idx ON public.hlo_capability_events USING btree (user_id, created_at DESC);
CREATE INDEX hlo_plan_progress_user_idx ON public.hlo_plan_progress USING btree (user_id, plan_id, status);
CREATE INDEX hlo_leverage_snapshots_user_created_idx ON public.hlo_leverage_snapshots USING btree (user_id, created_at DESC);
CREATE INDEX hlo_analytics_consents_subject_fk_idx ON public.hlo_analytics_consents USING btree (subject_id);
CREATE INDEX hlo_skill_scores_user_track_idx ON public.hlo_skill_scores USING btree (user_id, track);
GRANT USAGE, SELECT ON SEQUENCE public.hlo_events_id_seq TO service_role;