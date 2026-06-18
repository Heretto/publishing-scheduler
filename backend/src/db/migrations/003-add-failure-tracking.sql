-- Add failure tracking to schedules
ALTER TABLE schedules ADD COLUMN consecutive_failures INTEGER DEFAULT 0;
