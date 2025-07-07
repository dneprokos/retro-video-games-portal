import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Gamepad2, LogOut, User, Crown, Settings } from 'lucide-react';
import axios from 'axios';

const Navbar = () => {
  const { user, logout, isOwner } = useAuth();
  const navigate = useNavigate();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [ownerExists, setOwnerExists] = useState(true);

  React.useEffect(() => {
    // Only check if not logged in
    if (!user) {
      axios.get('/api/auth/owner-exists')
        .then(res => setOwnerExists(res.data.exists))
        .catch(() => setOwnerExists(true));
    }
  }, [user]);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <nav className="bg-arcade-card border-b border-arcade-border shadow-lg">
      <div className="container mx-auto px-4">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center space-x-2">
            <Gamepad2 className="h-8 w-8 text-neon-pink" />
            <span className="neon-text text-xl font-arcade">RETRO GAMES</span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-6">
            <Link 
              to="/" 
              className="text-arcade-text hover:text-neon-pink transition-colors duration-300"
            >
              Games
            </Link>
            
            {user ? (
              <>
                {user.role === 'admin' || user.role === 'owner' ? (
                  <Link 
                    to="/admin" 
                    className="text-arcade-text hover:text-neon-blue transition-colors duration-300 flex items-center space-x-1"
                  >
                    <Settings className="h-4 w-4" />
                    <span>Admin</span>
                  </Link>
                ) : null}
                
                {isOwner() && (
                  <Link 
                    to="/owner" 
                    className="text-arcade-text hover:text-neon-yellow transition-colors duration-300 flex items-center space-x-1"
                  >
                    <Crown className="h-4 w-4" />
                    <span>Owner</span>
                  </Link>
                )}
                
                <div className="flex items-center space-x-2">
                  <User className="h-4 w-4 text-neon-green" />
                  <span className="text-arcade-text">{user.email}</span>
                  <button
                    onClick={handleLogout}
                    className="text-arcade-text hover:text-neon-pink transition-colors duration-300 flex items-center space-x-1"
                  >
                    <LogOut className="h-4 w-4" />
                    <span>Logout</span>
                  </button>
                </div>
              </>
            ) : (
              <div className="flex items-center space-x-4">
                <Link 
                  to="/login" 
                  className="retro-button-secondary"
                >
                  Login
                </Link>
                {!ownerExists && (
                  <Link 
                    to="/register" 
                    className="retro-button"
                  >
                    Register Owner
                  </Link>
                )}
              </div>
            )}
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden">
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="text-arcade-text hover:text-neon-pink transition-colors duration-300"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                {isMenuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {isMenuOpen && (
          <div className="md:hidden border-t border-arcade-border py-4">
            <div className="flex flex-col space-y-4">
              <Link 
                to="/" 
                className="text-arcade-text hover:text-neon-pink transition-colors duration-300"
                onClick={() => setIsMenuOpen(false)}
              >
                Games
              </Link>
              
              {user ? (
                <>
                  {user.role === 'admin' || user.role === 'owner' ? (
                    <Link 
                      to="/admin" 
                      className="text-arcade-text hover:text-neon-blue transition-colors duration-300 flex items-center space-x-2"
                      onClick={() => setIsMenuOpen(false)}
                    >
                      <Settings className="h-4 w-4" />
                      <span>Admin Panel</span>
                    </Link>
                  ) : null}
                  
                  {isOwner() && (
                    <Link 
                      to="/owner" 
                      className="text-arcade-text hover:text-neon-yellow transition-colors duration-300 flex items-center space-x-2"
                      onClick={() => setIsMenuOpen(false)}
                    >
                      <Crown className="h-4 w-4" />
                      <span>Owner Panel</span>
                    </Link>
                  )}
                  
                  <div className="flex items-center space-x-2 pt-2 border-t border-arcade-border">
                    <User className="h-4 w-4 text-neon-green" />
                    <span className="text-arcade-text text-sm">{user.email}</span>
                  </div>
                  
                  <button
                    onClick={() => {
                      handleLogout();
                      setIsMenuOpen(false);
                    }}
                    className="text-arcade-text hover:text-neon-pink transition-colors duration-300 flex items-center space-x-2"
                  >
                    <LogOut className="h-4 w-4" />
                    <span>Logout</span>
                  </button>
                </>
              ) : (
                <div className="flex flex-col space-y-2">
                  <Link 
                    to="/login" 
                    className="retro-button-secondary text-center"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    Login
                  </Link>
                  {!ownerExists && (
                    <Link 
                      to="/register" 
                      className="retro-button text-center"
                      onClick={() => setIsMenuOpen(false)}
                    >
                      Register Owner
                    </Link>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </nav>
  );
};

export default Navbar; 