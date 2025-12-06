# 🔧 Fix 405 (Method Not Allowed) Error - Quick Guide

## ❌ The Error

You're seeing this error in the browser console:
```
POST https://rowdafeems-cu97.vercel.app/api/auth/login 405 (Method Not Allowed)
```

## 🎯 What This Means

Your frontend is trying to call `/api/auth/login` on your **Vercel domain** (where there's no backend), instead of your **backend server** (Render or other service).

## ✅ The Fix (3 Simple Steps)

### Step 1: Set Environment Variable in Vercel

1. Go to: https://vercel.com/dashboard
2. Click on your project: `rowdafeems-cu97` (or your project name)
3. Click **"Settings"** tab
4. Click **"Environment Variables"** in left sidebar
5. Click **"Add New"** or **"Add"** button
6. Fill in:
   - **Key:** `VITE_API_URL`
   - **Value:** `https://your-backend-url.onrender.com/api`
     - ⚠️ **Replace with your actual backend URL!**
     - Example: `https://rowdafee-backend-abc123.onrender.com/api`
   - Check ALL 3 boxes:
     - ✅ Production
     - ✅ Preview
     - ✅ Development
7. Click **"Save"**

### Step 2: Redeploy Your Frontend

1. Click **"Deployments"** tab
2. Find your latest deployment
3. Click the **"..."** (three dots) button
4. Click **"Redeploy"**
5. Click **"Redeploy"** again to confirm
6. Wait 2-3 minutes for deployment to complete

### Step 3: Test Again

1. Visit your Vercel URL: `https://rowdafeems-cu97.vercel.app`
2. Try to login
3. The error should be gone! ✅

---

## 🔍 How to Find Your Backend URL

### If Using Render:

1. Go to: https://dashboard.render.com
2. Click on your Web Service (backend)
3. Copy the URL shown at the top
4. Add `/api` to the end
5. Example: `https://rowdafee-backend-abc123.onrender.com/api`

### If Using Another Service:

- Your backend URL should look like: `https://your-backend-domain.com/api`
- Always include `/api` at the end

---

## 🧪 Verify Your Backend is Working

Before fixing the frontend, test your backend:

1. Open browser or use curl
2. Visit: `https://your-backend-url.onrender.com/api/health`
3. You should see: `{"status":"ok","message":"Server is running"}`

If this doesn't work, your backend might not be running or accessible.

---

## ❓ Common Questions

### Q: What if I don't have a backend URL yet?

**A:** You need to deploy your backend first:
- Deploy backend to Render (or another service)
- Get the backend URL
- Then set `VITE_API_URL` in Vercel

### Q: Do I need to rebuild/redeploy?

**A:** Yes! After adding environment variables, you MUST redeploy for changes to take effect.

### Q: The error is still there after redeploying?

**A:** Try:
1. Hard refresh browser (Ctrl+Shift+R)
2. Clear browser cache
3. Check Vercel deployment logs for errors
4. Verify `VITE_API_URL` is set correctly (must include `/api`)

### Q: What should the VITE_API_URL value be?

**A:** 
- ✅ Good: `https://rowdafee-backend-abc123.onrender.com/api`
- ❌ Bad: `https://rowdafee-backend-abc123.onrender.com` (missing `/api`)
- ❌ Bad: `http://localhost:5000/api` (won't work in production)

---

## 📝 Quick Checklist

- [ ] Found your backend URL
- [ ] Added `VITE_API_URL` in Vercel Dashboard
- [ ] Value is full URL ending with `/api`
- [ ] All 3 environments checked (Production, Preview, Development)
- [ ] Saved the environment variable
- [ ] Redeployed the frontend
- [ ] Waited for deployment to complete
- [ ] Tested login on deployed site
- [ ] Error is fixed! 🎉

---

## 🆘 Still Not Working?

1. **Double-check the variable name:** Must be exactly `VITE_API_URL` (case-sensitive)
2. **Verify backend is running:** Visit your backend health endpoint
3. **Check deployment logs:** Look for errors in Vercel deployment logs
4. **Test backend directly:** Try `curl https://your-backend.onrender.com/api/health`
5. **Clear browser cache:** Hard refresh or clear cache completely

---

That's it! Your 405 error should be fixed now. 🚀

