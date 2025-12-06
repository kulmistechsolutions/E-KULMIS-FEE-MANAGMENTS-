# Complete Vercel Setup Guide - Step by Step

## ⚠️ IMPORTANT: Remove Secret References

The error you're seeing happens because Vercel is trying to use a secret that doesn't exist. Follow these steps EXACTLY:

---

## Step 1: Delete Root vercel.json (if deploying separately)

If you're deploying frontend and backend separately, you don't need the root `vercel.json`. 

**If it exists, delete it or ignore it** - Vercel will use `frontend/vercel.json` when root directory is set to `frontend`.

---

## Step 2: Set Up Frontend Project in Vercel

### A. Import Project

1. Go to [vercel.com/dashboard](https://vercel.com/dashboard)
2. Click **"Add New..."** → **"Project"**
3. Click **"Import"** next to `kulmistechsolutions/ROWDAFEEMS`
4. Click **"Configure Project"**

### B. Configure Settings

1. **Project Name**: `rowdafee-frontend` (or your choice)

2. **Framework Preset**: 
   - Click "Override" 
   - Select **"Vite"**

3. **Root Directory**: 
   - Click "Edit"
   - Type: `frontend`
   - Click "Continue"

4. **Build and Output Settings**:
   - Build Command: `npm run build` (should auto-detect)
   - Output Directory: `dist` (should auto-detect)
   - Install Command: `npm install` (should auto-detect)

### C. Add Environment Variable (BEFORE FIRST DEPLOY)

**⚠️ CRITICAL: Do this BEFORE clicking "Deploy"**

1. Scroll down to **"Environment Variables"** section
2. Click **"Add"** or **"Add New"**
3. Fill in:
   ```
   Key: VITE_API_URL
   Value: https://your-backend.onrender.com/api
   ```
   **Replace `your-backend.onrender.com` with your actual Render backend URL!**
   
   Example: `https://rowdafee-backend-abc123.onrender.com/api`

4. Check ALL three boxes:
   - ✅ Production
   - ✅ Preview
   - ✅ Development

5. Click **"Add"** or **"Save"**

### D. Deploy

1. Scroll to bottom
2. Click **"Deploy"** button
3. Wait for deployment to complete (2-5 minutes)

---

## Step 3: Verify Environment Variable is Set

After deployment:

1. Go to your project dashboard
2. Click **"Settings"** tab
3. Click **"Environment Variables"** in left sidebar
4. You should see `VITE_API_URL` listed
5. If it's NOT there, click **"Add New"** and add it again

---

## Step 4: Redeploy if Needed

If you added the environment variable AFTER the first deployment:

1. Go to **"Deployments"** tab
2. Click the **"..."** (three dots) menu on the latest deployment
3. Click **"Redeploy"**
4. Select **"Use existing Build Cache"** (optional)
5. Click **"Redeploy"**

---

## Common Issues & Solutions

### Issue 1: "Secret does not exist" error

**Cause**: There's still a reference to `@api_url` somewhere

**Solution**:
1. Make sure `frontend/vercel.json` does NOT have `env` section with `@api_url`
2. Delete root `vercel.json` if it exists
3. Set environment variable in Vercel Dashboard (not in files)
4. Redeploy

### Issue 2: Can't add environment variable

**Solution**:
1. Make sure you're in the project settings (not team settings)
2. Try using Vercel CLI:
   ```bash
   npm i -g vercel
   vercel login
   cd frontend
   vercel env add VITE_API_URL
   # Paste your backend URL when prompted
   ```

### Issue 3: Environment variable not working

**Solution**:
1. Make sure you redeployed AFTER adding the variable
2. Check that the variable name is exactly: `VITE_API_URL` (case-sensitive)
3. Make sure the value ends with `/api`
4. Check deployment logs for build errors

---

## Quick Checklist

- [ ] Project imported from GitHub
- [ ] Root Directory set to `frontend`
- [ ] Framework set to `Vite`
- [ ] Environment Variable `VITE_API_URL` added in Vercel Dashboard
- [ ] Value is your Render backend URL + `/api`
- [ ] All environments checked (Production, Preview, Development)
- [ ] Deployed successfully
- [ ] Tested login on deployed site

---

## Test Your Deployment

1. Visit your Vercel URL: `https://your-project.vercel.app`
2. Open browser console (F12)
3. Check for errors
4. **⚠️ IMPORTANT: Create Admin User First!**

   Before you can login, you need to create an admin user in your deployed backend database:
   
   **Option 1: Using create-admin script (Recommended)**
   ```bash
   # Connect to your backend environment
   cd backend
   # Make sure your .env has the correct DATABASE_URL pointing to your production database
   npm run create-admin ROWDA rowda@rowdatul-iimaan.com ROWDA123
   ```
   
   **Option 2: Using reset-database script**
   ```bash
   cd backend
   # ⚠️ WARNING: This deletes all data!
   npm run reset-db
   # This will create ROWDA user automatically
   ```

5. Try to login with:
   - Username: `ROWDA`
   - Password: `ROWDA123`
6. If login works, you're connected! ✅

---

## 🔐 Login Credentials Setup

### Default Admin User (Created by setup-db)
- Username: `admin`
- Password: `admin123`

### ROWDA Admin User (Created by reset-db or create-admin)
- Username: `ROWDA`
- Password: `ROWDA123`

**To create ROWDA user on your production database:**
```bash
cd backend
# Set DATABASE_URL to your production database in .env
npm run create-admin ROWDA rowda@rowdatul-iimaan.com ROWDA123
```

**⚠️ Note:** If you can't login, make sure:
1. The admin user exists in your database
2. You're using the correct database (production vs local)
3. Your backend is connected to the same database

## Still Having Issues?

### Issue: 405 (Method Not Allowed) Error on Login

**Error Message:**
```
POST https://your-vercel-app.vercel.app/api/auth/login 405 (Method Not Allowed)
```

**Cause:** The frontend is trying to call the API on your Vercel domain instead of your backend server.

**Solution:**
1. **Set VITE_API_URL Environment Variable** (MOST IMPORTANT):
   - Go to Vercel Dashboard → Your Project → Settings → Environment Variables
   - Add: `VITE_API_URL` = `https://your-backend.onrender.com/api`
   - Make sure to check all 3 environments (Production, Preview, Development)
   - Click Save

2. **Redeploy Your Frontend:**
   - Go to Deployments tab
   - Click "..." on latest deployment → "Redeploy"
   - Wait for deployment to complete

3. **Verify Backend URL:**
   - Your backend should be running on Render (or another service)
   - Test: Visit `https://your-backend.onrender.com/api/health`
   - Should return: `{"status":"ok","message":"Server is running"}`

4. **Clear Browser Cache:**
   - Hard refresh (Ctrl+Shift+R or Cmd+Shift+R)
   - Or clear browser cache and reload

### Issue: Can't Login?

1. **Verify Admin User Exists:**
   - Connect to your production database
   - Run: `npm run create-admin ROWDA rowda@rowdatul-iimaan.com ROWDA123`
   - Make sure your `.env` points to production database

2. **Try Default Credentials:**
   - Username: `admin`
   - Password: `admin123`

3. **Check Database Connection:**
   - Verify backend can connect to database
   - Check backend logs for errors

### Other Issues:

1. **Check Vercel Logs:**
   - Go to Deployment → Click on failed deployment → View logs

2. **Verify Backend is Running:**
   - Visit: `https://your-backend.onrender.com/api/health`
   - Should return: `{"status":"ok","message":"Server is running"}`

3. **Check CORS:**
   - Make sure backend CORS allows your Vercel domain
   - Check `backend/server.js` CORS configuration
   - Add your Vercel domain to `FRONTEND_URL` in backend `.env`

---

## Example Environment Variable Value

```
https://rowdafee-backend-abc123.onrender.com/api
```

NOT:
- `https://your-backend.onrender.com/api` (this is just an example)
- `http://localhost:5000/api` (won't work in production)
- Missing `/api` at the end

