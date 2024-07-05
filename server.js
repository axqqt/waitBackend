// server.js (or index.js)

const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const cors = require('cors');
const clusterConnection = process.env?.clusterConnection;

const app = express();
app.use(express.json());
app.use(cors());

const PORT = process.env.PORT || 5000;

// MongoDB setup (assuming you have MongoDB installed locally or use a cloud service)
mongoose.connect(clusterConnection, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});
const db = mongoose.connection;
db.on('error', console.error.bind(console, 'MongoDB connection error:'));
db.once('open', () => {
  console.log('Connected to MongoDB');
});

// Mongoose schema for Psychiatrist
const psychiatristSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  password: String,
});

const Psychiatrist = mongoose.model('Psychiatrist', psychiatristSchema);

// Middleware for JWT verification
const verifyToken = (req, res, next) => {
  const token = req.headers['authorization'];
  if (!token) return res.status(401).json({ message: 'Access denied. Token not provided.' });

  jwt.verify(token, 'secretkey', (err, decoded) => {
    if (err) return res.status(401).json({ message: 'Invalid token.' });
    req.user = decoded;
    next();
  });
};

// Routes

// Register a new Psychiatrist
app.post('/api/register', [
  body('name').notEmpty(),
  body('email').isEmail(),
  body('password').isLength({ min: 6 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { name, email, password } = req.body;
  const hashedPassword = await bcrypt.hash(password, 10);

  const newPsychiatrist = new Psychiatrist({ name, email, password: hashedPassword });
  await newPsychiatrist.save();

  res.status(201).json({ message: 'Psychiatrist registered successfully.' });
});

// Psychiatrist login
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  const psychiatrist = await Psychiatrist.findOne({ email });

  if (!psychiatrist) {
    return res.status(404).json({ message: 'Psychiatrist not found.' });
  }

  const isMatch = await bcrypt.compare(password, psychiatrist.password);
  if (!isMatch) {
    return res.status(401).json({ message: 'Invalid credentials.' });
  }

  const token = jwt.sign({ id: psychiatrist._id }, 'secretkey', { expiresIn: '1h' });

  res.json({ token });
});

// Example route for anonymous user seeking help
app.get('/api/help', (req, res) => {
  // Implement your logic here for handling user seeking help anonymously
  res.json({ message: 'Anonymous user seeking help.' });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
