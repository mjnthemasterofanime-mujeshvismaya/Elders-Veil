import 'dotenv/config';
import express from 'express';
import http from 'http';
import path from 'path';
import { Server as SocketIOServer } from 'socket.io';
import { publicRouter } from './src/server/routes/publicRoutes.ts';
import { authRouter } from './src/server/routes/authRoutes.ts';
import { directorAdminRouter } from './src/server/routes/directorAdminRoutes.ts';
import { studioRouter } from './src/server/routes/studioRoutes.ts';
import { departmentRouter } from './src/server/routes/departmentRoutes.ts';
import { resolveUserByFirebaseToken } from './src/server/middleware/auth.ts';
import { setSocketIO } from './src/server/services/notificationService.ts';

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const io = new SocketIOServer(server, {
    cors: { origin: true, credentials: true },
  });

  setSocketIO(io);

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token || typeof token !== 'string') {
        return next(new Error('Authentication required'));
      }
      const studioUser = await resolveUserByFirebaseToken(token);
      socket.data.studioUser = studioUser;
      next();
    } catch {
      next(new Error('Invalid session'));
    }
  });

  io.on('connection', (socket) => {
    const user = socket.data.studioUser;
    if (user) {
      socket.join(`user:${user.id}`);
      socket.join(`role:${user.role}`);
      for (const dept of user.departments || []) {
        socket.join(`channel:dept:${dept.departmentId}`);
      }
    }

    socket.on('channel:join', (channelKey: string) => {
      if (typeof channelKey === 'string' && channelKey.length < 100) {
        socket.join(`channel:${channelKey}`);
      }
    });
  });

  // Security headers compatible with AI Studio iframe preview
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  app.use(express.json({ limit: '4mb' }));
  app.use(express.urlencoded({ extended: true, limit: '4mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, studio: "Elder'sVeil Anime Studio" });
  });

  app.use('/api/public', publicRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/admin', directorAdminRouter);
  app.use('/api/studio', studioRouter);
  app.use('/api/departments', departmentRouter);

  // Centralized API error handler (never leak raw stack traces)
  app.use('/api', (err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('Unhandled API error:', err);
    const message = err instanceof Error ? err.message : 'Unexpected server error';
    res.status(500).json({ error: message });
  });

  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const port = Number(process.env.PORT || 3000);
  server.listen(port, '0.0.0.0', () => {
    console.log(`Elder'sVeil Anime Studio server running on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
