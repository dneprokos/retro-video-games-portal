import React, { useState, useEffect } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { Crown, Plus, Trash2, Users, Gamepad2, Loader2 } from 'lucide-react';
import AdminForm from '../components/AdminForm';

const OwnerPanel = () => {
  const [admins, setAdmins] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [adminsResponse, statsResponse] = await Promise.all([
        axios.get('/api/admin/users'),
        axios.get('/api/admin/stats')
      ]);
      setAdmins(adminsResponse.data.admins);
      setStats(statsResponse.data.stats);
    } catch (error) {
      console.error('Error fetching owner data:', error);
      toast.error('Failed to load owner panel data');
    } finally {
      setLoading(false);
    }
  };

  const handleAddAdmin = async (adminData) => {
    try {
      await axios.post('/api/admin/users', adminData);
      toast.success('Admin user created successfully');
      setShowAddForm(false);
      fetchData();
    } catch (error) {
      console.error('Error adding admin:', error);
      const message = error.response?.data?.message || 'Failed to create admin user';
      toast.error(message);
    }
  };

  const handleDeleteAdmin = async (adminId) => {
    if (!window.confirm('Are you sure you want to delete this admin user? This action cannot be undone.')) {
      return;
    }

    try {
      await axios.delete(`/api/admin/users/${adminId}`);
      toast.success('Admin user deleted successfully');
      fetchData();
    } catch (error) {
      console.error('Error deleting admin:', error);
      toast.error('Failed to delete admin user');
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="text-center">
          <Loader2 className="loading-spinner mx-auto mb-4" />
          <p className="text-arcade-text">Loading owner panel...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="neon-text text-3xl font-arcade mb-2">OWNER PANEL</h1>
          <p className="text-arcade-text">Manage admin users and view portal statistics</p>
        </div>
        <button
          onClick={() => setShowAddForm(true)}
          className="retro-button flex items-center space-x-2"
        >
          <Plus className="h-4 w-4" />
          <span>Add Admin</span>
        </button>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="retro-card">
          <div className="flex items-center space-x-3">
            <Users className="h-8 w-8 text-neon-blue" />
            <div>
              <h3 className="text-lg font-arcade text-neon-blue">Total Admins</h3>
              <p className="text-2xl font-bold text-arcade-text">{stats.totalAdmins || 0}</p>
            </div>
          </div>
        </div>

        <div className="retro-card">
          <div className="flex items-center space-x-3">
            <Gamepad2 className="h-8 w-8 text-neon-green" />
            <div>
              <h3 className="text-lg font-arcade text-neon-green">Total Games</h3>
              <p className="text-2xl font-bold text-arcade-text">{stats.totalGames || 0}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Add Admin Form */}
      {showAddForm && (
        <div className="retro-card">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-arcade text-neon-pink">Add New Admin</h2>
            <button
              onClick={() => setShowAddForm(false)}
              className="text-arcade-text hover:text-neon-pink transition-colors duration-300"
            >
              ✕
            </button>
          </div>
          <AdminForm
            onSubmit={handleAddAdmin}
            onCancel={() => setShowAddForm(false)}
          />
        </div>
      )}

      {/* Admins List */}
      <div className="retro-card">
        <h2 className="text-xl font-arcade text-neon-pink mb-4">Admin Users Management</h2>
        
        {admins.length === 0 ? (
          <div className="text-center py-8">
            <Users className="h-16 w-16 text-arcade-border mx-auto mb-4" />
            <p className="text-arcade-text">No admin users found. Add your first admin!</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-arcade-border">
                  <th className="text-left py-3 px-4 text-neon-pink font-bold">Email</th>
                  <th className="text-left py-3 px-4 text-neon-pink font-bold">Role</th>
                  <th className="text-left py-3 px-4 text-neon-pink font-bold">Created</th>
                  <th className="text-left py-3 px-4 text-neon-pink font-bold">Last Login</th>
                  <th className="text-left py-3 px-4 text-neon-pink font-bold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {admins.map((admin) => (
                  <tr key={admin._id} className="border-b border-arcade-border hover:bg-arcade-border/20">
                    <td className="py-3 px-4">
                      <div className="flex items-center space-x-2">
                        <Users className="h-4 w-4 text-neon-blue" />
                        <span className="text-arcade-text font-bold">{admin.email}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="bg-neon-blue text-arcade-bg px-2 py-1 rounded text-xs font-bold">
                        {admin.role.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-arcade-text">
                      {formatDate(admin.createdAt)}
                    </td>
                    <td className="py-3 px-4 text-arcade-text">
                      {admin.lastLogin ? formatDate(admin.lastLogin) : 'Never'}
                    </td>
                    <td className="py-3 px-4">
                      <button
                        onClick={() => handleDeleteAdmin(admin._id)}
                        className="text-red-400 hover:text-red-300 transition-colors duration-300"
                        title="Delete Admin"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Owner Info */}
      <div className="retro-card">
        <div className="flex items-center space-x-3 mb-4">
          <Crown className="h-6 w-6 text-neon-yellow" />
          <h2 className="text-xl font-arcade text-neon-yellow">Owner Information</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-arcade-text">
          <div>
            <span className="font-bold">Owner Email:</span> dneprokos@gmail.com
          </div>
          <div>
            <span className="font-bold">Role:</span> Owner (Full Access)
          </div>
        </div>
        <div className="mt-4 p-3 bg-arcade-border/20 rounded">
          <p className="text-arcade-text text-sm">
            <strong>Owner Permissions:</strong> Full control over the portal, including game management, 
            admin user creation and deletion, and system configuration.
          </p>
        </div>
      </div>
    </div>
  );
};

export default OwnerPanel; 