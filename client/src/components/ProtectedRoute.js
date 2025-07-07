import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Loader2 } from 'lucide-react';

const ProtectedRoute = ({ children, requiredRole = 'admin' }) => {
  const { user, loading, hasRole } = useAuth();

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="text-center">
          <Loader2 className="loading-spinner mx-auto mb-4" />
          <p className="text-arcade-text">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!hasRole(requiredRole)) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-arcade text-neon-pink mb-4">Access Denied</h1>
          <p className="text-arcade-text mb-4">
            You don't have permission to access this page.
          </p>
          <p className="text-arcade-text text-sm">
            Required role: {requiredRole}
          </p>
        </div>
      </div>
    );
  }

  return children;
};

export default ProtectedRoute; 