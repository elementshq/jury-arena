CREATE TABLE "arena_matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"benchmark_id" uuid NOT NULL,
	"match_index" integer NOT NULL,
	"sample_id" text NOT NULL,
	"match_data" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "arena_matches_benchmark_match_unique" UNIQUE("benchmark_id","match_index")
);
--> statement-breakpoint
CREATE TABLE "benchmarks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataset_id" uuid NOT NULL,
	"name" text NOT NULL,
	"config" jsonb NOT NULL,
	"info" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "benchmarks_dataset_name_unique" UNIQUE("dataset_id","name")
);
--> statement-breakpoint
CREATE TABLE "datasets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "datasets_project_name_unique" UNIQUE("project_id","name")
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rating_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"benchmark_id" uuid NOT NULL,
	"step" integer NOT NULL,
	"step_data" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "rating_steps_benchmark_step_unique" UNIQUE("benchmark_id","step")
);
--> statement-breakpoint
CREATE TABLE "samples" (
	"id" text PRIMARY KEY NOT NULL,
	"dataset_id" uuid NOT NULL,
	"info" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"benchmark_id" uuid NOT NULL,
	"sample_id" text NOT NULL,
	"model_name" text NOT NULL,
	"result" jsonb NOT NULL,
	"cost_usd" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "trials_benchmark_sample_model_unique" UNIQUE("benchmark_id","sample_id","model_name")
);
--> statement-breakpoint
CREATE TABLE "usage_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"metadata" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "arena_matches" ADD CONSTRAINT "arena_matches_benchmark_id_benchmarks_id_fk" FOREIGN KEY ("benchmark_id") REFERENCES "public"."benchmarks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arena_matches" ADD CONSTRAINT "arena_matches_sample_id_samples_id_fk" FOREIGN KEY ("sample_id") REFERENCES "public"."samples"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "benchmarks" ADD CONSTRAINT "benchmarks_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "datasets" ADD CONSTRAINT "datasets_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rating_steps" ADD CONSTRAINT "rating_steps_benchmark_id_benchmarks_id_fk" FOREIGN KEY ("benchmark_id") REFERENCES "public"."benchmarks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "samples" ADD CONSTRAINT "samples_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trials" ADD CONSTRAINT "trials_benchmark_id_benchmarks_id_fk" FOREIGN KEY ("benchmark_id") REFERENCES "public"."benchmarks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trials" ADD CONSTRAINT "trials_sample_id_samples_id_fk" FOREIGN KEY ("sample_id") REFERENCES "public"."samples"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_logs" ADD CONSTRAINT "usage_logs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "arena_matches_benchmark_id_idx" ON "arena_matches" USING btree ("benchmark_id");--> statement-breakpoint
CREATE INDEX "arena_matches_sample_id_idx" ON "arena_matches" USING btree ("sample_id");--> statement-breakpoint
CREATE INDEX "benchmarks_dataset_id_idx" ON "benchmarks" USING btree ("dataset_id");--> statement-breakpoint
CREATE INDEX "datasets_project_id_idx" ON "datasets" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "rating_steps_benchmark_id_idx" ON "rating_steps" USING btree ("benchmark_id");--> statement-breakpoint
CREATE INDEX "samples_dataset_id_idx" ON "samples" USING btree ("dataset_id");--> statement-breakpoint
CREATE INDEX "trials_sample_id_idx" ON "trials" USING btree ("sample_id");--> statement-breakpoint
CREATE INDEX "trials_benchmark_id_idx" ON "trials" USING btree ("benchmark_id");--> statement-breakpoint
CREATE INDEX "usage_logs_project_id_idx" ON "usage_logs" USING btree ("project_id");