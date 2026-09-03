CREATE TABLE `pilot_interest` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `work_email` text NOT NULL,
  `company` text NOT NULL,
  `message` text,
  `source` text DEFAULT 'faultcite.com' NOT NULL,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `pilot_interest_created_idx` ON `pilot_interest` (`created_at`);
