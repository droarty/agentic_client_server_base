CREATE TYPE "public"."access_level" AS ENUM('read', 'write', 'admin');--> statement-breakpoint
CREATE TYPE "public"."membership_role" AS ENUM('owner', 'admin', 'member');--> statement-breakpoint
CREATE TYPE "public"."permission_manager_mode" AS ENUM('owner', 'group_admin');--> statement-breakpoint
CREATE TYPE "public"."workflow_log_type" AS ENUM('handler', 'route', 'error', 'tool');--> statement-breakpoint
CREATE TABLE "sso_providers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_id" text NOT NULL,
	"email" text NOT NULL,
	"display_name" text,
	CONSTRAINT "sso_providers_provider_provider_id_key" UNIQUE("provider","provider_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"parent_group_id" uuid,
	"ancestors" uuid[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "membership_roles" (
	"membership_id" uuid NOT NULL,
	"role" "membership_role" NOT NULL,
	CONSTRAINT "membership_roles_membership_id_role_pk" PRIMARY KEY("membership_id","role")
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "artifact_group_permissions" (
	"artifact_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"access" "access_level" NOT NULL,
	CONSTRAINT "artifact_group_permissions_artifact_id_group_id_pk" PRIMARY KEY("artifact_id","group_id")
);
--> statement-breakpoint
CREATE TABLE "artifact_user_permissions" (
	"artifact_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"access" "access_level" NOT NULL,
	CONSTRAINT "artifact_user_permissions_artifact_id_user_id_pk" PRIMARY KEY("artifact_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "artifacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"user_id" uuid NOT NULL,
	"group_id" uuid,
	"parent_id" uuid,
	"permission_manager_mode" "permission_manager_mode" DEFAULT 'owner' NOT NULL,
	"state" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "channels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"workflow_type" text NOT NULL,
	"user_id" uuid NOT NULL,
	"artifact_id" uuid,
	"group_id" uuid,
	"target_channel_id" uuid,
	"parent_channel_id" uuid,
	"response_handler" text,
	"is_session_channel" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "channels_channel_id_unique" UNIQUE("channel_id"),
	CONSTRAINT "channels_artifact_id_unique" UNIQUE("artifact_id")
);
--> statement-breakpoint
CREATE TABLE "workflow_configs" (
	"name" text PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"version" text NOT NULL,
	"initial_state" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"handlers" jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel" text NOT NULL,
	"doc_type" text NOT NULL,
	"handler_name" text NOT NULL,
	"log_type" "workflow_log_type" NOT NULL,
	"execution_id" uuid,
	"parent_execution_id" uuid,
	"step_index" integer,
	"message" jsonb,
	"user" jsonb,
	"handler_config" jsonb,
	"route" jsonb,
	"resolved_message" jsonb,
	"error_message" text,
	"error_detail" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sso_providers" ADD CONSTRAINT "sso_providers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_parent_group_id_groups_id_fk" FOREIGN KEY ("parent_group_id") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_roles" ADD CONSTRAINT "membership_roles_membership_id_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."memberships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_group_permissions" ADD CONSTRAINT "artifact_group_permissions_artifact_id_artifacts_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."artifacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_group_permissions" ADD CONSTRAINT "artifact_group_permissions_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_user_permissions" ADD CONSTRAINT "artifact_user_permissions_artifact_id_artifacts_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."artifacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_user_permissions" ADD CONSTRAINT "artifact_user_permissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_parent_id_artifacts_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."artifacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channels" ADD CONSTRAINT "channels_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channels" ADD CONSTRAINT "channels_artifact_id_artifacts_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."artifacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channels" ADD CONSTRAINT "channels_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channels" ADD CONSTRAINT "channels_target_channel_id_channels_channel_id_fk" FOREIGN KEY ("target_channel_id") REFERENCES "public"."channels"("channel_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channels" ADD CONSTRAINT "channels_parent_channel_id_channels_channel_id_fk" FOREIGN KEY ("parent_channel_id") REFERENCES "public"."channels"("channel_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_configs" ADD CONSTRAINT "workflow_configs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_user_id_group_id_key" ON "memberships" USING btree ("user_id","group_id");--> statement-breakpoint
CREATE UNIQUE INDEX "channels_session_uniqueness" ON "channels" USING btree ("workflow_type","user_id","group_id","target_channel_id") WHERE "channels"."is_session_channel" = true;--> statement-breakpoint
CREATE INDEX "workflow_logs_channel_execution_id_idx" ON "workflow_logs" USING btree ("channel","execution_id");--> statement-breakpoint
CREATE INDEX "workflow_logs_channel_parent_execution_id_idx" ON "workflow_logs" USING btree ("channel","parent_execution_id");--> statement-breakpoint
CREATE INDEX "workflow_logs_created_at_idx" ON "workflow_logs" USING btree ("created_at");