import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Mail, Lock, Eye, EyeOff, Crown } from 'lucide-react';

const Register = () => {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  
  const { register } = useAuth();
  const navigate = useNavigate();

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (formData.password !== formData.confirmPassword) {
      return;
    }

    setLoading(true);

    try {
      const result = await register(formData.email, formData.password, formData.confirmPassword);
      if (result.success) {
        navigate('/');
      }
    } catch (error) {
      console.error('Registration error:', error);
    } finally {
      setLoading(false);
    }
  };

  const passwordsMatch = formData.password === formData.confirmPassword;
  const isFormValid = formData.email && formData.password && formData.confirmPassword && passwordsMatch;

  return (
    <div className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        {/* Header */}
        <div className="text-center">
          <div className="flex justify-center">
            <Crown className="h-16 w-16 text-neon-yellow" />
          </div>
          <h2 className="neon-text text-3xl font-arcade mt-6 mb-2">
            OWNER REGISTRATION
          </h2>
          <p className="text-arcade-text">
            Create the owner account for the retro games portal
          </p>
        </div>

        {/* Registration Form */}
        <div className="retro-card">
          <form onSubmit={handleSubmit} className="space-y-6" data-testid="register-form">
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
                  placeholder="Enter owner email"
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
                  minLength={6}
                  value={formData.password}
                  onChange={handleChange}
                  className="retro-input w-full pl-10 pr-10"
                  placeholder="Enter password (min 6 characters)"
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
              {formData.password && formData.password.length < 6 && (
                <p className="text-red-400 text-sm mt-1">Password must be at least 6 characters</p>
              )}
            </div>

            {/* Confirm Password Field */}
            <div>
              <label htmlFor="confirmPassword" className="block text-neon-pink font-bold mb-2">
                Confirm Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-arcade-text" />
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  required
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  className={`retro-input w-full pl-10 pr-10 ${
                    formData.confirmPassword && !passwordsMatch ? 'border-red-400' : ''
                  }`}
                  placeholder="Confirm your password"
                  data-testid="confirm-password-input"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-arcade-text hover:text-neon-pink"
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {formData.confirmPassword && !passwordsMatch && (
                <p className="text-red-400 text-sm mt-1">Passwords must match</p>
              )}
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading || !isFormValid}
              className="retro-button w-full flex justify-center items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
              data-testid="register-button"
            >
              {loading ? (
                <>
                  <div className="loading-spinner h-4 w-4"></div>
                  <span>Creating account...</span>
                </>
              ) : (
                <span>Create Owner Account</span>
              )}
            </button>
          </form>

          {/* Login Link */}
          <div className="mt-6 text-center">
            <p className="text-arcade-text">
              Already have an account?{' '}
              <Link 
                to="/login" 
                className="text-neon-pink hover:text-neon-blue transition-colors duration-300 font-bold"
              >
                Login here
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

export default Register; 