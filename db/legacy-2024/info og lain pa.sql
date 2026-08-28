BEGIN TRANSACTION;
CREATE TABLE IF NOT EXISTS "ipaddress" (
	"id"	INTEGER,
	"protocol"	INTEGER DEFAULT 'http://',
	"address"	TEXT DEFAULT '192.168.0.0',
	"port"	TEXT DEFAULT ':8080',
	"path"	TEXT DEFAULT 'gradeinsite',
	PRIMARY KEY("id" AUTOINCREMENT)
);
CREATE TABLE IF NOT EXISTS "info" (
	"id"	INTEGER,
	"serverid"	INTEGER,
	"usname"	TEXT,
	"pass"	TEXT,
	"ln"	TEXT,
	"fn"	TEXT,
	PRIMARY KEY("id" AUTOINCREMENT)
);
INSERT INTO "ipaddress" ("id","protocol","address","port","path") VALUES (1,'http://','192.168.254.109/','','gradeinsite/');
-- The one real row in this dump has been redacted: the 2024 app stored
-- passwords as plaintext, and this repository is public.
INSERT INTO "info" ("id","serverid","usname","pass","ln","fn") VALUES (1,12,'REDACTED','REDACTED','REDACTED','REDACTED');
COMMIT;
