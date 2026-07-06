import http from "http";
import { io as ioClient } from "socket.io-client";
import request from "supertest";

import app from "../app.js";
import { initSocket } from "../socket/index.js";
import { pool } from "../db/db.js";

let httpServer;
let port;

const registerAndGetToken = async (username) => {
  await request(app).post("/api/v1/auth/register").send({
    username,
    password: "123456",
  });

  const loginResponse = await request(app).post("/api/v1/auth/login").send({
    username,
    password: "123456",
  });

  const rawCookie = loginResponse.headers["set-cookie"][0];
  const token = rawCookie.split(";")[0].split("=")[1];
  const cookies = loginResponse.headers["set-cookie"];

  const meResponse = await request(app)
    .get("/api/v1/auth/me")
    .set("Cookie", cookies);

  return { token, cookies, userId: meResponse.body.user.id };
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

describe("Message Broadcasting via Socket.IO Rooms", () => {
  test("Should broadcast a new message to other conversation members in real time", (done) => {
    (async () => {
      const userA = await registerAndGetToken(`broadcastA_${Date.now()}`);
      const userB = await registerAndGetToken(`broadcastB_${Date.now()}`);

      const conversationResponse = await request(app)
        .post("/api/v1/conversations")
        .set("Cookie", userA.cookies)
        .send({
          participantIds: [userB.userId],
          isGroup: false,
        });

      const conversationId = conversationResponse.body.conversation.id;

      const socketA = ioClient(`http://localhost:${port}`, {
        auth: { token: userA.token },
        reconnection: false,
      });

      const socketB = ioClient(`http://localhost:${port}`, {
        auth: { token: userB.token },
        reconnection: false,
      });

      // Wait for both sockets to connect (and join their rooms) before
      // sending the message — otherwise B might not be in the room yet.
      await Promise.all([
        new Promise((resolve) => socketA.on("roomsReady", resolve)),
        new Promise((resolve) => socketB.on("roomsReady", resolve)),
      ]);

      // small delay to let the async room-join (getUserConversationIds)
      // finish on the server before we send the message
      //   await new Promise((r) => setTimeout(r, 300));

      socketB.on("newMessage", (message) => {
        expect(message.content).toBe("real-time test message");
        expect(message.conversationId).toBe(conversationId);
        expect(message.senderId).toBe(userA.userId);

        socketA.close();
        socketB.close();
        done();
      });

      await request(app)
        .post("/api/v1/messages")
        .set("Cookie", userA.cookies)
        .send({
          conversationId,
          content: "real-time test message",
        });
    })();
  }, 15000);

  test("Should NOT broadcast a message to users outside the conversation", (done) => {
    (async () => {
      const userA = await registerAndGetToken(`broadcastC_${Date.now()}`);
      const userB = await registerAndGetToken(`broadcastD_${Date.now()}`);
      const outsider = await registerAndGetToken(`broadcastE_${Date.now()}`);

      const conversationResponse = await request(app)
        .post("/api/v1/conversations")
        .set("Cookie", userA.cookies)
        .send({
          participantIds: [userB.userId],
          isGroup: false,
        });

      const conversationId = conversationResponse.body.conversation.id;

      const outsiderSocket = ioClient(`http://localhost:${port}`, {
        auth: { token: outsider.token },
        reconnection: false,
      });

      await new Promise((resolve) => outsiderSocket.on("roomsReady", resolve)); //   await new Promise((r) => setTimeout(r, 300));

      let received = false;

      outsiderSocket.on("newMessage", () => {
        received = true;
      });

      await request(app)
        .post("/api/v1/messages")
        .set("Cookie", userA.cookies)
        .send({
          conversationId,
          content: "outsider should not see this",
        });

      // Give the broadcast a moment to (not) arrive, then assert
      setTimeout(() => {
        expect(received).toBe(false);
        outsiderSocket.close();
        done();
      }, 1000);
    })();
  }, 15000);
});
