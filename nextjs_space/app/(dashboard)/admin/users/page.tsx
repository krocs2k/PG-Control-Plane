'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Users,
  UserPlus,
  Shield,
  ShieldCheck,
  ShieldOff,
  Key,
  Lock,
  Unlock,
  Trash2,
  Edit,
  Eye,
  MoreVertical,
  RefreshCw,
  LogOut,
  Clock,
  Activity,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Copy,
  Smartphone,
  QrCode,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';

interface MFASettings {
  id: string;
  mfaRequiredForAll: boolean;
  mfaRequiredForDBAdmin: boolean;
  dbAdminMfaDisabledBy: string | null;
  dbAdminMfaDisabledAt: string | null;
  mfaEnforcementStartedAt: string | null;
  mfaGracePeriodDays: number;
}

interface MFASecurityAlert {
  id: string;
  alertType: string;
  message: string;
  adminId: string | null;
  adminName: string | null;
  adminEmail: string | null;
  resolved: boolean;
  createdAt: string;
}

interface AdminWithoutMFA {
  id: string;
  name: string | null;
  email: string;
  role: string;
  createdAt: string;
}

interface User {
  id: string;
  email: string;
  name: string | null;
  role: string;
  status: string;
  mfaEnabled: boolean;
  mfaVerifiedAt: string | null;
  failedAttempts?: number;
  lockedUntil?: string | null;
  lastLoginAt: string | null;
  lastLoginIp?: string | null;
  passwordChangedAt?: string | null;
  createdAt: string;
  updatedAt?: string;
  organization?: { id: string; name: string } | null;
  sessions?: Session[];
  loginHistory?: LoginHistoryItem[];
  _count?: { sessions: number };
}

interface Session {
  id: string;
  ipAddress: string | null;
  userAgent: string | null;
  lastActiveAt: string;
  expiresAt: string;
}

interface LoginHistoryItem {
  id: string;
  ipAddress: string | null;
  userAgent: string | null;
  success: boolean;
  reason: string | null;
  mfaUsed: boolean;
  createdAt: string;
}

interface MFASetup {
  secret: string;
  qrCodeUrl: string;
  backupCodes: string[];
}

const roleColors: Record<string, string> = {
  OWNER: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  ADMIN: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  OPERATOR: 'bg-green-500/20 text-green-400 border-green-500/30',
  VIEWER: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
};

const statusColors: Record<string, string> = {
  ACTIVE: 'bg-green-500/20 text-green-400 border-green-500/30',
  DISABLED: 'bg-red-500/20 text-red-400 border-red-500/30',
  LOCKED: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  PENDING: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
};

