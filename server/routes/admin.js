const express = require('express');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { authenticateToken, requireOwner } = require('../middleware/auth');

const router = express.Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     AdminUser:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *         email:
 *           type: string
 *         role:
 *           type: string
 *           enum: [guest, admin, owner]
 *         createdAt:
 *           type: string
 *           format: date-time
 *         lastLogin:
 *           type: string
 *           format: date-time
 */

/**
 * @swagger
 * /admin/users:
 *   get:
 *     summary: Get all admin users (Owner only)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of admin users
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 admins:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/AdminUser'
 *       401:
 *         description: Missing or invalid token
 *       403:
 *         description: Owner role required
 *       500:
 *         description: Server error
 */
// @route   GET /api/admin/users
// @desc    Get all admin users (Owner only)
// @access  Private (Owner)
router.get('/users', [authenticateToken, requireOwner], async (req, res) => {
  try {
    const admins = await User.find({ role: 'admin' })
      .select('-password')
      .sort({ createdAt: -1 });

    res.json({ admins });
  } catch (error) {
    console.error('Get admins error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @swagger
 * /admin/users:
 *   post:
 *     summary: Create a new admin user (Owner only)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password, confirmPassword]
 *             properties:
 *               email:
 *                 type: string
 *                 example: admin@example.com
 *               password:
 *                 type: string
 *                 minLength: 6
 *                 example: Test12345
 *               confirmPassword:
 *                 type: string
 *                 example: Test12345
 *     responses:
 *       201:
 *         description: Admin user created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 admin:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     email:
 *                       type: string
 *                     role:
 *                       type: string
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Validation error or email already in use
 *       401:
 *         description: Missing or invalid token
 *       403:
 *         description: Owner role required
 *       500:
 *         description: Server error
 */
// @route   POST /api/admin/users
// @desc    Create new admin user (Owner only)
// @access  Private (Owner)
router.post('/users', [
  authenticateToken,
  requireOwner,
  body('email').isEmail().normalizeEmail().withMessage('Please enter a valid email'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters long'),
  body('confirmPassword').custom((value, { req }) => {
    if (value !== req.body.password) {
      throw new Error('Passwords must match');
    }
    return true;
  })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        message: 'Validation error',
        errors: errors.array() 
      });
    }

    const { email, password } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User with this email already exists' });
    }

    // Create admin user
    const admin = new User({
      email,
      password,
      role: 'admin'
    });

    await admin.save();

    res.status(201).json({
      message: 'Admin user created successfully',
      admin: {
        id: admin._id,
        email: admin.email,
        role: admin.role,
        createdAt: admin.createdAt
      }
    });
  } catch (error) {
    console.error('Create admin error:', error);
    if (error.code === 11000) {
      return res.status(400).json({ message: 'User with this email already exists' });
    }
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @swagger
 * /admin/users/{id}:
 *   delete:
 *     summary: Delete an admin user (Owner only)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Admin user id
 *     responses:
 *       200:
 *         description: Admin user deleted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       400:
 *         description: Target user is not an admin
 *       401:
 *         description: Missing or invalid token
 *       403:
 *         description: Owner role required
 *       404:
 *         description: Admin user not found
 *       500:
 *         description: Server error
 */
// @route   DELETE /api/admin/users/:id
// @desc    Delete admin user (Owner only)
// @access  Private (Owner)
router.delete('/users/:id', [authenticateToken, requireOwner], async (req, res) => {
  try {
    const admin = await User.findById(req.params.id);
    
    if (!admin) {
      return res.status(404).json({ message: 'Admin user not found' });
    }

    if (admin.role !== 'admin') {
      return res.status(400).json({ message: 'Can only delete admin users' });
    }

    await User.findByIdAndDelete(req.params.id);

    res.json({ message: 'Admin user deleted successfully' });
  } catch (error) {
    console.error('Delete admin error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @swagger
 * /admin/stats:
 *   get:
 *     summary: Get admin statistics (Owner only)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Counts plus the five most recently active admins
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 stats:
 *                   type: object
 *                   properties:
 *                     totalAdmins:
 *                       type: integer
 *                     totalGames:
 *                       type: integer
 *                 recentAdmins:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                       email:
 *                         type: string
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                       lastLogin:
 *                         type: string
 *                         format: date-time
 *       401:
 *         description: Missing or invalid token
 *       403:
 *         description: Owner role required
 *       500:
 *         description: Server error
 */
// @route   GET /api/admin/stats
// @desc    Get admin statistics (Owner only)
// @access  Private (Owner)
router.get('/stats', [authenticateToken, requireOwner], async (req, res) => {
  try {
    const totalAdmins = await User.countDocuments({ role: 'admin' });
    const totalGames = await require('../models/Game').countDocuments();
    
    // Get recent activity
    const recentAdmins = await User.find({ role: 'admin' })
      .select('email createdAt lastLogin')
      .sort({ lastLogin: -1 })
      .limit(5);

    res.json({
      stats: {
        totalAdmins,
        totalGames
      },
      recentAdmins
    });
  } catch (error) {
    console.error('Get admin stats error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router; 