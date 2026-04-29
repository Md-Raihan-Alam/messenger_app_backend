import express from "express";
import dotenv from "dotenv";
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json());

app.get("/", (req, res) => {
  res.send("Welcome to the Messenger App Backend!");
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
