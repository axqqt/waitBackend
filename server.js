const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { body, validationResult } = require("express-validator");
const cors = require("cors");
const http = require("http");
const socketIo = require("socket.io");
const multer = require("multer");

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 5000;

// MongoDB setup (assuming you have MongoDB installed locally or use a cloud service)
mongoose.connect("mongodb+srv://deranged248:derangedfrfrlmao@deranged.bvcwyla.mongodb.net/wait?retryWrites=true&w=majority&appName=Deranged", {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const db = mongoose.connection;
db.on("error", console.error.bind(console, "MongoDB connection error:"));
db.once("open", () => {
  console.log("Connected to MongoDB");
});

// Mongoose schema for Psychiatrist
const psychiatristSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  password: String,
  isOnline: { type: Boolean, default: false },
});

const Psychiatrist = mongoose.model("Psychiatrist", psychiatristSchema);

// Multer setup for handling file uploads
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Middleware
app.use(express.json());
app.use(cors());

// Socket.IO connection handling
io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // Handle psychiatrist online status
  socket.on("psychiatrist-online", async (psychiatristId) => {
    // Mark psychiatrist as online
    const psychiatrist = await Psychiatrist.findOneAndUpdate(
      { _id: psychiatristId },
      { isOnline: true },
      { new: true }
    );
    console.log(`${psychiatrist.name} is now online.`);
    io.emit("psychiatrist-status", {
      psychiatristId: psychiatrist._id,
      isOnline: true,
    });
  });

  // Handle psychiatrist offline status
  socket.on("psychiatrist-offline", async (psychiatristId) => {
    // Mark psychiatrist as offline
    const psychiatrist = await Psychiatrist.findOneAndUpdate(
      { _id: psychiatristId },
      { isOnline: false },
      { new: true }
    );
    console.log(`${psychiatrist.name} is now offline.`);
    io.emit("psychiatrist-status", {
      psychiatristId: psychiatrist._id,
      isOnline: false,
    });
  });

  // Handle user messages
  socket.on("user-message", (message) => {
    // Broadcast message to all psychiatrists
    io.emit("user-message", { text: message.text });
  });

  // Disconnect handling
  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});

// Routes

// Register a new Psychiatrist with proof of certification
app.post(
  "/register",
  upload.single("attachment"),
  [
    body("email").isEmail(),
    body("description").optional(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, description } = req.body;

    // Multer middleware has stored the file in req.file
    const attachment = req.file;

    if (!attachment) {
      return res.status(400).json({ message: "Proof of certification is required." });
    }

    try {
      // Process the attachment as needed (save to cloud storage, etc.)
      // For demonstration, we're just logging its details
      console.log("Attachment received:", attachment.originalname, attachment.size);

      // Example: Save psychiatrist details to MongoDB
      const newPsychiatrist = new Psychiatrist({
        name: "Psychiatrist Name", // Replace with actual name handling logic
        email,
        password: "placeholder", // Password handling should not be handled directly like this
      });
      await newPsychiatrist.save();

      res.status(201).json({ message: "Psychiatrist registered successfully." });
    } catch (error) {
      console.error('Error registering psychiatrist:', error);
      res.status(500).json({ message: "Registration failed. Please try again later." });
    }
  }
);

// Psychiatrist login
app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const psychiatrist = await Psychiatrist.findOne({ email });

  if (!psychiatrist) {
    return res.status(404).json({ message: "Psychiatrist not found." });
  }

  const isMatch = await bcrypt.compare(password, psychiatrist.password);
  if (!isMatch) {
    return res.status(401).json({ message: "Invalid credentials." });
  }

  const token = jwt.sign({ id: psychiatrist._id }, "secretkey", {
    expiresIn: "1h",
  });

  res.json({ token, psychiatristId: psychiatrist._id });
});

// Get online psychiatrists
app.get("/psychiatrists/online", async (req, res) => {
  const onlinePsychiatrists = await Psychiatrist.find({ isOnline: true });
  res.json({ psychiatrists: onlinePsychiatrists });
});

// Start server
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
