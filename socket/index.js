import { Server } from "socket.io";
import { socketAuthMiddleware } from "./auth.middleware.js";
import { db } from "../db/db.js";
import { users, conversationMembers } from "../schemas/schema.js";
import { eq, and } from "drizzle-orm";

// Maps a userId to the set of socket.id's currently connected for them.
// A single user can have multiple simultaneous connections (phone + laptop),
// which is exactly why this maps to a Set, not a single socket.id.
const onlineUsers = new Map();

// Holds the single io instance for the app's lifetime, set once by
// initSocket(). Other modules (like message.service.js) retrieve it
// via getIO() instead of importing initSocket directly — this avoids
// circular imports and avoids threading `io` through every function call.
let io;

// Fetches every conversation this user belongs to, so we can join
// their socket to each corresponding room on connect.
const getUserConversationIds = async (userId) => {
  const memeberships = await db.query.conversationMembers.findMany({
    where: (cm, { eq: eqOp }) => eqOp(cm.userId, userId),
  });
  return memeberships.map((m) => m.conversationId);
};

// Confirms a user is actually a member of a conversation before letting
// their socket broadcast typing events into that conversation's room.
// Without this, any authenticated user could spam typing indicators
// into conversations they don't belong to.
const isConversationMember = async (conversationId, userId) => {
  const membership = await db.query.conversationMembers.findFirst({
    where: (cm, { eq: eqOp, and: andOp }) =>
      andOp(eqOp(cm.conversationId, conversationId), eqOp(cm.userId, userId)),
  });

  return !!membership;
};

// Initializes Socket.IO on top of the existing HTTP server.
// Called once from index.js, right after the HTTP server is created.
export const initSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: "http://localhost:3000", // TODO: update for production frontend URL
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
  io.on("connection", (socket) => {
    const userId = socket.userId;

    console.log(`Socket connected: ${socket.id} (userId: ${userId})`);

    // Track this socket under the user's entry in our in-memory map.
    if (!onlineUsers.has(userId)) {
      onlineUsers.set(userId, new Set());
    }
    onlineUsers.get(userId).add(socket.id);

    const isFirstConnection = onlineUsers.get(userId).size === 1;

    // "disconnect" fires when this specific client's connection closes —
    // whether from closing the browser tab, losing network, or calling
    // socket.disconnect() manually on the client.
    //
    // IMPORTANT: this listener is registered synchronously, immediately,
    // BEFORE any `await` happens in this function. Sockets are plain
    // EventEmitters — if "disconnect" fires before a listener is attached,
    // the event is simply lost, with no buffering. If a client connects
    // and disconnects extremely fast (as happens in automated tests, or
    // flaky mobile networks), an `await` placed before this registration
    // could cause us to completely miss the disconnect and never flip
    // the user back to offline. Registering this first guarantees we
    // never miss it, no matter how quickly the client disconnects.
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

          // Broadcast to everyone currently connected so any open
          // conversation with this user can update their status live.
          // Using io.emit (not io.to(room)) since we don't know in
          // advance which conversations/clients care about this user.
          io.emit("userOffline", { userId });
        }
      }
    });

    // ─────────────────────────────────────────────
    // TYPING INDICATORS
    // Unlike every event so far, THIS one originates from the client:
    // the client calls socket.emit("typing", { conversationId }), and
    // we listen for it here with socket.on("typing", ...). There is no
    // REST equivalent and nothing is persisted — this is purely a live,
    // ephemeral signal re-broadcast to the rest of the room.
    //
    // socket.to(room) (as opposed to io.to(room)) broadcasts to everyone
    // in the room EXCEPT the sender's own socket — the typing user
    // doesn't need to see their own "is typing" indicator.
    // ─────────────────────────────────────────────
    socket.on("typing", async ({ conversationId }) => {
      const isMember = await isConversationMember(conversationId, userId);

      if (!isMember) {
        return; // silently ignore — not a member, not their business
      }

      socket.to(`conversation:${conversationId}`).emit("typing", {
        conversationId,
        userId,
      });
    });

    socket.on("stopTyping", async ({ conversationId }) => {
      const isMember = await isConversationMember(conversationId, userId);

      if (!isMember) {
        return;
      }

      socket.to(`conversation:${conversationId}`).emit("stopTyping", {
        conversationId,
        userId,
      });
    });

    // ─────────────────────────────────────────────
    // ROOM JOINING
    // socket.join(roomName) adds this socket to a room. A socket can be
    // in many rooms at once. Rooms are entirely in-memory on the Socket.IO
    // server — joining a room does NOT touch the database, it's purely
    // about which sockets receive which broadcasts.
    //
    // We join one room per conversation this user belongs to, so that
    // later, `io.to("conversation:7").emit(...)` reaches exactly the
    // members of conversation 7 — no more, no less.
    // ─────────────────────────────────────────────
    getUserConversationIds(userId)
      .then((conversationIds) => {
        conversationIds.forEach((conversationId) => {
          socket.join(`conversation:${conversationId}`);
        });
        console.log(
          `Socket ${socket.id} joined ${conversationIds.length} conversation room(s)`
        );
        // Tell THIS client their room setup is complete. Clients (and our
        // tests) should wait for this event instead of guessing a delay —
        // "connect" only means the handshake succeeded, not that room
        // joins (which depend on an async DB query) have finished.
        socket.emit("roomsReady");
      })
      .catch((e) => {
        console.error("Failed to join conversation rooms:", e);
      });

    // Only flip the DB flag to "online" on the user's FIRST active socket.
    // If they already had another tab/device connected, they were already
    // online — no need to re-write the DB or notify anyone again.
    //
    // This runs AFTER the disconnect listener is registered above, since
    // it's just a side effect with no ordering dependency on anything else
    // in this scope — it doesn't need to block listener registration.
    if (isFirstConnection) {
      db.update(users)
        .set({ isOnline: true })
        .where(eq(users.id, userId))
        .then(() => {
          console.log(`User ${userId} is now ONLINE`);

          // Broadcast to everyone currently connected so any open
          // conversation with this user can update their status live.
          io.emit("userOnline", { userId });
        })
        .catch((e) => {
          console.error("Failed to mark user online:", e);
        });
    }
  });

  return io;
};

// Returns the shared io instance. Throws clearly if called before
// initSocket() has run, rather than failing with a confusing
// "cannot call .to() of undefined" error somewhere else in the app.
export const getIO = () => {
  if (!io) {
    throw new Error("Socket.IO has not been initialized yet");
  }

  return io;
};

// Joins ALL of a user's currently active sockets (they may have multiple —
// phone + laptop, several tabs) to a given room, live, without requiring
// a reconnect. Used when a user is added to a conversation mid-session
// (e.g. added to a group chat while already connected).
//
// If the user has no active sockets right now (they're offline), this is
// a no-op — when they eventually connect, initSocket's normal connection
// handler will join them to ALL their conversations (including this new
// one) automatically, since getUserConversationIds() re-queries the DB
// fresh on every connect.
export const joinUserToRoom = (userId, roomName) => {
  const socketIds = onlineUsers.get(userId);
  if (!socketIds || socketIds.size === 0) {
    return; // user isn't currently connected — nothing to do right now
  }
  const socketsNamespace = getIO().sockets;
  socketIds.forEach((socketId) => {
    const socket = socketsNamespace.sockets.get(socketId);
    if (socket) {
      socket.join(roomName);
    }
  });
  console.log(
    `Joined ${socketIds.size} active socket(s) of user ${userId} to room ${roomName}`
  );
};