import { Server } from "socket.io";
import { socketAuthMiddleware } from "./auth.middleware.js";
import { db } from "../db/db.js";
import { users } from "../schemas/schema.js";
import { eq } from "drizzle-orm";

// Maps a userId to the set of socket.id's currently connected for them.
// A single user can have multiple simultaneous connections (phone + laptop),
// which is exactly why this maps to a Set, not a single socket.id.
const onlineUsers = new Map();

// Initializes Socket.IO on top of the existing HTTP server.
// Called once from index.js, right after the HTTP server is created.
export const initSocket = (httpServer) => {
  const io = new Server(httpServer, {
    cors: {
      origin: "*", // TODO: restrict this to your actual frontend origin in production
      credentials: true,
    },
  });

  // Runs once per socket, before "connection" fires.
  // If next() is called with an Error, the client never reaches
  // "connection" at all — they get a connect_error instead.
  io.use(socketAuthMiddleware);

  // ─────────────────────────────────────────────
  // CONNECTION LIFECYCLE
  // "connection" fires once per client that successfully establishes
  // a socket connection. Everything about THAT specific client — sending
  // events to them, listening for their events, knowing when they leave —
  // happens through the `socket` object passed into this callback.
  // ─────────────────────────────────────────────
  io.on("connection", async (socket) => {
    const userId = socket.userId;

    console.log(`Socket connected: ${socket.id} (userId: ${userId})`);

    // Track this socket under the user's entry in our in-memory map.
    if (!onlineUsers.has(userId)) {
      onlineUsers.set(userId, new Set());
    }
    onlineUsers.get(userId).add(socket.id);

    // Only flip the DB flag to "online" on the user's FIRST active socket.
    // If they already had another tab/device connected, they were already
    // online — no need to re-write the DB or notify anyone again.
    const isFirstConnection = onlineUsers.get(userId).size === 1;

    if (isFirstConnection) {
      await db
        .update(users)
        .set({ isOnline: true })
        .where(eq(users.id, userId));

      console.log(`User ${userId} is now ONLINE`);
      // NOTE: broadcasting this to other users (e.g. their contacts)
      // comes in a later milestone once we introduce rooms.
    }

    // "disconnect" fires when this specific client's connection closes —
    // whether from closing the browser tab, losing network, or calling
    // socket.disconnect() manually on the client.
    socket.on("disconnect", async (reason) => {
      console.log(`Socket disconnected: ${socket.id} (reason: ${reason})`);

      const userSockets = onlineUsers.get(userId);

      if (userSockets) {
        userSockets.delete(socket.id);

        // Only flip to "offline" once ALL of this user's sockets are gone —
        // closing one tab shouldn't mark them offline if another tab is
        // still connected.
        if (userSockets.size === 0) {
          onlineUsers.delete(userId);

          await db
            .update(users)
            .set({ isOnline: false, lastSeenAt: new Date() })
            .where(eq(users.id, userId));

          console.log(`User ${userId} is now OFFLINE`);
        }
      }
    });
  });

  return io;
};
