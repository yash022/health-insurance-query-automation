CREATE TABLE "jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"owner" text NOT NULL,
	"query" text NOT NULL,
	"channel" text NOT NULL,
	"status" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"sequence" bigserial NOT NULL,
	"next" bigint DEFAULT 0 NOT NULL,
	"data" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "jobs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "records" (
	"id" text PRIMARY KEY NOT NULL,
	"owner" text NOT NULL,
	"kind" text NOT NULL,
	"patient" text,
	"fingerprint" text,
	"data" text NOT NULL,
	"created" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "records" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX "query_channel" ON "jobs" USING btree ("query","channel");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_upload" ON "records" USING btree ("owner","kind","patient","fingerprint");