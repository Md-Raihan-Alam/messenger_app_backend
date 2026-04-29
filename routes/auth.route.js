import { Router } from "express";
import {
  loginUser,
  logoutUser,
  registerUser,
} from "../service/auth.service.js";

export const authRouter = Router();

authRouter.post("/register", registerUser);
authRouter.post("/login", loginUser);
authRouter.get("/logout", logoutUser);
