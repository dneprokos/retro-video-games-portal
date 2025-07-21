const jwt = require('jsonwebtoken');
const { authenticateToken, requireAdmin, requireOwner, optionalAuth } = require('./auth');

describe('Authentication Middleware', () => {
  let mockReq;
  let mockRes;
  let mockNext;

  beforeEach(() => {
    mockReq = {
      headers: {}
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    mockNext = jest.fn();
    
    // Reset JWT_SECRET for testing
    process.env.JWT_SECRET = 'test-secret';
    
    // Reset mocks
    jest.clearAllMocks();
  });

  describe('requireAdmin', () => {
    it('should allow admin users to proceed', () => {
      mockReq.user = {
        _id: 'user123',
        email: 'admin@example.com',
        role: 'admin',
        isAdmin: jest.fn().mockReturnValue(true)
      };

      requireAdmin(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should allow owner users to proceed', () => {
      mockReq.user = {
        _id: 'user123',
        email: 'owner@example.com',
        role: 'owner',
        isAdmin: jest.fn().mockReturnValue(true)
      };

      requireAdmin(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should return 401 when no user is authenticated', () => {
      requireAdmin(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ message: 'Authentication required' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 403 when user is not admin', () => {
      mockReq.user = {
        _id: 'user123',
        email: 'guest@example.com',
        role: 'guest',
        isAdmin: jest.fn().mockReturnValue(false)
      };

      requireAdmin(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({ message: 'Admin access required' });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('requireOwner', () => {
    it('should allow owner users to proceed', () => {
      mockReq.user = {
        _id: 'user123',
        email: 'owner@example.com',
        role: 'owner',
        isOwner: jest.fn().mockReturnValue(true)
      };

      requireOwner(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should return 401 when no user is authenticated', () => {
      requireOwner(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ message: 'Authentication required' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 403 when user is not owner', () => {
      mockReq.user = {
        _id: 'user123',
        email: 'admin@example.com',
        role: 'admin',
        isOwner: jest.fn().mockReturnValue(false)
      };

      requireOwner(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({ message: 'Owner access required' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 403 when user is guest', () => {
      mockReq.user = {
        _id: 'user123',
        email: 'guest@example.com',
        role: 'guest',
        isOwner: jest.fn().mockReturnValue(false)
      };

      requireOwner(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({ message: 'Owner access required' });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('Token Format Validation', () => {
    it('should handle malformed authorization header', async () => {
      mockReq.headers.authorization = 'Bearer';

      await authenticateToken(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ message: 'Access token required' });
    });

    it('should handle empty token in authorization header', async () => {
      mockReq.headers.authorization = 'Bearer ';

      await authenticateToken(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ message: 'Access token required' });
    });
  });
}); 