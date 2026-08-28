BEGIN TRANSACTION;
CREATE TABLE IF NOT EXISTS "ipaddress" (
	"id"	INTEGER,
	"protocol"	INTEGER DEFAULT 'http://',
	"address"	TEXT DEFAULT '192.168.0.0',
	"port"	TEXT DEFAULT ':8080',
	"path"	TEXT DEFAULT 'gradeinsite',
	PRIMARY KEY("id" AUTOINCREMENT)
);
INSERT INTO "ipaddress" ("id","protocol","address","port","path") VALUES (1,'http://','192.168.0.0',NULL,'gradeinsite');
COMMIT;
