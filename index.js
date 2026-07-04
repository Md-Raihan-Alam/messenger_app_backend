import http from "http";
import app from "./app.js";
import { initSocket } from "./socket/index.js";

const PORT = process.env.PORT || 5000;

// We create the raw HTTP server explicitly instead of calling app.listen()
// directly, because Socket.IO needs to attach itself to the SAME server
// instance that Express is using. app.listen() normally does this creation
// internally and hides the server object from us — we need access to it.
const httpServer = http.createServer(app);

// Attach Socket.IO to that same server. Both Express (HTTP requests)
// and Socket.IO (WebSocket upgrades) now share one server, one port.
initSocket(httpServer);

httpServer.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
