BEGIN TRANSACTION;
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
COMMIT;
