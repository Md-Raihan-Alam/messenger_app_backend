import request from "supertest";
import app from "../app.js";
import { pool } from "../db/db.js";

describe("Auth Routes", () => {
  test("Should register a user", async () => {
    const username = `user_${Date.now()}`;

    const response = await request(app).post("/api/v1/auth/register").send({
      username,
      password: "123456",
    });

    expect(response.statusCode).toBe(201);

    expect(response.body.message).toBe("User registered successfully");
  }, 10000);

  test("Should login user", async () => {
    const username = `login_${Date.now()}`;

    // register first
    await request(app).post("/api/v1/auth/register").send({
      username,
      password: "123456",
    });

    // login
    const response = await request(app).post("/api/v1/auth/login").send({
      username,
      password: "123456",
    });

    expect(response.statusCode).toBe(200);

    expect(response.body.message).toBe("User logged in successfully");
  }, 10000);

  test("Should logout user", async () => {
    const response = await request(app).get("/api/v1/auth/logout");

    expect(response.statusCode).toBe(200);

    expect(response.body.message).toBe("User logged out successfully");
  });
});

afterAll(async () => {
  await pool.end();
});
