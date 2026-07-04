import { Server } from "socket.io";

// Initializes Socket.IO on top of the existing HTTP server.
// Called once from index.js, right after the HTTP server is created.
export const initSocket = (httpServer) => {
  const io = new Server(httpServer, {
    cors: {
      origin: "*", // TODO: restrict this to your actual frontend origin in production
      credentials: true,
    },
  });

  // ─────────────────────────────────────────────
  // CONNECTION LIFECYCLE
  // "connection" fires once per client that successfully establishes
  // a socket connection. Everything about THAT specific client — sending
  // events to them, listening for their events, knowing when they leave —
  // happens through the `socket` object passed into this callback.
  // ─────────────────────────────────────────────
  io.on("connection", (socket) => {
    console.log(`Socket connected: ${socket.id}`);

    // "disconnect" fires when this specific client's connection closes —
    // whether from closing the browser tab, losing network, or calling
    // socket.disconnect() manually on the client.
    socket.on("disconnect", (reason) => {
      console.log(`Socket disconnected: ${socket.id} (reason: ${reason})`);
    });
  });

  return io;
};
