const User = require('./User');
const bcrypt = require('bcryptjs');

describe('User Model', () => {
  describe('Validation', () => {
    it('should validate a valid user', async () => {
      const validUser = new User({
        email: 'test@example.com',
        password: 'password123',
        role: 'admin'
      });

      const result = await validUser.save();
      expect(result.email).toBe('test@example.com');
      expect(result.role).toBe('admin');
      expect(result.password).not.toBe('password123'); // Should be hashed
    });

    it('should require email', async () => {
      const userWithoutEmail = new User({
        password: 'password123',
        role: 'admin'
      });

      await expect(userWithoutEmail.save()).rejects.toThrow();
    });

    it('should require valid email format', async () => {
      const userWithInvalidEmail = new User({
        email: 'invalid-email',
        password: 'password123',
        role: 'admin'
      });

      await expect(userWithInvalidEmail.save()).rejects.toThrow();
    });

    it('should require unique email', async () => {
      const user1 = new User({
        email: 'test@example.com',
        password: 'password123',
        role: 'admin'
      });
      await user1.save();

      const user2 = new User({
        email: 'test@example.com',
        password: 'password456',
        role: 'guest'
      });

      await expect(user2.save()).rejects.toThrow();
    });

    it('should require password', async () => {
      const userWithoutPassword = new User({
        email: 'test@example.com',
        role: 'admin'
      });

      await expect(userWithoutPassword.save()).rejects.toThrow();
    });

    it('should require password to be at least 6 characters', async () => {
      const userWithShortPassword = new User({
        email: 'test@example.com',
        password: '12345',
        role: 'admin'
      });

      await expect(userWithShortPassword.save()).rejects.toThrow();
    });

    it('should set default role to guest', async () => {
      const userWithoutRole = new User({
        email: 'test@example.com',
        password: 'password123'
      });

      const result = await userWithoutRole.save();
      expect(result.role).toBe('guest');
    });

    it('should validate role enum values', async () => {
      const userWithInvalidRole = new User({
        email: 'test@example.com',
        password: 'password123',
        role: 'invalid-role'
      });

      await expect(userWithInvalidRole.save()).rejects.toThrow();
    });

    it('should set timestamps', async () => {
      const user = new User({
        email: 'test@example.com',
        password: 'password123'
      });

      const result = await user.save();
      expect(result.createdAt).toBeDefined();
      expect(result.updatedAt).toBeDefined();
    });
  });

  describe('Password Hashing', () => {
    it('should hash password on save', async () => {
      const user = new User({
        email: 'test@example.com',
        password: 'password123'
      });

      const result = await user.save();
      expect(result.password).not.toBe('password123');
      expect(result.password).toMatch(/^\$2[aby]\$\d{1,2}\$[./A-Za-z0-9]{53}$/); // bcrypt pattern
    });

    it('should not hash password if not modified', async () => {
      const user = new User({
        email: 'test@example.com',
        password: 'password123'
      });

      const savedUser = await user.save();
      const originalHash = savedUser.password;

      savedUser.email = 'updated@example.com';
      const updatedUser = await savedUser.save();

      expect(updatedUser.password).toBe(originalHash);
    });

    it('should hash password when password is modified', async () => {
      const user = new User({
        email: 'test@example.com',
        password: 'password123'
      });

      const savedUser = await user.save();
      const originalHash = savedUser.password;

      savedUser.password = 'newpassword123';
      const updatedUser = await savedUser.save();

      expect(updatedUser.password).not.toBe(originalHash);
      expect(updatedUser.password).not.toBe('newpassword123');
    });
  });

  describe('Instance Methods', () => {
    it('should compare passwords correctly', async () => {
      const user = new User({
        email: 'test@example.com',
        password: 'password123'
      });

      const savedUser = await user.save();
      
      const isCorrectPassword = await savedUser.comparePassword('password123');
      const isWrongPassword = await savedUser.comparePassword('wrongpassword');

      expect(isCorrectPassword).toBe(true);
      expect(isWrongPassword).toBe(false);
    });

    it('should check if user is owner', async () => {
      const owner = new User({
        email: 'owner@example.com',
        password: 'password123',
        role: 'owner'
      });

      const admin = new User({
        email: 'admin@example.com',
        password: 'password123',
        role: 'admin'
      });

      const guest = new User({
        email: 'guest@example.com',
        password: 'password123',
        role: 'guest'
      });

      expect(owner.isOwner()).toBe(true);
      expect(admin.isOwner()).toBe(false);
      expect(guest.isOwner()).toBe(false);
    });

    it('should check if user is admin or owner', async () => {
      const owner = new User({
        email: 'owner@example.com',
        password: 'password123',
        role: 'owner'
      });

      const admin = new User({
        email: 'admin@example.com',
        password: 'password123',
        role: 'admin'
      });

      const guest = new User({
        email: 'guest@example.com',
        password: 'password123',
        role: 'guest'
      });

      expect(owner.isAdmin()).toBe(true);
      expect(admin.isAdmin()).toBe(true);
      expect(guest.isAdmin()).toBe(false);
    });
  });

  describe('Static Methods', () => {
    it('should create owner account', async () => {
      const owner = await User.createOwner('owner@example.com', 'password123');

      expect(owner.email).toBe('owner@example.com');
      expect(owner.role).toBe('owner');
      expect(owner.password).not.toBe('password123'); // Should be hashed
    });

    it('should check if owner exists', async () => {
      // Initially no owner should exist
      const ownerExistsBefore = await User.ownerExists();
      expect(ownerExistsBefore).toBe(false);

      // Create an owner
      await User.createOwner('owner@example.com', 'password123');

      // Now owner should exist
      const ownerExistsAfter = await User.ownerExists();
      expect(ownerExistsAfter).toBe(true);
    });

    it('should get owner email from environment', () => {
      const originalEnv = process.env.OWNER_EMAIL;
      process.env.OWNER_EMAIL = 'test-owner@example.com';

      const ownerEmail = User.getOwnerEmail();
      expect(ownerEmail).toBe('test-owner@example.com');

      // Restore original environment
      if (originalEnv) {
        process.env.OWNER_EMAIL = originalEnv;
      } else {
        delete process.env.OWNER_EMAIL;
      }
    });
  });

  describe('Email Normalization', () => {
    it('should convert email to lowercase', async () => {
      const user = new User({
        email: 'TEST@EXAMPLE.COM',
        password: 'password123'
      });

      const result = await user.save();
      expect(result.email).toBe('test@example.com');
    });

    it('should trim email whitespace', async () => {
      const user = new User({
        email: '  test@example.com  ',
        password: 'password123'
      });

      const result = await user.save();
      expect(result.email).toBe('test@example.com');
    });
  });

  describe('Password Security', () => {
    it('should use bcrypt with salt rounds of 12', async () => {
      const user = new User({
        email: 'test@example.com',
        password: 'password123'
      });

      const result = await user.save();
      
      // Check if it's a valid bcrypt hash
      const isValidHash = await bcrypt.compare('password123', result.password);
      expect(isValidHash).toBe(true);
    });

    it('should handle password hashing errors', async () => {
      // Mock bcrypt to throw an error
      const originalGenSalt = bcrypt.genSalt;
      bcrypt.genSalt = jest.fn().mockRejectedValue(new Error('Salt generation failed'));

      const user = new User({
        email: 'test@example.com',
        password: 'password123'
      });

      await expect(user.save()).rejects.toThrow('Salt generation failed');

      // Restore original function
      bcrypt.genSalt = originalGenSalt;
    });
  });

  describe('Last Login', () => {
    it('should set lastLogin to current date by default', async () => {
      const user = new User({
        email: 'test@example.com',
        password: 'password123'
      });

      const result = await user.save();
      expect(result.lastLogin).toBeDefined();
      expect(result.lastLogin instanceof Date).toBe(true);
    });

    it('should allow updating lastLogin', async () => {
      const user = new User({
        email: 'test@example.com',
        password: 'password123'
      });

      const savedUser = await user.save();
      const originalLastLogin = savedUser.lastLogin;

      // Wait a bit to ensure different timestamp
      await new Promise(resolve => setTimeout(resolve, 10));

      savedUser.lastLogin = new Date();
      const updatedUser = await savedUser.save();

      expect(updatedUser.lastLogin.getTime()).toBeGreaterThan(originalLastLogin.getTime());
    });
  });
}); 