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

describe("Live messageSeen Broadcasting", () => {
  test("Should broadcast messageSeen to the conversation room when a member marks a message seen", (done) => {
    (async () => {
      const userA = await registerAndGetToken(`seenA_${Date.now()}`);
      const userB = await registerAndGetToken(`seenB_${Date.now()}`);

      const conversationResponse = await request(app)
        .post("/api/v1/conversations")
        .set("Cookie", userA.cookies)
        .send({
          participantIds: [userB.userId],
          isGroup: false,
        });

      const conversationId = conversationResponse.body.conversation.id;

      const sendResponse = await request(app)
        .post("/api/v1/messages")
        .set("Cookie", userA.cookies)
        .send({
          conversationId,
          content: "seen broadcast test",
        });

      const messageId = sendResponse.body.data.id;

      const socketA = ioClient(`http://localhost:${port}`, {
        auth: { token: userA.token },
        reconnection: false,
      });

      await new Promise((resolve) => socketA.on("roomsReady", resolve));

      socketA.on("messageSeen", (data) => {
        expect(data.messageId).toBe(messageId);
        expect(data.userId).toBe(userB.userId);
        expect(data.seenAt).toBeDefined();

        socketA.close();
        done();
      });

      await request(app)
        .patch(`/api/v1/messages/${messageId}/seen`)
        .set("Cookie", userB.cookies);
    })();
  }, 15000);

  test("Should reject marking a message seen if the user is not a conversation member", async () => {
    const userA = await registerAndGetToken(`seenC_${Date.now()}`);
    const userB = await registerAndGetToken(`seenD_${Date.now()}`);
    const outsider = await registerAndGetToken(`seenE_${Date.now()}`);

    const conversationResponse = await request(app)
      .post("/api/v1/conversations")
      .set("Cookie", userA.cookies)
      .send({
        participantIds: [userB.userId],
        isGroup: false,
      });

    const conversationId = conversationResponse.body.conversation.id;

    const sendResponse = await request(app)
      .post("/api/v1/messages")
      .set("Cookie", userA.cookies)
      .send({
        conversationId,
        content: "outsider seen test",
      });

    const messageId = sendResponse.body.data.id;

    const response = await request(app)
      .patch(`/api/v1/messages/${messageId}/seen`)
      .set("Cookie", outsider.cookies);

    expect(response.statusCode).toBe(403);

    expect(response.body.message).toBe(
      "You are not a member of this conversation"
    );
  }, 15000);

  test("Should return 404 when marking a nonexistent message as seen", async () => {
    const userA = await registerAndGetToken(`seenF_${Date.now()}`);

    const response = await request(app)
      .patch("/api/v1/messages/999999999/seen")
      .set("Cookie", userA.cookies);

    expect(response.statusCode).toBe(404);
  }, 10000);
});
