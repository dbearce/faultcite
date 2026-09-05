CREATE TABLE `stripe_webhook_events` (
  `event_id` text PRIMARY KEY NOT NULL,
  `event_type` text NOT NULL,
  `processed_at` integer NOT NULL
);
