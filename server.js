const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { body, validationResult } = require("express-validator");
const cors = require("cors");
const clusterConnection = process.env.clusterConnection;
const http = require("http");
const socketIo = require("socket.io");

const app = express();
app.use(express.json());
app.use(cors());

const PORT = process.env.PORT || 5000;

// MongoDB setup (assuming you have MongoDB installed locally or use a cloud service)
async function mongoConnect() {
  await mongoose.connect("mongodb+srv://deranged248:derangedfrfrlmao@deranged.bvcwyla.mongodb.net/wait?retryWrites=true&w=majority&appName=Deranged", {
    useNewUrlParser: true,
  });
  const db = mongoose.connection;
  db.on("error", console.error.bind(console, "MongoDB connection error:"));
  db.once("open", () => {
    console.log("Connected to MongoDB");
  });
}

mongoConnect();
// Mongoose schema for Psychiatrist
const psychiatristSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  password: String,
  isOnline: { type: Boolean, default: false },
});

const Psychiatrist = mongoose.model("Psychiatrist", psychiatristSchema);

// Mongoose schema for Help Request
const helpRequestSchema = new mongoose.Schema({
  name: String,
  email: String,
  description: String,
  psychiatristId: { type: mongoose.Schema.Types.ObjectId, ref: "Psychiatrist" },
  timestamp: { type: Date, default: Date.now },
});

const HelpRequest = mongoose.model("HelpRequest", helpRequestSchema);

// Middleware for JWT verification
const verifyToken = (req, res, next) => {
  const token = req.headers["authorization"];
  if (!token)
    return res
      .status(401)
      .json({ message: "Access denied. Token not provided." });

  jwt.verify(token, "secretkey", (err, decoded) => {
    if (err) return res.status(401).json({ message: "Invalid token." });
    req.user = decoded;
    next();
  });
};

// Socket.IO setup
const server = http.createServer(app);
const io = socketIo(server);

// Socket.IO connection handling
io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // Handle psychiatrist online status
  socket.on("psychiatrist-online", async () => {
    // Mark psychiatrist as online
    const psychiatrist = await Psychiatrist.findOneAndUpdate(
      { _id: socket.handshake.query.psychiatristId },
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
  socket.on("psychiatrist-offline", async () => {
    // Mark psychiatrist as offline
    const psychiatrist = await Psychiatrist.findOneAndUpdate(
      { _id: socket.handshake.query.psychiatristId },
      { isOnline: false },
      { new: true }
    );
    console.log(`${psychiatrist.name} is now offline.`);
    io.emit("psychiatrist-status", {
      psychiatristId: psychiatrist._id,
      isOnline: false,
    });
  });

  // Handle help requests
  socket.on("help-request", async (data) => {
    // Save help request to MongoDB
    const { name, email, description, psychiatristId } = data;
    const newHelpRequest = new HelpRequest({
      name,
      email,
      description,
      psychiatristId,
    });
    await newHelpRequest.save();

    // Emit help request to psychiatrist if online
    const psychiatrist = await Psychiatrist.findById(psychiatristId);
    if (psychiatrist && psychiatrist.isOnline) {
      io.to(psychiatrist.socketId).emit("new-help-request", newHelpRequest);
    }
  });

  // Disconnect handling
  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});

// Routes

// Register a new Psychiatrist
app.post(
  "/PsychiatristRegister",
  [
    body("name").notEmpty(),
    body("email").isEmail(),
    body("password").isLength({ min: 6 }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, email, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);

    const newPsychiatrist = new Psychiatrist({
      name,
      email,
      password: hashedPassword,
    });
    await newPsychiatrist.save();

    res.status(201).json({ message: "Psychiatrist registered successfully." });
  }
);

// Psychiatrist login
app.post("/PsychiatristLogin", async (req, res) => {
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

// Anonymous user help request
app.post("/api/help", async (req, res) => {
  const { name, email, description, psychiatristId } = req.body;

  // Emit help request to psychiatrist if online
  const psychiatrist = await Psychiatrist.findById(psychiatristId);
  if (psychiatrist && psychiatrist.isOnline) {
    io.to(psychiatrist.socketId).emit("new-help-request", {
      name,
      email,
      description,
      psychiatristId,
    });
    res.status(200).json({ message: "Help request sent." });
  } else {
    res
      .status(404)
      .json({
        message:
          "No psychiatrists available at the moment. Please try again later.",
      });
  }
});

// Get online psychiatrists
app.get("/api/psychiatrists/online", async (req, res) => {
  const onlinePsychiatrists = await Psychiatrist.find({ isOnline: true });
  res.json({ psychiatrists: onlinePsychiatrists });
});

// Start server
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
