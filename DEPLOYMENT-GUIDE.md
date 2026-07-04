# Bitvision WiFi Management System — Go‑Live Guide (No Coding, No Cost)

This guide takes you from the files on your computer to a **live website with its own
free URL**, using only **GitHub**, **Vercel**, and a free database called **Neon**.
Everything here is free and **no credit card is required**.

You do **not** need to write or understand any code. Just follow the steps in order.

---

## What you will end up with

- A live website like `https://bitvision-xxxx.vercel.app` that you can open on any phone or laptop.
- A first-run screen that lets **you** create your owner (super admin) account — no default passwords to worry about.
- Your data (users, admins, payments) stored safely in a free cloud database that never gets wiped.

**Total time:** about 20–30 minutes.

---

## Before you start — create 3 free accounts

Open these in your browser and sign up (you can use the same email for all three):

1. **GitHub** → https://github.com/signup
2. **Vercel** → https://vercel.com/signup — when it asks, choose **"Continue with GitHub"** (this links them automatically).
3. **Neon** → https://neon.tech — choose **"Sign up with GitHub"** too.

> Tip: signing up to Vercel and Neon *with GitHub* saves you time later.

---

## Step 1 — Put the code on GitHub

You have a folder called **`bitvision`**. We need to upload it to GitHub.

**The easy way (no software to install):**

1. Go to https://github.com/new
2. **Repository name:** type `bitvision`
3. Leave everything else as default. Make sure it's set to **Public** (or Private — both work).
4. Click **Create repository**.
5. On the next page, click the link **"uploading an existing file"** (it's in the line that says *"…or upload an existing file"*).
6. Open your `bitvision` folder on your computer. Select **all the files and folders inside it** (not the folder itself) and **drag them into the browser** upload box.
   - Include: the `api` folder, the `lib` folder, the `public` folder, `package.json`, and `vercel.json`.
   - You can skip `node_modules`, `test-local.js`, `preview.js`, and the screenshot files — they aren't needed online. (If you accidentally include them, it's harmless.)
7. Wait for the files to finish uploading, then click the green **Commit changes** button.

Your code is now on GitHub. ✅

---

## Step 2 — Create the free database on Neon

1. Go to https://console.neon.tech and sign in.
2. Click **New Project** (or **Create project**).
3. Give it a name like `bitvision-db`. Leave the region as the default. Click **Create**.
4. That's it — Neon made your database. We'll connect it to Vercel in the next step, so you don't need to copy anything by hand.

---

## Step 3 — Deploy on Vercel

1. Go to https://vercel.com/new
2. You'll see a list of your GitHub repositories. Find **`bitvision`** and click **Import**.
3. Vercel shows a "Configure Project" screen. **Don't change anything** — the settings are already correct because of the `vercel.json` file.
4. Click **Deploy**.
5. Wait 1–2 minutes. When it says **"Congratulations"**, your site is live — but we still need to connect the database and a security key before using it. Do **Step 4** now.

---

## Step 4 — Connect the database + add a security key

### 4a. Connect Neon to your project

1. In your Vercel project, click the **Storage** tab at the top.
2. Click **Connect Database** (or **Create / Connect**).
3. Choose **Neon** → **Connect existing** and pick the `bitvision-db` you made.
   - If it asks to install the Neon integration, click **Install / Add** and allow it.
4. When connected, Vercel automatically adds a hidden setting called `DATABASE_URL`. You don't need to touch it — that's the app talking to your database.

### 4b. Add your secret key

1. Still in your Vercel project, click the **Settings** tab, then **Environment Variables** in the left menu.
2. Add a new one:
   - **Name:** `JWT_SECRET`
   - **Value:** type a long random line of letters and numbers, e.g. `bitvision-9f83kd82ndk28fnx82mfx7` (make up your own — longer is better).
   - Leave the environments (Production/Preview/Development) all ticked.
3. Click **Save**.

### 4c. Re-deploy so the settings take effect

1. Click the **Deployments** tab.
2. On the most recent deployment, click the **⋯** (three dots) on the right → **Redeploy** → confirm **Redeploy**.
3. Wait about a minute.

---

## Step 5 — Open your site and create your account

1. In Vercel, click **Visit** (or open your `https://…vercel.app` link).
2. The very first time, Bitvision shows a **"Welcome — set up your account"** screen.
3. Enter your name, choose a username, and set a strong password. Click **Create account & sign in**.

You are now the **super admin**. 🎉 That setup screen only appears once; after this, everyone signs in normally.

---

## Step 6 — Start using it

1. Go to **Team & roles** → **Add team member** to create your managers and viewers:
   - **Viewer** — can only *see* who is connected.
   - **Manager** — can *grant* new access and *renew/restore* users.
   - **Super admin** — can do everything, including managing the team.
2. Go to **Connected users** → **Grant access** to register your first user. The form auto-fills the IP of the device opening the page; set the plan length (default 30 days) and any amount paid.
3. When 30 days pass without payment, the user is **automatically suspended**. When they pay, open them and press **Restore access** — they're back online instantly.

---

## How the WiFi cut-off actually works (important)

Bitvision is your **control panel and record book**. It knows exactly who should have
access, until when, and it stores each device's IP/MAC. It automatically flags anyone
whose 30 days are up.

To make a device *physically* lose the internet on your network, your **router** needs
to act on Bitvision's list. Two common setups:

- **Router with an API** (MikroTik, pfSense, OpenWRT, etc.): the *Suspend/Restore*
  actions can be wired to toggle a firewall/hotspot rule so access really is cut and
  restored. This is a small addition your installer or I can add.
- **Captive portal / hotspot billing** (many WiFi-selling setups already have one): point
  it at Bitvision's user list as the source of truth for who is paid-up.

If you tell me the exact router or hotspot system you use, I can wire the on/off part
directly to it.

---

## Everyday tips

- **Sharing the link:** anyone with the `vercel.app` link can reach the *sign-in page*,
  but only people with an account can get in. Keep accounts to your trusted team.
- **Your own domain (optional, still free):** in Vercel → **Settings → Domains** you can
  add a custom domain if you own one. Not required.
- **Free limits:** Neon's free database and Vercel's free hosting are comfortably enough
  for 100+ users and a small team. You won't be charged unless you deliberately upgrade.
- **Forgot a team member's password?** As super admin, open them in **Team & roles →
  Edit** and set a new one.

---

## If something doesn't work

- **The site loads but says a database error:** re-check Step 4 — the Neon database must
  be connected (Storage tab) and you must have **redeployed** afterwards (Step 4c).
- **"Please sign in" loops / can't log in:** make sure you added `JWT_SECRET` (Step 4b)
  and redeployed.
- **Changes to files:** if you upload new files to GitHub later, Vercel automatically
  rebuilds and updates your live site within a minute.

That's everything. Once deployed, you manage the whole thing from the website — you never
need to touch the code again.
