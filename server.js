require('dotenv').config();
const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { body, validationResult } = require("express-validator");
const cors = require("cors");
const http = require("http");
const socketIo = require("socket.io");
const multer = require("multer");
const nodemailer = require("nodemailer");

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 5000;

// MongoDB setup
mongoose.connect(process.env.clusterConnection, {
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
app.use(cors({origin:"*"}));

// JWT Middleware
const authenticateToken = (req, res, next) => {
  const token = req.header('token');
  if (!token) return res.status(401).json({ message: 'Access denied' });

  try {
    const verified = jwt.verify(token, process.env.JWT_SECRET);
    req.user = verified;
    next();
  } catch (error) {
    res.status(400).json({ message: 'Invalid token' });
  }
};

// Socket.IO connection handling
io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // Handle psychiatrist online status
  socket.on("psychiatrist-online", async (psychiatristId) => {
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

  // Handle user message
  socket.on("user-message", async (data) => {
    io.emit("user-message", {
      text: data.text,
      user: "Anonymous User",
    });
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});

// Psychiatrist registration route
app.post(
  "/register",
  upload.single("proof"),
  [
    body("name").notEmpty().withMessage("Name is required"),
    body("email").isEmail().withMessage("Valid email is required"),
    body("password").isLength({ min: 6 }).withMessage("Password must be at least 6 characters long"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, email, password } = req.body;
    const proof = req.file;

    try {
      const hashedPassword = await bcrypt.hash(password, 10);

      const newPsychiatrist = new Psychiatrist({
        name,
        email,
        password: hashedPassword,
      });

      await newPsychiatrist.save();

      // Send email with proof attachment
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: process.env.GMAIL_USER,
          pass: process.env.GMAIL_PASS,
        },
      });

      const mailOptions = {
        from: process.env.GMAIL_USER,
        to: "veloxify@gmail.com",
        subject: "New Psychiatrist Registration",
        text: `Name: ${name}\nEmail: ${email}\n\nPlease find the attached proof of certification.`,
        attachments: [
          {
            filename: proof.originalname,
            content: proof.buffer,
          },
        ],
      };

      transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
          console.error("Error sending email:", error);
        } else {
          console.log("Email sent:", info.response);
        }
      });

      res.status(201).json({ message: "Psychiatrist registered successfully!" });
    } catch (error) {
      console.error("Error registering psychiatrist:", error);
      res.status(500).json({ message: "Server error" });
    }
  }
);

// Psychiatrist login route
app.post("/login", authenticateToken, async (req, res) => {
  const { email, password } = req.body;

  try {
    const psychiatrist = await Psychiatrist.findOne({ email });
    if (!psychiatrist) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    const isMatch = await bcrypt.compare(password, psychiatrist.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    const token = jwt.sign({ _id: psychiatrist._id }, process.env.JWT_SECRET, {
      expiresIn: "1h",
    });

    res.json({ token });
  } catch (error) {
    console.error("Error logging in:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Google login route
app.post("/google-login", async (req, res) => {
  const { idToken } = req.body;

  try {
    const ticket = await client.verifyIdToken({
      idToken: idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const { name, email } = ticket.getPayload();

    let psychiatrist = await Psychiatrist.findOne({ email });

    if (!psychiatrist) {
      psychiatrist = new Psychiatrist({ name, email, password: null });
      await psychiatrist.save();
    }

    const token = jwt.sign({ _id: psychiatrist._id }, process.env.JWT_SECRET, {
      expiresIn: "1h",
    });

    res.json({ token });
  } catch (error) {
    console.error("Error logging in with Google:", error);
    res.status(500).json({ message: "Server error" });
  }
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
