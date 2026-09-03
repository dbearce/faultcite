ALTER TABLE `organizations` ADD `stripe_customer_id` text;--> statement-breakpoint
ALTER TABLE `organizations` ADD `stripe_subscription_id` text;--> statement-breakpoint
ALTER TABLE `organizations` ADD `subscription_updated_at` integer;
