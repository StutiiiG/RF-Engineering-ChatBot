# Deployment Guide

Recommended stack: **Vercel** (frontend) + **Render** (backend) + **MongoDB Atlas** (database). All have free tiers — total cost $0.

---

## Step 1 — MongoDB Atlas

Do this first. You need the connection URL before deploying the backend.

1. Go to [mongodb.com/atlas](https://mongodb.com/atlas) → create a free account → **Create a free M0 cluster**
2. **Database Access** → Add a database user → save the username and password
3. **Network Access** → Add IP Address → select **Allow access from anywhere** (`0.0.0.0/0`) — required for Render
4. Click **Connect** → **Drivers** → copy the connection string and replace `<password>` with yours

It will look like:
```
mongodb+srv://youruser:yourpass@cluster0.xxxxx.mongodb.net/rf_chatbot
```

---

## Step 2 — Push to GitHub

If you haven't already:

```bash
cd rf-engineering-assistant
git init
git remote add origin https://github.com/YOUR_USERNAME/rf-engineering-assistant.git
git branch -M main
git add .
git commit -m "initial commit"
git push -u origin main
```

---

## Step 3 — Deploy Backend on Render

1. Go to [render.com](https://render.com) → sign up with GitHub
2. Click **New → Web Service** → connect your `rf-engineering-assistant` repo
3. Configure the service:

| Field | Value |
|---|---|
| Name | `rf-engineering-api` |
| Root Directory | `backend` |
| Runtime | `Python 3` |
| Build Command | `pip install -r requirements.txt` |
| Start Command | `uvicorn server:app --host 0.0.0.0 --port $PORT` |
| Instance Type | Free |

4. Scroll to **Environment Variables** and add:

| Key | Value |
|---|---|
| `MONGO_URL` | Your Atlas connection string |
| `DB_NAME` | `rf_chatbot` |
| `JWT_SECRET` | Any long random string |
| `OPENAI_API_KEY` | `sk-...` |
| `ANTHROPIC_API_KEY` | `sk-ant-...` |
| `GOOGLE_API_KEY` | `AIza...` |

You only need keys for the models you want to enable.

5. Click **Create Web Service** — first deploy takes ~3 minutes
6. Your backend URL will be: `https://rf-engineering-api.onrender.com` — copy this for the next step

> **Note:** Free Render instances spin down after 15 minutes of inactivity. The first request after sleep takes ~30 seconds to cold start. Upgrade to the $7/mo Starter plan to keep it always-on.

---

## Step 4 — Deploy Frontend on Vercel

1. Go to [vercel.com](https://vercel.com) → sign up with GitHub
2. Click **New Project** → import your `rf-engineering-assistant` repo
3. Set **Root Directory** to `frontend`
4. Under **Environment Variables** add:

| Key | Value |
|---|---|
| `REACT_APP_BACKEND_URL` | `https://rf-engineering-api.onrender.com` |

5. Click **Deploy** — takes about 2 minutes
6. Your live URL: `https://rf-engineering-assistant.vercel.app`

---

## Step 5 — Verify

Test the backend directly:

```bash
curl https://rf-engineering-api.onrender.com/api/
# Expected: {"message": "RF-Intel API is running", ...}
```

Then open your Vercel URL, register an account, upload a PDF, and send a message.

---

## Updating after code changes

Both Vercel and Render auto-deploy on every push to `main`:

```bash
git add .
git commit -m "your change"
git push
```

No manual steps needed.

---

## Add the live link to your GitHub repo

On the repo page → click the gear ⚙️ next to **About** → paste your Vercel URL in the **Website** field. A working live demo is one of the strongest portfolio signals.

---

## Alternative Platforms

| Service | Frontend | Backend | Notes |
|---|---|---|---|
| Railway | ✓ | ✓ | $5 credit/mo free, simpler than Render |
| Fly.io | — | ✓ | Better free tier for always-on backend |
| Netlify | ✓ | — | Alternative to Vercel for frontend |
| DigitalOcean | ✓ | ✓ | App Platform, $5/mo minimum |
