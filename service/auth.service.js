import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";

import { db } from "../db/db.js";
import { users } from "../schemas/schema.js";

dotenv.config();

export const registerUser = async (req, res) => {
  try {
    const { username, password } = req.body;

    // validation
    if (!username || !password) {
      return res.status(400).json({
        message: "Username and password are required",
      });
    }

    // check existing user
    const existingUser = await db.query.users.findFirst({
      where: (u, { eq }) => eq(u.username, username),
    });

    if (existingUser) {
      return res.status(400).json({
        message: "Username already exists",
      });
    }

    // hash password
    const hashedPassword = await bcrypt.hash(
      password,
      Number(process.env.SALT_ROUNDS)
    );

    // insert user
    await db.insert(users).values({
      username,
      password: hashedPassword,
    });

    return res.status(201).json({
      message: "User registered successfully",
    });
  } catch (e) {
    console.error("REGISTER ERROR:", e);

    return res.status(500).json({
      message: "Internal server error",
    });
  }
};

export const loginUser = async (req, res) => {
  try {
    const { username, password } = req.body;

    // validation
    if (!username || !password) {
      return res.status(400).json({
        message: "Username and password are required",
      });
    }

    // find user
    const user = await db.query.users.findFirst({
      where: (u, { eq }) => eq(u.username, username),
    });

    if (!user) {
      return res.status(400).json({
        message: "Invalid username or password",
      });
    }

    // compare password
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(400).json({
        message: "Invalid username or password",
      });
    }

    // generate jwt
    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, {
      expiresIn: process.env.EXPIRES_IN,
    });

    // cookie
    res.cookie("token", token, {
      httpOnly: true,
      secure: false,
      sameSite: "lax",
    });

    return res.status(200).json({
      message: "User logged in successfully",
    });
  } catch (e) {
    console.error("LOGIN ERROR:", e);

    return res.status(500).json({
      message: "Internal server error",
    });
  }
};

export const logoutUser = (req, res) => {
  try {
    res.clearCookie("token");

    return res.status(200).json({
      message: "User logged out successfully",
    });
  } catch (e) {
    console.error("LOGOUT ERROR:", e);

    return res.status(500).json({
      message: "Internal server error",
    });
  }
};
