CREATE TABLE "artists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"twitter_user_id" text NOT NULL,
	"username" varchar(255) NOT NULL,
	"name" varchar(255),
	"tweets_count" integer NOT NULL,
	"followers_count" integer NOT NULL,
	"weekly_tweets_trend" real DEFAULT 0 NOT NULL,
	"weekly_followers_trend" real DEFAULT 0 NOT NULL,
	"images" jsonb NOT NULL,
	"tags" text[] NOT NULL,
	"url" text NOT NULL,
	"country" text,
	"website" text,
	"bio" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "artists_twitter_user_id_unique" UNIQUE("twitter_user_id")
);
--> statement-breakpoint
CREATE TABLE "artistsSuggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" varchar(255) NOT NULL,
	"avatar_url" text NOT NULL,
	"country" text,
	"tags" text[] NOT NULL,
	"status" varchar(255) DEFAULT 'requested' NOT NULL,
	"requested_from" text DEFAULT 'suggestions' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "artistsTrends" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"artist_id" text NOT NULL,
	"tweets_count" integer NOT NULL,
	"followers_count" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "artistsTrends" ADD CONSTRAINT "artistsTrends_artist_id_artists_twitter_user_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("twitter_user_id") ON DELETE no action ON UPDATE no action;