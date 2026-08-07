# Weekly Ad Builder

A hosted version of the flyer builder: one shared password gets anyone in, flyers and
the product database are saved on the server (not just one person's browser), and
there's a built-in stock photo search.

## What changed from the single-file version

- **Login**: one shared password (set in `.env`) gates the whole site.
- **Storage**: flyers and the product database now live in a SQLite file on the
  server (`data.sqlite`), not in any one browser's local storage. Anyone who logs in
  sees the same saved flyers and the same product list.
- **Product database**: every Save updates it. Typing a product name that's been
  used before offers to autofill its last photo/price.
- **Photo search**: click "🔎 find photo" on any image box to search free stock
  photos (via Pexels) instead of uploading your own. Set `PEXELS_API_KEY` in
  `.env` once on the server; the key is never shown or stored in users' browsers.
- **Crop & resize popup**: every photo — uploaded or picked from search — opens a
  popup first. Drag to reposition, use the zoom slider to crop in tight, or hit
  "Use whole image" to keep the full photo with white padding instead of cropping
  it. Either way, the final image is automatically shrunk and compressed before
  it's saved (a ~580KB phone photo comes out around 60KB), which keeps the
  database small and the page fast even with dozens of product photos.
- **"Made by Lockwood IT Services" credit bar**: shows at the bottom of the app for
  anyone using it. See "Removing the credit bar" below.

- **Kill switch**: if you're running the optional `license-server/`, this app
  checks in periodically and can be remotely turned on/off from your admin
  dashboard — see "Kill switch" section below.
- **Scheduling**: set a go-live date/time per flyer (defaults to Wednesday 7am,
  fully editable), with a "2-week / holiday ad" option for longer runs like
  Thanksgiving or Christmas. A Scheduled Ads panel shows what's upcoming, live,
  or past.
- **Subscriber broadcasting**: build an email/SMS list right in the tool, and when
  a scheduled ad goes live it can automatically email (and optionally text) your
  subscribers a copy of the flyer — see "Sending ads automatically" below. You can
  also hit "📣 Send Now" to send immediately, on demand, outside the schedule.


## Kill switch

This app can optionally check in with a separate "license server" you control
(the `license-server/` folder in this same package — see its own README) and let
you remotely pause any specific install.

**Setup:**
1. Deploy `license-server/` somewhere central (your DigitalOcean box is a natural
   fit — it doesn't need to run on the client's computer).
2. Open its admin dashboard, add a client, and copy the license key it gives you.
3. In this app's `.env`, set `LICENSE_SERVER_URL` (pointing at your license
   server) and `LICENSE_KEY` (the key you just copied).
4. Restart the app. It checks in immediately, then every 6 hours after that.

Leave both blank (the default) and none of this applies — the app just always
runs, no licensing involved.

**To pause someone:** open the license server's admin dashboard, click "Turn
off" next to their name, optionally leave a note ("Invoice overdue — call to
reactivate"). Within 6 hours (or immediately, if they hit "Check again" on the
lock screen) they're locked out with your message showing, no data lost. Flip it
back on the same way.

If their internet or your license server is briefly down, there's a 7-day grace
period (configurable via `LICENSE_GRACE_HOURS`) before it locks itself out as a
safety measure — so a bad connection for a day doesn't lock someone out
unfairly, but they also can't dodge the kill switch by permanently blocking your
server.

## Sending ads automatically (email + SMS)

Two separate, both-optional channels:

**Email** — free (uses the SMTP settings you already have for the internal
reminder), and works everywhere regardless of how this app is hosted, because
the image is a normal email attachment.

