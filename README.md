# Resell Haul Tracker

Mobile-first PWA reselling haul tracker built with **Node.js**, **Express**, **EJS**, **vanilla JavaScript**, **CSS**, and **SQLite**, running locally.

The index page is the main dashboard and loads by default when you open the app.

## Features

- **Dashboard-first**: `/` shows the main dashboard listing your hauls.
- **Empty state**: If there are no hauls, you see “No active haul” with a button to add one.
- **Active haul**: When hauls exist, the latest haul is highlighted as the active one and all hauls are listed below.
- **Add haul modal**: “Add haul” opens a modal where you can enter:
  - Haul name
  - Genre (text)
  - Item count
  - Sell window (days)
  - Total cost
- **Incrementing IDs**: Each haul uses an auto-incrementing integer ID starting from 1 in SQLite.
- **SQLite persistence**: All hauls are stored in a local `data.sqlite` database.
- **Mobile-first dark UI**: Clean, modern, dark-themed interface designed for phones.
- **PWA basics**: Manifest and service worker so you can add it to your home screen.

## Getting started

1. **Install Node.js** (if you do not already have it).

2. **Install dependencies**:

   ```bash
   cd c:\Users\Ayaan\Downloads\APP
   npm install
   ```

3. **Run the server**:

   ```bash
   npm start
   ```

4. Open your browser at `http://localhost:3000` on your computer or phone (same network).

## Project structure

- `server.js` – Express server and SQLite setup.
- `views/index.ejs` – Main dashboard page.
- `views/partials/header.ejs` – Reusable header with top-level “Add haul” button.
- `views/partials/dashboard.ejs` – Dashboard section showing empty state, active haul, and haul list.
- `views/partials/haulModal.ejs` – Modal for adding a new haul.
- `public/css/styles.css` – Dark, mobile-first styling.
- `public/js/main.js` – Modal open/close logic.
- `public/manifest.webmanifest` – PWA manifest.
- `public/sw.js` – Minimal service worker.
- `data.sqlite` – SQLite database file (created automatically on first run).

## Notes

- IDs are managed by SQLite via `INTEGER PRIMARY KEY AUTOINCREMENT`, ensuring each haul gets a unique incrementing ID.
- For icons referenced in the manifest (`/icons/icon-192.png`, `/icons/icon-512.png`), you can add your own PNGs at those paths.

