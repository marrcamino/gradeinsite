# GradeInsite

An offline-first grading system for a school running on its own local network.
Instructors record grades in a desktop app that works with no connection at all;
students view released grades from a web app on the campus LAN.

Neither application is an internet service. Both are designed to run entirely
inside the school's network.

## Repository layout

This is a monorepo: two applications and one API in a single repository,
because they share a database schema and a grading model.

```
gradeinsite/
├── apps/
│   ├── desktop/     Tauri 2 + Svelte 5 desktop app (instructors)
│   │   └── src-tauri/   Rust backend, local SQLite
│   ├── web/         Vite + Svelte 5 SPA (students), served by XAMPP
│   └── api/         PHP endpoints backed by MySQL
├── db/
│   ├── migrations/  Current schemas
│   └── legacy-2024/ Original schemas, kept for reference
└── docs/
```

## How the pieces connect

The desktop app keeps its own **SQLite** database, so an instructor can open it
at home with no network and keep working. Changes made while offline are queued
locally. When the computer is back on the school Wi-Fi, the queue is pushed
to the school's **MySQL** database through the PHP API.

The student web app is served by **XAMPP** from that same school server and
reads the MySQL database directly through the PHP API.

```
  Instructor computer                  School server
 ┌──────────────────┐                ┌──────────────────────┐
 │ Desktop (Tauri)  │                │ XAMPP (Apache + PHP) │
 │   SQLite         │ ── sync ────▶  │   apps/api           │
 │   offline queue  │   on LAN       │        │             │
 └──────────────────┘                │        ▼             │
                                     │   MySQL 8.4          │
  Student browser                    │        ▲             │
 ┌──────────────────┐                │        │             │
 │ Web SPA          │ ── fetch ────▶ │   same origin        │
 └──────────────────┘                └──────────────────────┘
```

### On CORS

The web app calls the API with **relative** URLs only (`api/...`). In production
the SPA and the PHP files are served from the same XAMPP origin; in development
Vite proxies `/api` to XAMPP. In both cases the browser sees a single origin, so
CORS never applies.

Absolute URLs such as `http://192.168.x.x/...` must not be reintroduced. Those
are cross-origin by definition and are what broke the 2024 build.

The desktop app is the one genuine cross-origin case, since a Tauri webview has
its own origin. Sync requests are therefore made from Rust, which is not a
browser and is not subject to CORS.

## Requirements

| Tool | Purpose |
| --- | --- |
| Node.js 20+ | Building both frontends |
| Rust + MSVC Build Tools | Compiling the Tauri desktop app |
| XAMPP (Apache + PHP only) | Serving the web app and the API |
| MySQL 8.4 | The school database |

Install XAMPP **without** its MySQL/MariaDB component. It would compete for port
3306 with the MySQL server, and the project targets MySQL specifically.

## Getting started

```bash
# Desktop app
cd apps/desktop
npm install
npm run tauri dev

# Web app
cd apps/web
npm install
npm run dev
```

### The server database

The desktop app runs its own migrations at startup; the server has no runner, so
`db/migrations/` is applied by hand once, as root, in MySQL Workbench:

```
001_mysql_server_schema.sql   the schema, and the gradeinsite database itself
002_mysql_app_user.sql        the limited account the API connects as
```

Replace `CHANGE_ME` in the second file with a real password before running it.
`apps/api/health.php` reports which tables it can see, so a half-applied
migration shows up as a missing name rather than a confusing failure later.

### API configuration

```bash
cd apps/api
cp config.sample.php config.local.php
```

Then edit `config.local.php` with the MySQL credentials — the same password the
`gradeinsite` account was created with. It is gitignored, so credentials are
never committed.

### The first instructor account

Instructors sign up from the desktop app: **Create an account** on the sign-in
screen. The first account on a fresh server is opened without any approval,
because there is nobody yet to ask; from then on the server asks an instructor
who already has an account to approve each new one.

Creating an account needs the school network, since the account lives on the
server. Signing in afterwards does not.

## Deploying to the school server

Build the web app and copy it, together with the API, into XAMPP's `htdocs`:

```
htdocs/gradeinsite/
├── index.html        from apps/web/dist/
├── assets/           from apps/web/dist/
└── api/              from apps/api/
```

Because the built asset URLs are relative, the folder can be renamed or nested
without rebuilding.

## History

This is a ground-up rewrite of a 2024 capstone project. The original desktop
source and the last web build are preserved separately for reference; the
schemas live in `db/legacy-2024/`.