**SMS** — via [Twilio](https://twilio.com). This is **not free**: you pay for a
phone number (a few dollars a month) plus a small fee per message sent. There's
no way around that cost for real SMS sending. Texts send as plain text by
default; to include the picture (MMS), Twilio has to fetch it from a public URL,
which only works if this app is reachable from the internet (Option A/Cloudflare
tunnel hosting, or `PUBLIC_BASE_URL` pointed at a public tunnel even if you're
otherwise running Option B locally). Running LAN-only with no public URL
configured just means texts go out without the picture — nothing breaks.

**How it decides what to send:** when you save a flyer that has a go-live
schedule set, the app renders a picture of it right there in the browser (same
mechanism as "Export image for Facebook") and stores that alongside the
schedule. At go-live time, a background check (every 5 minutes) finds any flyer
whose time has come and hasn't been sent yet, and emails/texts your active
subscriber list automatically. You can also skip the wait and hit "📣 Send Now"
on the currently open flyer at any time.

Manage the subscriber list from the "👥 Subscribers" button — add one at a time,
or paste a list (emails and phone numbers mixed together, one per line — it
figures out which is which). Pause or delete anyone from the same screen.

## Running it locally (to try it out first)

```bash
cd app
cp .env.example .env
# edit .env — at minimum set SHARED_PASSWORD and SESSION_SECRET
npm install
npm start
```

Then open `http://localhost:3000`.

## Option A: Deploy on your DigitalOcean box (same pattern as Tracely / JaredsCertPrep)

This is a plain Node/Express app, so it drops into your existing setup the same way:

1. Copy the `app/` folder to your DigitalOcean box (or wherever).
2. `cd app && cp .env.example .env` and fill in real values:
   - `SHARED_PASSWORD` — what everyone types in to use the tool.
   - `ADMIN_PASSWORD` — separate password just for toggling the credit bar (can be
     the same as `SHARED_PASSWORD` if you don't care about separating them).
   - `SESSION_SECRET` — generate one with:
     ```bash
     node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
     ```
   - `PORT` — whatever port your reverse proxy / Cloudflare tunnel expects.
   - `PEXELS_API_KEY` — the key from pexels.com/api used by photo search.
3. `npm install --production`
4. Run it under a process manager so it survives reboots/crashes — `pm2` is the
   easiest:
   ```bash
   npm install -g pm2
   pm2 start server.js --name weekly-ad-builder
   pm2 save
   ```
5. Point your Cloudflare tunnel at `localhost:<PORT>`, same as you already do for
   the other apps.
6. **Back up `data.sqlite` regularly** — that one file is every saved flyer and the
   entire product database. It's just a file, so your existing backup routine
   (or even a cron `cp` to Backblaze/Seafile) covers it fine.

## Option B: Run it locally on one of their Windows computers, as a service

This is the "self-hosted, no cloud, no monthly bill" option — the app runs on one
computer in their office/pharmacy, everyone on that network reaches it in a
browser, and it survives reboots on its own. Good fit for a single-location client
who doesn't need remote access from outside their building.

**One-time setup, on the computer that will host it:**

1. Install [Node.js](https://nodejs.org) (LTS version) if it isn't already there.
2. Copy the `app` folder onto that computer — anywhere is fine, e.g.
   `C:\WeeklyAdBuilder\`.
3. Double-click **`setup.bat`**. It installs dependencies and creates `.env` for
   you from the template.
4. Open the new `.env` file in Notepad and set real values for
   `SHARED_PASSWORD`, `ADMIN_PASSWORD`, and `SESSION_SECRET` (same guidance as
   Option A above — the random-string generator command works the same on
   Windows if you have Node installed: open Command Prompt in that folder and
   run it there).

**To just try it out** (simplest, but stops if the window is closed):
double-click **`start.bat`**. It opens a window running the server — leave that
window open while people are using it. Fine for testing, not for daily use.

**To run it permanently, unattended** (recommended for real use):
right-click **`install-service.bat`** → *Run as administrator*. This installs it
as a genuine Windows Service called `WeeklyAdBuilder` — it starts automatically
every time the computer boots, keeps running in the background with no window
open, and restarts itself if it ever crashes. Manage it like any other Windows
service (`services.msc`) if you ever need to stop/start/restart it by hand.
To remove it later, right-click `uninstall-service.bat` → *Run as administrator*.

**Accessing it from other computers on the same network:**
On the host computer, open Command Prompt and run `ipconfig` — note the "IPv4
Address" (something like `192.168.1.42`). Anyone on the same WiFi/network opens
`http://192.168.1.42:3000` in their browser (adjust the port if you changed it in
`.env`) and gets the login screen.

A few things worth setting up for this to be reliable day-to-day:
- **Give that computer a static IP or a DHCP reservation on the router**, so the
  address doesn't change and break everyone's bookmark.
- **Windows Firewall** may prompt to allow Node.js through the first time it
  starts — allow it for at least "Private networks." If it doesn't prompt, you
  may need to add an inbound rule for the port manually.
- This is **LAN-only by default** — nobody outside that building's network can
  reach it unless you specifically set up port forwarding or a tunnel (like the
  Cloudflare tunnel pattern from Option A), which isn't necessary unless someone
  needs to build the ad from home.
- **Back up `data.sqlite`** (in the `app` folder) the same way you'd back up any
  client file — it's the entire saved-flyers and product database.

## Removing the credit bar (paid customers)

Right now this is a manual, all-or-nothing switch (fine for one shared login —
worth revisiting once you add real per-client accounts):

```bash
curl -X POST https://your-domain.com/api/settings/ad-free \
  -H 'Content-Type: application/json' \
  -d '{"adminPassword":"your ADMIN_PASSWORD value","adFree":true}'
```

Set `"adFree":false` to turn it back on.

## Adding real per-client accounts later

The database is already shaped to make this an easier upgrade than a rewrite:
flyers and products are stored in their own tables, so the next step is adding a
`users` table, a `user_id` column on `flyers` and `products`, and swapping the
single shared password for per-user login (bcrypt + a `users` table, or something
like Better Auth since you're already using that elsewhere). Happy to build that
out whenever you're ready to start billing pharmacy clients individually or want
each client to only see their own flyers.

## A few honest limitations to know about

- **One shared password = one shared workspace.** Everyone who logs in sees and can
  edit the same saved flyers and product database. Fine for you + a couple of
  trusted people; not fine for competing clients who shouldn't see each other's
  pricing.
- **Photo search depends on Pexels.** If Pexels is unavailable or its API limits
  are reached, the rest of the flyer builder continues to work normally.
- **SQLite is fine at this scale** (one small team, a few hundred flyers/products)
  but isn't built for many simultaneous heavy writers. If this ever grows into a
  multi-client SaaS product, Postgres (which you already use for Tracely and
  JaredsCertPrep) would be the natural next step.
- **`data.sqlite` is the entire product** — no database means no saved flyers and no
  product history. Back it up like you would any client-critical file.
