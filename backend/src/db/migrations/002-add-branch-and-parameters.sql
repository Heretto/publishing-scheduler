ALTER TABLE schedules ADD COLUMN branch TEXT DEFAULT 'master';
ALTER TABLE schedules ADD COLUMN publish_parameters TEXT DEFAULT '[]';
