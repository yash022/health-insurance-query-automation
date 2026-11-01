ALTER TABLE `records` ADD `fingerprint` text;--> statement-breakpoint
CREATE UNIQUE INDEX `unique_upload` ON `records` (`owner`,`kind`,`patient`,`fingerprint`);