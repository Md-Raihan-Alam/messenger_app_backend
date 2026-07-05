import http from "http";
import { io as ioClient } from "socket.io-client";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";

import app from "../app.js";
import { initSocket } from "../socket/index.js";
import { db } from "../db/db.js";
import { pool } from "../db/db.js";
import { users } from "../schemas/schema.js";
import { eq } from "drizzle-orm";
import request from "supertest";

dotenv.config();

let httpServer;
let port;

// Helper: registers a user via REST, returns their raw JWT + userId
const registerAndGetToken = async (username) => {
  await request(app).post("/api/v1/auth/register").send({
    username,
    password: "123456",
  });

  const loginResponse = await request(app).post("/api/v1/auth/login").send({
    username,
    password: "123456",
  });

  // extract the raw token value out of the Set-Cookie header
  const rawCookie = loginResponse.headers["set-cookie"][0];
  const token = rawCookie.split(";")[0].split("=")[1];

  const meResponse = await request(app)
    .get("/api/v1/auth/me")
    .set("Cookie", loginResponse.headers["set-cookie"]);

  return { token, userId: meResponse.body.user.id };
};

beforeAll((done) => {
  httpServer = http.createServer(app);
  initSocket(httpServer);

  httpServer.listen(() => {
    port = httpServer.address().port;
    done();
  });
});

afterAll(async () => {
  await new Promise((resolve) => httpServer.close(resolve));
  await pool.end();
});

describe("Socket.IO Authentication & Presence", () => {
  test("Should reject connection with no token", (done) => {
    const socket = ioClient(`http://localhost:${port}`, {
      auth: {},
      reconnection: false,
    });

    socket.on("connect_error", (err) => {
      expect(err.message).toBe("Unauthorized: No token provided");
      socket.close();
      done();
    });
  });

  test("Should reject connection with an invalid token", (done) => {
    const socket = ioClient(`http://localhost:${port}`, {
      auth: { token: "garbage-token" },
      reconnection: false,
    });

    socket.on("connect_error", (err) => {
      expect(err.message).toBe("Unauthorized: Invalid or expired token");
      socket.close();
      done();
    });
  });

  test("Should connect successfully with a valid token and mark user online", (done) => {
    (async () => {
      const { token, userId } = await registerAndGetToken(
        `socketA_${Date.now()}`
      );

      const socket = ioClient(`http://localhost:${port}`, {
        auth: { token },
        reconnection: false,
      });

      socket.on("connect", async () => {
        // small delay to let the server's async DB update finish
        await new Promise((r) => setTimeout(r, 300));

        const user = await db.query.users.findFirst({
          where: (u, { eq: eqOp }) => eqOp(u.id, userId),
        });

        expect(user.isOnline).toBe(true);

        socket.close();
        done();
      });
    })();
  }, 10000);

  test("Should mark user offline after disconnecting", (done) => {
    (async () => {
      const { token, userId } = await registerAndGetToken(
        `socketB_${Date.now()}`
      );

      const socket = ioClient(`http://localhost:${port}`, {
        auth: { token },
        reconnection: false,
      });

      socket.on("connect", () => {
        socket.close();
      });

      socket.on("disconnect", async () => {
        // small delay to let the server's async DB update finish
        await new Promise((r) => setTimeout(r, 300));

        const user = await db.query.users.findFirst({
          where: (u, { eq: eqOp }) => eqOp(u.id, userId),
        });

        expect(user.isOnline).toBe(false);
        expect(user.lastSeenAt).not.toBeNull();

        done();
      });
    })();
  }, 10000);
});
