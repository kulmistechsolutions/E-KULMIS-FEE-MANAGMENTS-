# Fix Vercel Environment Variable Error - Simple Guide

## 🎯 The Problem
You're getting: `Environment Variable "VITE_API_URL" references Secret "api_url", which does not exist.`

## ✅ The Solution (Do This Now)

### Step 1: Open Your Vercel Project

1. Go to: https://vercel.com/dashboard
2. Click on your project name

### Step 2: Go to Environment Variables

1. Click **"Settings"** tab (top menu)
2. Click **"Environment Variables"** (left sidebar)

### Step 3: Add the Variable

1. Look for a section that says **"Environment Variables"**
2. You'll see a form or button to add variables
3. Fill in these EXACT values:

   ```
   Key: VITE_API_URL
   Value: https://YOUR-BACKEND-URL.onrender.com/api
   ```

   **⚠️ Replace `YOUR-BACKEND-URL` with your actual Render backend URL!**

   Example:
   ```
   Key: VITE_API_URL
   Value: https://rowdafee-backend-abc123.onrender.com/api
   ```

4. Check these THREE boxes:
   - ☑️ Production
   - ☑️ Preview  
   - ☑️ Development

5. Click **"Save"** or **"Add"** button

### Step 4: Redeploy

1. Click **"Deployments"** tab (top menu)
2. Find your latest deployment
3. Click the **"..."** (three dots) button
4. Click **"Redeploy"**
5. Click **"Redeploy"** again to confirm

### Step 5: Wait & Test

1. Wait 2-3 minutes for deployment
2. Visit your Vercel URL
3. Try to login with: `ROWDA` / `ROWDA123`
4. If it works, you're done! ✅

---

## 🔍 Where to Find Your Render Backend URL

1. Go to: https://dashboard.render.com
2. Click on your Web Service
3. Copy the URL shown at the top (e.g., `https://rowdafee-backend.onrender.com`)
4. Add `/api` to the end: `https://rowdafee-backend.onrender.com/api`

---

## ❌ What NOT to Do

- ❌ Don't use `@api_url` or any secret syntax
- ❌ Don't put it in vercel.json file
- ❌ Don't use `http://localhost:5000` (won't work)
- ❌ Don't forget the `/api` at the end

---

## ✅ What to Do

- ✅ Set it in Vercel Dashboard → Settings → Environment Variables
- ✅ Use your actual Render backend URL
- ✅ Make sure URL ends with `/api`
- ✅ Redeploy after adding it

---

## Still Not Working?

1. **Double-check the variable name**: Must be exactly `VITE_API_URL` (case-sensitive)
2. **Check the value**: Must be full URL ending with `/api`
3. **Make sure you redeployed**: Changes only apply after redeploy
4. **Check deployment logs**: Look for errors in the build logs

---

## Quick Copy-Paste Checklist

- [ ] Added `VITE_API_URL` in Vercel Dashboard
- [ ] Value is `https://your-backend.onrender.com/api`
- [ ] All 3 environments checked (Production, Preview, Development)
- [ ] Saved the variable
- [ ] Redeployed the project
- [ ] Tested login on deployed site

---

That's it! The error should be fixed now. 🎉

