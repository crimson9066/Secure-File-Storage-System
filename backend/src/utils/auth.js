const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

// Hash password with bcrypt
const hashPassword = async (password) => {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
};

// Compare password with hash
const comparePassword = async (password, hash) => {
  return bcrypt.compare(password, hash);
};

// Generate JWT token
const generateToken = (payload, expiresIn = process.env.JWT_EXPIRE) => {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn });
};

// Verify JWT token
const verifyToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return null;
  }
};

module.exports = {
  hashPassword,
  comparePassword,
  generateToken,
  verifyToken
};
