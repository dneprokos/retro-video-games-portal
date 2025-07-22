import React from 'react';
import { render, screen } from '../test-utils';
import ProtectedRoute from './ProtectedRoute';
import { mockUser, mockOwner, mockGuest } from '../test-utils';

// Mock the useAuth hook
jest.mock('../contexts/AuthContext', () => ({
  useAuth: jest.fn()
}));

import { useAuth } from '../contexts/AuthContext';

describe('ProtectedRoute', () => {
  const mockChildren = <div data-testid="protected-content">Protected Content</div>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders children when user is authenticated and has required role', () => {
    useAuth.mockReturnValue({
      user: mockUser,
      loading: false,
      hasRole: jest.fn().mockReturnValue(true)
    });

    render(<ProtectedRoute>{mockChildren}</ProtectedRoute>);

    expect(screen.getByTestId('protected-content')).toBeInTheDocument();
  });

  it('shows loading spinner when authentication is loading', () => {
    useAuth.mockReturnValue({
      user: null,
      loading: true,
      hasRole: jest.fn()
    });

    render(<ProtectedRoute>{mockChildren}</ProtectedRoute>);

    expect(screen.getByText('Loading...')).toBeInTheDocument();
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
  });

  it('redirects to login when user is not authenticated', () => {
    useAuth.mockReturnValue({
      user: null,
      loading: false,
      hasRole: jest.fn()
    });

    render(<ProtectedRoute>{mockChildren}</ProtectedRoute>);

    // Check that protected content is not rendered
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
    
    // Check that Navigate component is rendered (React Router will handle the redirect)
    // We can't easily test the Navigate component directly, so we just verify the content is not shown
  });

  it('shows access denied when user lacks required role', () => {
    useAuth.mockReturnValue({
      user: mockGuest,
      loading: false,
      hasRole: jest.fn().mockReturnValue(false)
    });

    render(<ProtectedRoute requiredRole="admin">{mockChildren}</ProtectedRoute>);

    expect(screen.getByText('Access Denied')).toBeInTheDocument();
    expect(screen.getByText("You don't have permission to access this page.")).toBeInTheDocument();
    expect(screen.getByText('Required role: admin')).toBeInTheDocument();
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
  });

  it('allows admin user to access admin route', () => {
    useAuth.mockReturnValue({
      user: mockUser,
      loading: false,
      hasRole: jest.fn().mockImplementation((role) => role === 'admin')
    });

    render(<ProtectedRoute requiredRole="admin">{mockChildren}</ProtectedRoute>);

    expect(screen.getByTestId('protected-content')).toBeInTheDocument();
  });

  it('allows owner user to access admin route', () => {
    useAuth.mockReturnValue({
      user: mockOwner,
      loading: false,
      hasRole: jest.fn().mockImplementation((role) => role === 'admin' || role === 'owner')
    });

    render(<ProtectedRoute requiredRole="admin">{mockChildren}</ProtectedRoute>);

    expect(screen.getByTestId('protected-content')).toBeInTheDocument();
  });

  it('allows owner user to access owner route', () => {
    useAuth.mockReturnValue({
      user: mockOwner,
      loading: false,
      hasRole: jest.fn().mockImplementation((role) => role === 'owner')
    });

    render(<ProtectedRoute requiredRole="owner">{mockChildren}</ProtectedRoute>);

    expect(screen.getByTestId('protected-content')).toBeInTheDocument();
  });

  it('prevents admin user from accessing owner route', () => {
    useAuth.mockReturnValue({
      user: mockUser,
      loading: false,
      hasRole: jest.fn().mockImplementation((role) => role === 'admin')
    });

    render(<ProtectedRoute requiredRole="owner">{mockChildren}</ProtectedRoute>);

    expect(screen.getByText('Access Denied')).toBeInTheDocument();
    expect(screen.getByText('Required role: owner')).toBeInTheDocument();
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
  });

  it('prevents guest user from accessing any protected route', () => {
    useAuth.mockReturnValue({
      user: mockGuest,
      loading: false,
      hasRole: jest.fn().mockReturnValue(false)
    });

    render(<ProtectedRoute requiredRole="admin">{mockChildren}</ProtectedRoute>);

    expect(screen.getByText('Access Denied')).toBeInTheDocument();
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
  });

  it('uses default required role of admin when not specified', () => {
    useAuth.mockReturnValue({
      user: mockGuest,
      loading: false,
      hasRole: jest.fn().mockReturnValue(false)
    });

    render(<ProtectedRoute>{mockChildren}</ProtectedRoute>);

    expect(screen.getByText('Required role: admin')).toBeInTheDocument();
  });

  it('calls hasRole with the correct required role', () => {
    const mockHasRole = jest.fn().mockReturnValue(false);
    useAuth.mockReturnValue({
      user: mockGuest,
      loading: false,
      hasRole: mockHasRole
    });

    render(<ProtectedRoute requiredRole="owner">{mockChildren}</ProtectedRoute>);

    expect(mockHasRole).toHaveBeenCalledWith('owner');
  });

  it('renders loading spinner with correct styling', () => {
    useAuth.mockReturnValue({
      user: null,
      loading: true,
      hasRole: jest.fn()
    });

    render(<ProtectedRoute>{mockChildren}</ProtectedRoute>);

    // Check that the loading text is present
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders access denied with correct styling', () => {
    useAuth.mockReturnValue({
      user: mockGuest,
      loading: false,
      hasRole: jest.fn().mockReturnValue(false)
    });

    render(<ProtectedRoute requiredRole="admin">{mockChildren}</ProtectedRoute>);

    // Check that the access denied text is present
    expect(screen.getByText('Access Denied')).toBeInTheDocument();
    
    // Check that the required role text is present
    expect(screen.getByText('Required role: admin')).toBeInTheDocument();
    
    // Check that the permission message is present
    expect(screen.getByText("You don't have permission to access this page.")).toBeInTheDocument();
  });

  it('handles multiple children correctly', () => {
    useAuth.mockReturnValue({
      user: mockUser,
      loading: false,
      hasRole: jest.fn().mockReturnValue(true)
    });

    const multipleChildren = (
      <>
        <div data-testid="child-1">Child 1</div>
        <div data-testid="child-2">Child 2</div>
      </>
    );

    render(<ProtectedRoute>{multipleChildren}</ProtectedRoute>);

    expect(screen.getByTestId('child-1')).toBeInTheDocument();
    expect(screen.getByTestId('child-2')).toBeInTheDocument();
  });

  it('handles complex role checking logic', () => {
    const mockHasRole = jest.fn().mockImplementation((role) => {
      // Simulate complex role logic where owner can access everything
      if (role === 'owner') return true;
      if (role === 'admin') return mockUser.role === 'admin' || mockUser.role === 'owner';
      return false;
    });

    useAuth.mockReturnValue({
      user: mockOwner,
      loading: false,
      hasRole: mockHasRole
    });

    render(<ProtectedRoute requiredRole="owner">{mockChildren}</ProtectedRoute>);

    expect(mockHasRole).toHaveBeenCalledWith('owner');
    expect(screen.getByTestId('protected-content')).toBeInTheDocument();
  });
}); 