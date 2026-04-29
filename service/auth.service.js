export const registerUser = (req, res) => {
  res.status(201).json({ message: "User registered successfully" });
};

export const loginUser = (req, res) => {
  res.status(200).json({ message: "User logged in successfully" });
};

export const logoutUser = (req, res) => {
  res.status(200).json({ message: "User logged out successfully" });
};