export default function UserAdminPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [showMFASetup, setShowMFASetup] = useState(false);
  const [showResetPasswordDialog, setShowResetPasswordDialog] = useState(false);
  const [mfaSetup, setMfaSetup] = useState<MFASetup | null>(null);
  const [mfaToken, setMfaToken] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [newUser, setNewUser] = useState({
    email: '',
    name: '',
    password: '',
    role: 'VIEWER',
    status: 'ACTIVE',
  });
  const [editUser, setEditUser] = useState({
    id: '',
    name: '',
    role: 'VIEWER',
    status: 'ACTIVE',
  });
  const [newPassword, setNewPassword] = useState('');
  
  // MFA Settings state
  const [mfaSettings, setMfaSettings] = useState<MFASettings | null>(null);
  const [mfaSecurityAlerts, setMfaSecurityAlerts] = useState<MFASecurityAlert[]>([]);
  const [adminsWithoutMFA, setAdminsWithoutMFA] = useState<AdminWithoutMFA[]>([]);
  const [mfaSettingsLoading, setMfaSettingsLoading] = useState(false);
  const [showDisableMfaDialog, setShowDisableMfaDialog] = useState(false);
  const [disableMfaToken, setDisableMfaToken] = useState('');

  useEffect(() => {
    fetchUsers();
    fetchMFASettings();
  }, []);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/users');
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
      }
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchMFASettings = async () => {
    try {
      const res = await fetch('/api/admin/mfa-settings');
      if (res.ok) {
        const data = await res.json();
        setMfaSettings(data.settings || null);
        setMfaSecurityAlerts(data.securityAlerts || []);
        setAdminsWithoutMFA(data.adminsWithoutMFA || []);
      }
    } catch (error) {
      console.error('Error fetching MFA settings:', error);
    }
  };

  const toggleMFAForAll = async () => {
    try {
      setMfaSettingsLoading(true);
      const res = await fetch('/api/admin/mfa-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          action: 'toggle_mfa_for_all',
          mfaRequiredForAll: !mfaSettings?.mfaRequiredForAll 
        }),
      });
      
      if (res.ok) {
        const data = await res.json();
        setMfaSettings(prev => prev ? { ...prev, mfaRequiredForAll: data.mfaRequiredForAll } : null);
        fetchMFASettings();
        fetchUsers();
      } else {
        const error = await res.json();
        alert(error.error || 'Failed to update MFA settings');
      }
    } catch (error) {
      console.error('Error toggling MFA for all:', error);
    } finally {
      setMfaSettingsLoading(false);
    }
  };

  const toggleDBAdminMFA = async (token?: string) => {
    try {
      setMfaSettingsLoading(true);
      const isDisabling = mfaSettings?.mfaRequiredForDBAdmin;
      
      const res = await fetch('/api/admin/mfa-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          action: isDisabling ? 'disable_db_admin_mfa' : 'toggle_db_admin_mfa',
          mfaRequiredForDBAdmin: !mfaSettings?.mfaRequiredForDBAdmin,
          mfaToken: token,
        }),
      });
      
      if (res.ok) {
        const data = await res.json();
        setMfaSettings(prev => prev ? { ...prev, mfaRequiredForDBAdmin: data.mfaRequiredForDBAdmin } : null);
        setShowDisableMfaDialog(false);
        setDisableMfaToken('');
        fetchMFASettings();
      } else {
        const error = await res.json();
        if (error.mfaRequired) {
          // Show MFA verification dialog
          setShowDisableMfaDialog(true);
        } else {
          alert(error.error || 'Failed to update MFA settings');
        }
      }
    } catch (error) {
      console.error('Error toggling DB Admin MFA:', error);
    } finally {
      setMfaSettingsLoading(false);
    }
  };

  const fetchUserDetails = async (userId: string) => {
    try {
      const res = await fetch(`/api/admin/users?id=${userId}`);
      if (res.ok) {
        const user = await res.json();
        setSelectedUser(user);
        setShowDetailsDialog(true);
      }
    } catch (error) {
      console.error('Error fetching user details:', error);
    }
  };

  const createUser = async () => {
    try {
      setActionLoading(true);
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newUser),
      });

      if (res.ok) {
        setShowCreateDialog(false);
        setNewUser({ email: '', name: '', password: '', role: 'VIEWER', status: 'ACTIVE' });
        fetchUsers();
      } else {
        const error = await res.json();
        alert(error.error || 'Failed to create user');
      }
    } catch (error) {
      console.error('Error creating user:', error);
    } finally {
      setActionLoading(false);
    }
  };

  const updateUser = async () => {
    try {
      setActionLoading(true);
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editUser),
      });

      if (res.ok) {
        setShowEditDialog(false);
        fetchUsers();
      } else {
        const error = await res.json();
        alert(error.error || 'Failed to update user');
      }
    } catch (error) {
      console.error('Error updating user:', error);
    } finally {
      setActionLoading(false);
    }
  };

  const deleteUser = async () => {
    if (!selectedUser) return;
    try {
      setActionLoading(true);
      const res = await fetch(`/api/admin/users?id=${selectedUser.id}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        setShowDeleteDialog(false);
        setSelectedUser(null);
        fetchUsers();
      } else {
        const error = await res.json();
        alert(error.error || 'Failed to delete user');
      }
    } catch (error) {
      console.error('Error deleting user:', error);
    } finally {
      setActionLoading(false);
    }
  };

  const performUserAction = async (userId: string, action: string, extra?: Record<string, unknown>) => {
    try {
      setActionLoading(true);
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: userId, action, ...extra }),
      });

      if (res.ok) {
        fetchUsers();
        if (selectedUser?.id === userId) {
          fetchUserDetails(userId);
        }
      } else {
        const error = await res.json();
        alert(error.error || `Failed to ${action}`);
      }
    } catch (error) {
      console.error(`Error performing ${action}:`, error);
    } finally {
      setActionLoading(false);
    }
  };

  const resetPassword = async () => {
    if (!selectedUser || !newPassword) return;
    await performUserAction(selectedUser.id, 'reset_password', { newPassword });
    setShowResetPasswordDialog(false);
    setNewPassword('');
  };

  // MFA Setup for current user
  const setupMFA = async () => {
    try {
      setActionLoading(true);
      const res = await fetch('/api/auth/mfa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'setup' }),
      });

      if (res.ok) {
        const data = await res.json();
        setMfaSetup(data);
        setShowMFASetup(true);
      }
    } catch (error) {
      console.error('Error setting up MFA:', error);
    } finally {
      setActionLoading(false);
    }
  };

  const verifyMFA = async () => {
    try {
      setActionLoading(true);
      const res = await fetch('/api/auth/mfa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify', token: mfaToken }),
      });

      if (res.ok) {
        setShowMFASetup(false);
        setMfaSetup(null);
        setMfaToken('');
        alert('MFA enabled successfully!');
      } else {
        const error = await res.json();
        alert(error.error || 'Invalid token');
      }
    } catch (error) {
      console.error('Error verifying MFA:', error);
    } finally {
      setActionLoading(false);
    }
  };

  const filteredUsers = users.filter((user) => {
    const matchesSearch =
      user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (user.name?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false);
    const matchesRole = roleFilter === 'all' || user.role === roleFilter;
    const matchesStatus = statusFilter === 'all' || user.status === statusFilter;
    return matchesSearch && matchesRole && matchesStatus;
  });

  const stats = {
    total: users.length,
    active: users.filter((u) => u.status === 'ACTIVE').length,
    mfaEnabled: users.filter((u) => u.mfaEnabled).length,
    locked: users.filter((u) => u.status === 'LOCKED').length,
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-7xl mx-auto space-y-6"
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white flex items-center gap-3">
              <Users className="h-8 w-8 text-blue-400" />
              User Administration
            </h1>
            <p className="text-slate-400 mt-1">Manage users, roles, and MFA settings</p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={setupMFA} className="border-slate-600">
              <Smartphone className="h-4 w-4 mr-2" />
              Setup My MFA
            </Button>
            <Button onClick={() => setShowCreateDialog(true)} className="bg-blue-600 hover:bg-blue-700">
              <UserPlus className="h-4 w-4 mr-2" />
              Add User
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-4 flex items-center gap-4">
              <div className="p-3 bg-blue-500/20 rounded-lg">
                <Users className="h-6 w-6 text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{stats.total}</p>
                <p className="text-sm text-slate-400">Total Users</p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-4 flex items-center gap-4">
              <div className="p-3 bg-green-500/20 rounded-lg">
                <CheckCircle className="h-6 w-6 text-green-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{stats.active}</p>
                <p className="text-sm text-slate-400">Active Users</p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-4 flex items-center gap-4">
              <div className="p-3 bg-purple-500/20 rounded-lg">
                <ShieldCheck className="h-6 w-6 text-purple-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{stats.mfaEnabled}</p>
                <p className="text-sm text-slate-400">MFA Enabled</p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-4 flex items-center gap-4">
              <div className="p-3 bg-orange-500/20 rounded-lg">
                <Lock className="h-6 w-6 text-orange-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{stats.locked}</p>
                <p className="text-sm text-slate-400">Locked Accounts</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* MFA Settings Section */}
        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader className="pb-4">
            <CardTitle className="text-white flex items-center gap-2">
              <Shield className="h-5 w-5 text-purple-400" />
              MFA Security Settings
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* MFA Toggles */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Require MFA for All Users */}
              <div className="flex items-center justify-between p-4 bg-slate-700/50 rounded-lg border border-slate-600">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-blue-400" />
                    <span className="font-medium text-white">Require MFA for All Users</span>
                  </div>
                  <p className="text-sm text-slate-400">
                    Users will have {mfaSettings?.mfaGracePeriodDays || 3} days to enable MFA after login
                  </p>
                  {mfaSettings?.mfaRequiredForAll && mfaSettings?.mfaEnforcementStartedAt && (
                    <p className="text-xs text-amber-400">
                      Enforcement started: {new Date(mfaSettings.mfaEnforcementStartedAt).toLocaleDateString()}
                    </p>
                  )}
                </div>
                <Switch
                  checked={mfaSettings?.mfaRequiredForAll || false}
                  onCheckedChange={toggleMFAForAll}
                  disabled={mfaSettingsLoading}
                  className="data-[state=checked]:bg-blue-600"
                />
              </div>

              {/* Require MFA for DB Admin Access */}
              <div className="flex items-center justify-between p-4 bg-slate-700/50 rounded-lg border border-slate-600">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Key className="h-4 w-4 text-amber-400" />
                    <span className="font-medium text-white">Require MFA for DB Admin Access</span>
                  </div>
                  <p className="text-sm text-slate-400">
                    Admins must verify MFA each time they access DB Admin
                  </p>
                  {!mfaSettings?.mfaRequiredForDBAdmin && mfaSettings?.dbAdminMfaDisabledAt && (
                    <p className="text-xs text-red-400">
                      Disabled by admin on {new Date(mfaSettings.dbAdminMfaDisabledAt).toLocaleDateString()}
                    </p>
                  )}
                </div>
                <Switch
                  checked={mfaSettings?.mfaRequiredForDBAdmin || false}
                  onCheckedChange={() => toggleDBAdminMFA()}
                  disabled={mfaSettingsLoading}
                  className="data-[state=checked]:bg-amber-600"
                />
              </div>
            </div>

            {/* Security Alerts */}
            {(mfaSecurityAlerts.length > 0 || adminsWithoutMFA.length > 0) && (
              <div className="space-y-4">
                <h3 className="text-white font-medium flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-400" />
                  Security Alerts
                </h3>
                
                {/* DB Admin MFA Disabled Alert */}
                {mfaSecurityAlerts.filter(a => a.alertType === 'DB_ADMIN_MFA_DISABLED').map(alert => (
                  <div key={alert.id} className="flex items-start gap-3 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                    <XCircle className="h-5 w-5 text-red-400 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-red-300 font-medium">{alert.message}</p>
                      <p className="text-xs text-red-400 mt-1">
                        {new Date(alert.createdAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}

                {/* Admins Without MFA */}
                {adminsWithoutMFA.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-amber-300 text-sm">
                      {adminsWithoutMFA.length} admin{adminsWithoutMFA.length > 1 ? 's' : ''} without MFA enabled:
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {adminsWithoutMFA.map(admin => (
                        <Badge
                          key={admin.id}
                          className="bg-amber-500/20 text-amber-300 border border-amber-500/30"
                        >
                          <ShieldOff className="h-3 w-3 mr-1" />
                          {admin.name || admin.email} ({admin.role})
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Filters */}
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-4">
              <div className="flex-1 min-w-[200px]">
                <Input
                  placeholder="Search users..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="bg-slate-700 border-slate-600"
                />
              </div>
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger className="w-[150px] bg-slate-700 border-slate-600">
                  <SelectValue placeholder="Role" />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="all">All Roles</SelectItem>
                  <SelectItem value="OWNER">Owner</SelectItem>
                  <SelectItem value="ADMIN">Admin</SelectItem>
                  <SelectItem value="OPERATOR">Operator</SelectItem>
                  <SelectItem value="VIEWER">Viewer</SelectItem>
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[150px] bg-slate-700 border-slate-600">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="DISABLED">Disabled</SelectItem>
                  <SelectItem value="LOCKED">Locked</SelectItem>
                  <SelectItem value="PENDING">Pending</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={fetchUsers} className="border-slate-600">
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Users Table */}
        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white">Users ({filteredUsers.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8 text-slate-400">Loading users...</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-700">
                      <th className="text-left py-3 px-4 text-slate-400 font-medium">User</th>
                      <th className="text-left py-3 px-4 text-slate-400 font-medium">Role</th>
                      <th className="text-left py-3 px-4 text-slate-400 font-medium">Status</th>
                      <th className="text-left py-3 px-4 text-slate-400 font-medium">MFA</th>
                      <th className="text-left py-3 px-4 text-slate-400 font-medium">Sessions</th>
                      <th className="text-left py-3 px-4 text-slate-400 font-medium">Last Login</th>
                      <th className="text-right py-3 px-4 text-slate-400 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((user) => (
                      <tr key={user.id} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                        <td className="py-3 px-4">
                          <div>
                            <p className="text-white font-medium">{user.name || 'Unnamed'}</p>
                            <p className="text-sm text-slate-400">{user.email}</p>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <Badge className={`${roleColors[user.role]} border`}>
                            {user.role}
                          </Badge>
                        </td>
                        <td className="py-3 px-4">
                          <Badge className={`${statusColors[user.status]} border`}>
                            {user.status}
                          </Badge>
                        </td>
                        <td className="py-3 px-4">
                          {user.mfaEnabled ? (
                            <ShieldCheck className="h-5 w-5 text-green-400" />
                          ) : (
                            <ShieldOff className="h-5 w-5 text-slate-500" />
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <span className="text-slate-300">{user._count?.sessions || 0}</span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="text-sm text-slate-400">
                            {user.lastLoginAt
                              ? new Date(user.lastLoginAt).toLocaleDateString()
                              : 'Never'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="bg-slate-800 border-slate-700">
                              <DropdownMenuItem
                                onClick={() => fetchUserDetails(user.id)}
                                className="text-slate-300 focus:bg-slate-700"
                              >
                                <Eye className="h-4 w-4 mr-2" /> View Details
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => {
                                  setEditUser({
                                    id: user.id,
                                    name: user.name || '',
                                    role: user.role,
                                    status: user.status,
                                  });
                                  setShowEditDialog(true);
                                }}
                                className="text-slate-300 focus:bg-slate-700"
                              >
                                <Edit className="h-4 w-4 mr-2" /> Edit
                              </DropdownMenuItem>
                              <DropdownMenuSeparator className="bg-slate-700" />
                              <DropdownMenuItem
                                onClick={() => {
                                  setSelectedUser(user);
                                  setShowResetPasswordDialog(true);
                                }}
                                className="text-slate-300 focus:bg-slate-700"
                              >
                                <Key className="h-4 w-4 mr-2" /> Reset Password
                              </DropdownMenuItem>
                              {user.status === 'LOCKED' && (
                                <DropdownMenuItem
                                  onClick={() => performUserAction(user.id, 'unlock')}
                                  className="text-green-400 focus:bg-slate-700"
                                >
                                  <Unlock className="h-4 w-4 mr-2" /> Unlock Account
                                </DropdownMenuItem>
                              )}
                              {user.status === 'ACTIVE' && (
                                <DropdownMenuItem
                                  onClick={() => performUserAction(user.id, 'disable')}
                                  className="text-orange-400 focus:bg-slate-700"
                                >
                                  <Lock className="h-4 w-4 mr-2" /> Disable Account
                                </DropdownMenuItem>
                              )}
                              {user.status === 'DISABLED' && (
                                <DropdownMenuItem
                                  onClick={() => performUserAction(user.id, 'enable')}
                                  className="text-green-400 focus:bg-slate-700"
                                >
                                  <CheckCircle className="h-4 w-4 mr-2" /> Enable Account
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem
                                onClick={() => performUserAction(user.id, 'revoke_sessions')}
                                className="text-slate-300 focus:bg-slate-700"
                              >
                                <LogOut className="h-4 w-4 mr-2" /> Revoke Sessions
                              </DropdownMenuItem>
                              {user.mfaEnabled && (
                                <DropdownMenuItem
                                  onClick={() => performUserAction(user.id, 'disable_mfa')}
                                  className="text-orange-400 focus:bg-slate-700"
                                >
                                  <ShieldOff className="h-4 w-4 mr-2" /> Disable MFA
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator className="bg-slate-700" />
                              <DropdownMenuItem
                                onClick={() => {
                                  setSelectedUser(user);
                                  setShowDeleteDialog(true);
                                }}
                                className="text-red-400 focus:bg-slate-700"
                              >
                                <Trash2 className="h-4 w-4 mr-2" /> Delete User
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Create User Dialog */}
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <UserPlus className="h-5 w-5 text-blue-400" />
                Create New User
              </DialogTitle>
              <DialogDescription className="text-slate-400">
                Add a new user to the system
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label className="text-slate-300">Email</Label>
                <Input
                  type="email"
                  value={newUser.email}
                  onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                  className="bg-slate-700 border-slate-600 mt-1"
                  placeholder="user@example.com"
                />
              </div>
              <div>
                <Label className="text-slate-300">Name</Label>
                <Input
                  value={newUser.name}
                  onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                  className="bg-slate-700 border-slate-600 mt-1"
                  placeholder="John Doe"
                />
              </div>
              <div>
                <Label className="text-slate-300">Password</Label>
                <Input
                  type="password"
                  value={newUser.password}
                  onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                  className="bg-slate-700 border-slate-600 mt-1"
                  placeholder="Min 8 characters"
                />
              </div>
              <div>
                <Label className="text-slate-300">Role</Label>
                <Select value={newUser.role} onValueChange={(v) => setNewUser({ ...newUser, role: v })}>
                  <SelectTrigger className="bg-slate-700 border-slate-600 mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    <SelectItem value="VIEWER">Viewer</SelectItem>
                    <SelectItem value="OPERATOR">Operator</SelectItem>
                    <SelectItem value="ADMIN">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreateDialog(false)} className="border-slate-600">
                Cancel
              </Button>
              <Button onClick={createUser} disabled={actionLoading} className="bg-blue-600 hover:bg-blue-700">
                {actionLoading ? 'Creating...' : 'Create User'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit User Dialog */}
        <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
          <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Edit className="h-5 w-5 text-blue-400" />
                Edit User
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label className="text-slate-300">Name</Label>
                <Input
                  value={editUser.name}
                  onChange={(e) => setEditUser({ ...editUser, name: e.target.value })}
                  className="bg-slate-700 border-slate-600 mt-1"
                />
              </div>
              <div>
                <Label className="text-slate-300">Role</Label>
                <Select value={editUser.role} onValueChange={(v) => setEditUser({ ...editUser, role: v })}>
                  <SelectTrigger className="bg-slate-700 border-slate-600 mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    <SelectItem value="VIEWER">Viewer</SelectItem>
                    <SelectItem value="OPERATOR">Operator</SelectItem>
                    <SelectItem value="ADMIN">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-slate-300">Status</Label>
                <Select value={editUser.status} onValueChange={(v) => setEditUser({ ...editUser, status: v })}>
                  <SelectTrigger className="bg-slate-700 border-slate-600 mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    <SelectItem value="ACTIVE">Active</SelectItem>
                    <SelectItem value="DISABLED">Disabled</SelectItem>
                    <SelectItem value="PENDING">Pending</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowEditDialog(false)} className="border-slate-600">
                Cancel
              </Button>
              <Button onClick={updateUser} disabled={actionLoading} className="bg-blue-600 hover:bg-blue-700">
                {actionLoading ? 'Saving...' : 'Save Changes'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* User Details Dialog */}
        <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
          <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Eye className="h-5 w-5 text-blue-400" />
                User Details
              </DialogTitle>
            </DialogHeader>
            {selectedUser && (
              <Tabs defaultValue="info" className="w-full">
                <TabsList className="bg-slate-700">
                  <TabsTrigger value="info">Info</TabsTrigger>
                  <TabsTrigger value="sessions">Sessions</TabsTrigger>
                  <TabsTrigger value="history">Login History</TabsTrigger>
                </TabsList>

                <TabsContent value="info" className="space-y-4 mt-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-slate-400">Email</p>
                      <p className="text-white">{selectedUser.email}</p>
                    </div>
                    <div>
                      <p className="text-sm text-slate-400">Name</p>
                      <p className="text-white">{selectedUser.name || 'Not set'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-slate-400">Role</p>
                      <Badge className={`${roleColors[selectedUser.role]} border mt-1`}>
                        {selectedUser.role}
                      </Badge>
                    </div>
                    <div>
                      <p className="text-sm text-slate-400">Status</p>
                      <Badge className={`${statusColors[selectedUser.status]} border mt-1`}>
                        {selectedUser.status}
                      </Badge>
                    </div>
                    <div>
                      <p className="text-sm text-slate-400">MFA Status</p>
                      <div className="flex items-center gap-2 mt-1">
                        {selectedUser.mfaEnabled ? (
                          <><ShieldCheck className="h-4 w-4 text-green-400" /> <span className="text-green-400">Enabled</span></>
                        ) : (
                          <><ShieldOff className="h-4 w-4 text-slate-500" /> <span className="text-slate-400">Disabled</span></>
                        )}
                      </div>
                    </div>
                    <div>
                      <p className="text-sm text-slate-400">Failed Attempts</p>
                      <p className="text-white">{selectedUser.failedAttempts || 0}</p>
                    </div>
                    <div>
                      <p className="text-sm text-slate-400">Last Login</p>
                      <p className="text-white">
                        {selectedUser.lastLoginAt
                          ? new Date(selectedUser.lastLoginAt).toLocaleString()
                          : 'Never'}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-slate-400">Last Login IP</p>
                      <p className="text-white">{selectedUser.lastLoginIp || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-slate-400">Created</p>
                      <p className="text-white">{new Date(selectedUser.createdAt).toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-sm text-slate-400">Password Changed</p>
                      <p className="text-white">
                        {selectedUser.passwordChangedAt
                          ? new Date(selectedUser.passwordChangedAt).toLocaleString()
                          : 'Never'}
                      </p>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="sessions" className="mt-4">
                  {selectedUser.sessions && selectedUser.sessions.length > 0 ? (
                    <div className="space-y-2">
                      {selectedUser.sessions.map((session) => (
                        <div key={session.id} className="p-3 bg-slate-700/50 rounded-lg">
                          <div className="flex justify-between">
                            <span className="text-slate-300">{session.ipAddress || 'Unknown IP'}</span>
                            <span className="text-sm text-slate-400">
                              Active: {new Date(session.lastActiveAt).toLocaleString()}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 truncate mt-1">{session.userAgent || 'Unknown device'}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-slate-400 text-center py-4">No active sessions</p>
                  )}
                </TabsContent>

                <TabsContent value="history" className="mt-4">
                  {selectedUser.loginHistory && selectedUser.loginHistory.length > 0 ? (
                    <div className="space-y-2">
                      {selectedUser.loginHistory.map((item) => (
                        <div key={item.id} className="p-3 bg-slate-700/50 rounded-lg flex items-center gap-3">
                          {item.success ? (
                            <CheckCircle className="h-5 w-5 text-green-400" />
                          ) : (
                            <XCircle className="h-5 w-5 text-red-400" />
                          )}
                          <div className="flex-1">
                            <div className="flex justify-between">
                              <span className="text-slate-300">{item.ipAddress || 'Unknown IP'}</span>
                              <span className="text-sm text-slate-400">
                                {new Date(item.createdAt).toLocaleString()}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              {item.mfaUsed && (
                                <Badge className="bg-purple-500/20 text-purple-400 border border-purple-500/30 text-xs">
                                  MFA Used
                                </Badge>
                              )}
                              {item.reason && (
                                <span className="text-xs text-red-400">{item.reason}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-slate-400 text-center py-4">No login history</p>
                  )}
                </TabsContent>
              </Tabs>
            )}
          </DialogContent>
        </Dialog>

        {/* Reset Password Dialog */}
        <Dialog open={showResetPasswordDialog} onOpenChange={setShowResetPasswordDialog}>
          <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Key className="h-5 w-5 text-orange-400" />
                Reset Password
              </DialogTitle>
              <DialogDescription className="text-slate-400">
                Set a new password for {selectedUser?.email}
              </DialogDescription>
            </DialogHeader>
            <div>
              <Label className="text-slate-300">New Password</Label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="bg-slate-700 border-slate-600 mt-1"
                placeholder="Min 8 characters"
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowResetPasswordDialog(false)} className="border-slate-600">
                Cancel
              </Button>
              <Button onClick={resetPassword} disabled={actionLoading || newPassword.length < 8} className="bg-orange-600 hover:bg-orange-700">
                {actionLoading ? 'Resetting...' : 'Reset Password'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation */}
        <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <AlertDialogContent className="bg-slate-800 border-slate-700">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-white flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-red-400" />
                Delete User
              </AlertDialogTitle>
              <AlertDialogDescription className="text-slate-400">
                Are you sure you want to delete <strong>{selectedUser?.email}</strong>? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="bg-slate-700 border-slate-600 text-white hover:bg-slate-600">
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction onClick={deleteUser} className="bg-red-600 hover:bg-red-700">
                {actionLoading ? 'Deleting...' : 'Delete'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* MFA Verification Dialog for Disabling DB Admin MFA */}
        <Dialog open={showDisableMfaDialog} onOpenChange={setShowDisableMfaDialog}>
          <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-amber-400" />
                MFA Verification Required
              </DialogTitle>
              <DialogDescription className="text-slate-400">
                Enter your MFA code to disable DB Admin MFA requirement. This action will be logged.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="flex items-center gap-3 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                <AlertTriangle className="h-5 w-5 text-amber-400" />
                <p className="text-sm text-amber-300">
                  Disabling MFA for DB Admin access reduces security. This change will be visible in security alerts.
                </p>
              </div>
              <div className="space-y-2">
                <Label className="text-slate-300">Enter your 6-digit MFA code</Label>
                <Input
                  type="text"
                  maxLength={6}
                  placeholder="000000"
                  value={disableMfaToken}
                  onChange={(e) => setDisableMfaToken(e.target.value.replace(/\D/g, ''))}
                  className="bg-slate-700 border-slate-600 text-center text-2xl tracking-widest"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setShowDisableMfaDialog(false);
                  setDisableMfaToken('');
                }}
                className="border-slate-600"
              >
                Cancel
              </Button>
              <Button
                onClick={() => toggleDBAdminMFA(disableMfaToken)}
                disabled={disableMfaToken.length !== 6 || mfaSettingsLoading}
                className="bg-amber-600 hover:bg-amber-700"
              >
                {mfaSettingsLoading ? 'Verifying...' : 'Confirm & Disable'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* MFA Setup Dialog */}
        <Dialog open={showMFASetup} onOpenChange={setShowMFASetup}>
          <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Smartphone className="h-5 w-5 text-purple-400" />
                Setup Two-Factor Authentication
              </DialogTitle>
              <DialogDescription className="text-slate-400">
                Scan the QR code with your authenticator app
              </DialogDescription>
            </DialogHeader>
            {mfaSetup && (
              <div className="space-y-4">
                <div className="bg-white p-4 rounded-lg w-fit mx-auto">
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(mfaSetup.qrCodeUrl)}`}
                    alt="MFA QR Code"
                    className="w-48 h-48"
                  />
                </div>
                <div className="bg-slate-700/50 p-3 rounded-lg">
                  <p className="text-sm text-slate-400 mb-1">Or enter this code manually:</p>
                  <div className="flex items-center gap-2">
                    <code className="text-green-400 font-mono flex-1">{mfaSetup.secret}</code>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => navigator.clipboard.writeText(mfaSetup.secret)}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="bg-slate-700/50 p-3 rounded-lg">
                  <p className="text-sm text-slate-400 mb-2">Backup Codes (save these securely):</p>
                  <div className="grid grid-cols-2 gap-2">
                    {mfaSetup.backupCodes.map((code, i) => (
                      <code key={i} className="text-yellow-400 font-mono text-sm bg-slate-800 px-2 py-1 rounded">
                        {code}
                      </code>
                    ))}
                  </div>
                </div>
                <div>
                  <Label className="text-slate-300">Enter the 6-digit code from your app</Label>
                  <Input
                    value={mfaToken}
                    onChange={(e) => setMfaToken(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="bg-slate-700 border-slate-600 mt-1 text-center text-2xl tracking-widest"
                    placeholder="000000"
                    maxLength={6}
                  />
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowMFASetup(false)} className="border-slate-600">
                Cancel
              </Button>
              <Button
                onClick={verifyMFA}
                disabled={actionLoading || mfaToken.length !== 6}
                className="bg-purple-600 hover:bg-purple-700"
              >
                {actionLoading ? 'Verifying...' : 'Enable MFA'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </motion.div>
    </div>
  );
}
