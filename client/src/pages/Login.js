import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Gamepad2, Mail, Lock, Eye, EyeOff } from 'lucide-react';

const Login = () => {
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const result = await login(formData.email, formData.password);
      if (result.success) {
        navigate('/');
      }
    } catch (error) {
      console.error('Login error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        {/* Header */}
        <div className="text-center">
          <div className="flex justify-center">
            <Gamepad2 className="h-16 w-16 text-neon-pink" />
          </div>
          <h2 className="neon-text text-3xl font-arcade mt-6 mb-2">
            LOGIN
          </h2>
          <p className="text-arcade-text">
            Enter your credentials to access the retro games portal
          </p>
        </div>

        {/* Login Form */}
        <div className="retro-card">
          <form onSubmit={handleSubmit} className="space-y-6" data-testid="login-form">
            {/* Email Field */}
            <div>
              <label htmlFor="email" className="block text-neon-pink font-bold mb-2">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-arcade-text" />
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  value={formData.email}
                  onChange={handleChange}
                  className="retro-input w-full pl-10"
                  placeholder="Enter your email"
                  data-testid="email-input"
                />
              </div>
            </div>

            {/* Password Field */}
            <div>
              <label htmlFor="password" className="block text-neon-pink font-bold mb-2">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-arcade-text" />
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={formData.password}
                  onChange={handleChange}
                  className="retro-input w-full pl-10 pr-10"
                  placeholder="Enter your password"
                  data-testid="password-input"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-arcade-text hover:text-neon-pink"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="retro-button w-full flex justify-center items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
              data-testid="login-button"
            >
              {loading ? (
                <>
                  <div className="loading-spinner h-4 w-4"></div>
                  <span>Logging in...</span>
                </>
              ) : (
                <span>Login</span>
              )}
            </button>
          </form>

          {/* Register Link */}
          <div className="mt-6 text-center">
            <p className="text-arcade-text">
              Don't have an owner account?{' '}
              <Link 
                to="/register" 
                className="text-neon-pink hover:text-neon-blue transition-colors duration-300 font-bold"
              >
                Register here
              </Link>
            </p>
          </div>
        </div>

        {/* Back to Home */}
        <div className="text-center">
          <Link 
            to="/" 
            className="text-arcade-text hover:text-neon-pink transition-colors duration-300"
          >
            ← Back to Games
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Login; 