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

### The server database and the API config

The desktop app runs its own migrations at startup. The server has no runner, so
the setup script is the runner — and it works straight from a checkout, which is
the quickest way to get a working dev server:

```powershell
.\scripts\setup-server.ps1
```

It applies `db/migrations/*_mysql_*.sql`, creates the `gradeinsite` MySQL
account, and deploys the API into `htdocs/gradeinsite/api/` with a
`config.local.php` pointing at it — from a checkout it deploys the same way it
would from a release, so what you develop against is what a school runs. Run it
again after adding a migration; it applies only what has not run yet.

To do it by hand instead, run the two migrations as root in MySQL Workbench, in
order. Note that `002_mysql_app_user.sql` contains a literal `CHANGE_ME` where
the password goes and **must not be edited in place** — `tauri-plugin-sql`
checksums migration files whole, and changing one that has already run stops the
desktop app from starting. Substitute it on a copy, or set the password
afterwards with `ALTER USER`. Then copy `config.sample.php` to
`config.local.php` and fill in the same password; it is gitignored, so
credentials are never committed.

`apps/api/health.php` reports which tables it can see, so a half-applied
migration shows up as a missing name rather than a confusing failure later.

### The first instructor account

Instructors sign up from the desktop app: **Create an account** on the sign-in
screen. The first account on a fresh server is opened without any approval,
because there is nobody yet to ask; from then on the server asks an instructor
who already has an account to approve each new one.

Creating an account needs the school network, since the account lives on the
server. Signing in afterwards does not.

## Deploying to the school server

A release has two halves, because two different machines are being set up:

| Artifact | Goes on | What it is |
| --- | --- | --- |
| `GradeInsite_x.y.z_x64-setup.exe` | each instructor's computer | the desktop app |
| `GradeInsite-Server-x.y.z.zip` | the one school-room server | the portal, the API and the migrations |

Both are built by `.github/workflows/release.yml` when a `v*` tag is pushed.

### The server, in one step

Unzip `GradeInsite-Server-x.y.z.zip` on the server and double-click
**Setup GradeInsite Server.bat**. It asks for administrator rights, then:

- finds XAMPP and MySQL, and stops with instructions if either is missing;
- creates the database, applying only the migrations that have not run yet;
- generates a password for the `gradeinsite` MySQL account and writes
  `config.local.php` with it — there is no `CHANGE_ME` to remember;
- copies the portal into `htdocs\gradeinsite\` and the API into `api\` beside it;
- registers Apache as a service so the server survives a power cut;
- opens port 80 on the private and domain firewall profiles;
- checks `health.php` and prints the address to hand out.

It is safe to run again. `001_mysql_server_schema.sql` begins with `DROP TABLE`,
so re-running it blindly would destroy every grade in the school — the installer
consults `schema_migrations` and applies nothing twice. An existing
`config.local.php` is read and kept rather than overwritten, so running a newer
release upgrades the server in place.

XAMPP and MySQL are found, never installed. Bundling them would add most of a
gigabyte to the download and bring their redistribution terms along with it.

### Building the package yourself

```powershell
.\scripts\package-server.ps1        # dist\GradeInsite-Server-<version>.zip
```

`config.local.php` is excluded, and the script refuses to build if one appears
in the staged folder — a packaged release must never carry a live password.

### By hand

Nothing above is required. The layout the installer produces is just:

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
