// Authentication utilities and middleware
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { userDb, organizationDb } from './db.js';

// JWT secret - in production, use a strong random secret
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production';
const JWT_EXPIRES_IN = '7d'; // Token expires in 7 days

// Hash password
const hashPassword = async (password) => {
  const saltRounds = 12;
  return await bcrypt.hash(password, saltRounds);
};

// Compare password with hash
const comparePassword = async (password, hash) => {
  return await bcrypt.compare(password, hash);
};

// Generate JWT token
const generateToken = (userId) => {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
};

// Verify JWT token
const verifyToken = (token) => {
  return jwt.verify(token, JWT_SECRET);
};

// Middleware to authenticate requests
const authenticateToken = async (req, res, next) => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({ error: 'Access token required' });
    }

    // Verify token
    const decoded = verifyToken(token);

    // Get user from database
    const user = await userDb.findUserById(decoded.userId);
    if (!user) {
      return res.status(401).json({ error: 'Invalid token - user not found' });
    }

    // Get user's organization
    const orgId = await organizationDb.getUserPrimaryOrganization(user.id);

    // Attach user to request with org_id
    req.user = {
      ...user,
      org_id: orgId
    };
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

// Register new user
const registerUser = async (email, password, name, organizationName = null, inviteToken = null) => {
  try {
    // Check if user already exists
    const existingUser = await userDb.findUserByEmail(email);
    if (existingUser) {
      throw new Error('User with this email already exists');
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Create user
    const user = await userDb.createUser(email, passwordHash, name);

    let organizationId;
    
    if (inviteToken) {
      // Join existing organization via invite
      organizationId = await organizationDb.acceptInvite(inviteToken, user.id);
    } else if (organizationName) {
      // Create new organization
      const organization = await organizationDb.createOrganization(organizationName, user.id);
      organizationId = organization.id;
    } else {
      throw new Error('Must either provide organization name or invite token');
    }

    // Generate token
    const token = generateToken(user.id);

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        created_at: user.created_at,
        organizationId
      },
      token
    };
  } catch (error) {
    throw error;
  }
};

// Login user
const loginUser = async (email, password) => {
  try {
    // Find user by email
    const user = await userDb.findUserByEmail(email);
    if (!user) {
      throw new Error('Invalid email or password');
    }

    // Check password
    const isValidPassword = await comparePassword(password, user.password_hash);
    if (!isValidPassword) {
      throw new Error('Invalid email or password');
    }

    // Get user's primary organization
    const organizationId = await organizationDb.getUserPrimaryOrganization(user.id);
    
    // Generate token
    const token = generateToken(user.id);

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        created_at: user.created_at,
        organizationId
      },
      token
    };
  } catch (error) {
    throw error;
  }
};

// Named exports
export {
  hashPassword,
  comparePassword,
  generateToken,
  verifyToken,
  authenticateToken,
  registerUser,
  loginUser
};

// Default export
export default {
  hashPassword,
  comparePassword,
  generateToken,
  verifyToken,
  authenticateToken,
  registerUser,
  loginUser
};