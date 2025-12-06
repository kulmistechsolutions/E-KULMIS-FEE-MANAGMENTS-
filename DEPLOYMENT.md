# Deployment Guide - Vercel

## Frontend Deployment to Vercel

### Step 1: Connect Repository
1. Go to [vercel.com](https://vercel.com)
2. Click "New Project"
3. Import your GitHub repository: `kulmistechsolutions/ROWDAFEEMS`

### Step 2: Configure Project
- **Framework Preset**: Vite
- **Root Directory**: `frontend`
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Install Command**: `npm install`

### Step 3: Environment Variables
Add these environment variables in Vercel:
- `VITE_API_URL`: Your backend API URL (e.g., `https://your-backend.railway.app/api`)

### Step 4: Deploy
Click "Deploy" and wait for deployment to complete.

---

## Backend Deployment (Recommended: Railway)

### Why Railway instead of Vercel?
- Vercel is optimized for serverless functions
- Railway provides better support for long-running Express.js servers
- Better for Socket.io connections

### Railway Deployment Steps

1. **Go to [Railway](https://railway.app)**
2. **Create New Project**
3. **Add PostgreSQL Database**
   - Railway will provide a `DATABASE_URL`
4. **Add Node.js Service**
   - Connect your GitHub repository
   - Root Directory: `backend`
   - Build Command: `npm install`
   - Start Command: `npm start`

5. **Set Environment Variables**
   ```
   DATABASE_URL=<provided by Railway>
   JWT_SECRET=<generate a random secret>
   PORT=5000
   NODE_ENV=production
   ```

6. **Deploy**
   - Railway will automatically deploy
   - Note the generated URL (e.g., `https://your-app.railway.app`)

7. **Update Frontend API URL**
   - In Vercel, update `VITE_API_URL` to point to your Railway backend
   - Redeploy frontend

---

## Alternative: Backend on Render

### Render Deployment Steps

1. **Go to [Render](https://render.com)**
2. **Create New Web Service**
3. **Connect Repository**
   - Repository: `kulmistechsolutions/ROWDAFEEMS`
   - Root Directory: `backend`
   - Build Command: `npm install`
   - Start Command: `npm start`

4. **Add PostgreSQL Database**
   - Create PostgreSQL database
   - Copy the `Internal Database URL`

5. **Environment Variables**
   ```
   DATABASE_URL=<Internal Database URL>
   JWT_SECRET=<your-secret-key>
   PORT=10000
   NODE_ENV=production
   ```

6. **Deploy**

---

## Post-Deployment

### 1. Setup Database
After backend is deployed, run:
```bash
# SSH into your backend or use Railway/Render console
npm run setup-db
npm run create-admin
```

### 2. Update Frontend
Update `VITE_API_URL` in Vercel to point to your deployed backend.

### 3. Configure CORS
Ensure your backend CORS allows your Vercel frontend URL:
```javascript
// backend/server.js
const allowedOrigins = [
  'http://localhost:3000',
  'https://your-frontend.vercel.app'
];
```

### 4. Test Deployment
- Visit your Vercel frontend URL
- Test login
- Test features
- Verify Socket.io connections

---

## Quick Deployment Checklist

- [ ] Frontend deployed on Vercel
- [ ] Backend deployed on Railway/Render
- [ ] Database setup completed
- [ ] Admin user created
- [ ] Environment variables configured
- [ ] CORS configured
- [ ] Frontend API URL updated
- [ ] Socket.io working
- [ ] All features tested

---

## Troubleshooting

### Socket.io Connection Issues
- Ensure WebSocket is enabled on your hosting platform
- Check CORS settings
- Verify Socket.io transport configuration

### Database Connection Issues
- Check `DATABASE_URL` format
- Ensure database is accessible from your backend
- Run database migrations if needed

### Build Failures
- Check Node.js version (should be 18+)
- Verify all dependencies are in `package.json`
- Check build logs for specific errors

