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
CREATE TABLE IF NOT EXISTS "record_list" (
	"id"	INTEGER NOT NULL,
	"program"	TEXT NOT NULL,
	"yearLevel"	INTEGER,
	"courseCode"	TEXT NOT NULL,
	"courseName"	TEXT NOT NULL,
	"gradingTerm"	INTEGER NOT NULL,
	"gradingStart"	INTEGER NOT NULL,
	"gradingEnd"	INTEGER NOT NULL,
	"schedule"	TEXT,
	"instructor"	TEXT,
	"pdValues"	TEXT NOT NULL,
	"gcValues"	TEXT NOT NULL,
	"sheetnum"	TEXT NOT NULL,
	"dateCreated"	TEXT NOT NULL,
	"lastModified"	TEXT NOT NULL,
	"pl"	TEXT,
	"pm"	TEXT,
	"mt"	TEXT,
	"pf"	TEXT,
	"fn"	TEXT,
	PRIMARY KEY("id" AUTOINCREMENT)
);
CREATE TABLE IF NOT EXISTS "unsync" (
	"id"	INTEGER,
	"rcrdId"	INTEGER NOT NULL,
	"userId"	INTEGER NOT NULL,
	"array"	TEXT NOT NULL,
	PRIMARY KEY("id" AUTOINCREMENT)
);
COMMIT;
