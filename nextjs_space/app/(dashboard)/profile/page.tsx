'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import {
  User,
  Mail,
  Shield,
  ShieldCheck,
  ShieldOff,
  Key,
  Lock,
  Eye,
  EyeOff,
  Save,
  RefreshCw,
  Smartphone,
  Copy,
  Check,
  AlertTriangle,
  Clock,
  Building,
  Calendar,
  QrCode,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
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
import { toast } from 'sonner';

interface UserProfile {
  id: string;
  email: string;
  name: string | null;
  role: string;
  status: string;
  mfaEnabled: boolean;
  mfaVerifiedAt: string | null;
  mfaEnforcedAt: string | null;
  backupCodesCount: number;
  lastLoginAt: string | null;
  lastLoginIp: string | null;
  passwordChangedAt: string | null;
  createdAt: string;
  organization: { id: string; name: string } | null;
}

interface MFASetup {
  secret: string;
  qrCodeUrl: string;
  backupCodes: string[];
}

export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // MFA state
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaDeadline, setMfaDeadline] = useState<string | null>(null);
  const [mfaGracePeriodExpired, setMfaGracePeriodExpired] = useState(false);
  const [showMFASetup, setShowMFASetup] = useState(false);
  const [mfaSetup, setMfaSetup] = useState<MFASetup | null>(null);
  const [mfaToken, setMfaToken] = useState('');
  const [showBackupCodes, setShowBackupCodes] = useState(false);
  const [newBackupCodes, setNewBackupCodes] = useState<string[]>([]);
  const [showDisableMFA, setShowDisableMFA] = useState(false);
  const [disableMfaToken, setDisableMfaToken] = useState('');
  
  // Profile edit state
  const [editName, setEditName] = useState('');
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  
  // Copy state
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const fetchProfile = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/profile');
      if (res.ok) {
        const data = await res.json();
        setProfile(data.user);
        setEditName(data.user.name || '');
        setMfaRequired(data.mfaRequired);
        setMfaDeadline(data.mfaDeadline);
        setMfaGracePeriodExpired(data.mfaGracePeriodExpired);
      } else {
        toast.error('Failed to load profile');
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
      toast.error('Failed to load profile');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const updateName = async () => {
    try {
      setSaving(true);
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_name', name: editName }),
      });

      if (res.ok) {
        toast.success('Name updated successfully');
        fetchProfile();
      } else {
        const error = await res.json();
        toast.error(error.error || 'Failed to update name');
      }
    } catch (error) {
      console.error('Error updating name:', error);
      toast.error('Failed to update name');
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async () => {
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    if (newPassword.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }

    try {
      setSaving(true);
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'change_password',
          currentPassword,
          newPassword,
        }),
      });

      if (res.ok) {
        toast.success('Password changed successfully');
        setShowPasswordChange(false);
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        fetchProfile();
      } else {
        const error = await res.json();
        toast.error(error.error || 'Failed to change password');
      }
    } catch (error) {
      console.error('Error changing password:', error);
      toast.error('Failed to change password');
    } finally {
      setSaving(false);
    }
  };

  // MFA Functions
  const setupMFA = async () => {
    try {
      setSaving(true);
      const res = await fetch('/api/auth/mfa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'setup' }),
      });

      if (res.ok) {
        const data = await res.json();
        setMfaSetup(data);
        setShowMFASetup(true);
      } else {
        toast.error('Failed to setup MFA');
      }
    } catch (error) {
      console.error('Error setting up MFA:', error);
      toast.error('Failed to setup MFA');
    } finally {
      setSaving(false);
    }
  };

  const verifyMFA = async () => {
    try {
      setSaving(true);
      const res = await fetch('/api/auth/mfa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify', token: mfaToken }),
      });

      if (res.ok) {
        toast.success('MFA enabled successfully!');
        setShowMFASetup(false);
        setMfaSetup(null);
        setMfaToken('');
        setShowBackupCodes(true);
        setNewBackupCodes(mfaSetup?.backupCodes || []);
        fetchProfile();
      } else {
        const error = await res.json();
        toast.error(error.error || 'Invalid token');
      }
    } catch (error) {
      console.error('Error verifying MFA:', error);
      toast.error('Failed to verify MFA');
    } finally {
      setSaving(false);
    }
  };

  const disableMFA = async () => {
    try {
      setSaving(true);
      const res = await fetch('/api/auth/mfa', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: disableMfaToken }),
      });

      if (res.ok) {
        toast.success('MFA disabled');
        setShowDisableMFA(false);
        setDisableMfaToken('');
        fetchProfile();
      } else {
        const error = await res.json();
        toast.error(error.error || 'Failed to disable MFA');
      }
    } catch (error) {
      console.error('Error disabling MFA:', error);
      toast.error('Failed to disable MFA');
    } finally {
      setSaving(false);
    }
  };

  const regenerateBackupCodes = async () => {
    try {
      setSaving(true);
      const res = await fetch('/api/auth/mfa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'regenerate_backup' }),
      });

      if (res.ok) {
        const data = await res.json();
        setNewBackupCodes(data.backupCodes);
        setShowBackupCodes(true);
        toast.success('Backup codes regenerated');
        fetchProfile();
      } else {
        toast.error('Failed to regenerate backup codes');
      }
    } catch (error) {
      console.error('Error regenerating backup codes:', error);
      toast.error('Failed to regenerate backup codes');
    } finally {
      setSaving(false);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(id);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const roleColors: Record<string, string> = {
    OWNER: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    ADMIN: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    OPERATOR: 'bg-green-500/20 text-green-400 border-green-500/30',
    VIEWER: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-400"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-4xl mx-auto space-y-6"
      >
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <User className="h-8 w-8 text-blue-400" />
            My Profile
          </h1>
          <p className="text-slate-400 mt-1">Manage your account settings and security</p>
        </div>

        {/* MFA Required Alert */}
        {mfaRequired && !profile?.mfaEnabled && (
          <Card className={`border ${mfaGracePeriodExpired ? 'bg-red-500/10 border-red-500/50' : 'bg-amber-500/10 border-amber-500/50'}`}>
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className={`h-6 w-6 ${mfaGracePeriodExpired ? 'text-red-400' : 'text-amber-400'}`} />
                <div>
                  <h3 className={`font-semibold ${mfaGracePeriodExpired ? 'text-red-300' : 'text-amber-300'}`}>
                    {mfaGracePeriodExpired ? 'MFA Setup Required Immediately' : 'MFA Setup Required'}
                  </h3>
                  <p className={`text-sm mt-1 ${mfaGracePeriodExpired ? 'text-red-400' : 'text-amber-400'}`}>
                    {mfaGracePeriodExpired 
                      ? 'Your grace period has expired. You must enable MFA to continue using the application.' 
                      : `Your administrator requires MFA for all users. Please enable MFA before ${mfaDeadline ? new Date(mfaDeadline).toLocaleDateString() : 'the deadline'}.`
                    }
                  </p>
                  <Button 
                    onClick={setupMFA} 
                    className={`mt-3 ${mfaGracePeriodExpired ? 'bg-red-600 hover:bg-red-700' : 'bg-amber-600 hover:bg-amber-700'}`}
                  >
                    <Smartphone className="h-4 w-4 mr-2" />
                    Setup MFA Now
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Profile Info */}
        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <User className="h-5 w-5 text-blue-400" />
              Account Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Email - Read Only */}
              <div className="space-y-2">
                <Label className="text-slate-400 flex items-center gap-2">
                  <Mail className="h-4 w-4" /> Email Address
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    value={profile?.email || ''}
                    disabled
                    className="bg-slate-700/50 border-slate-600 text-slate-300"
                  />
                </div>
              </div>

              {/* Name - Editable */}
              <div className="space-y-2">
                <Label className="text-slate-400 flex items-center gap-2">
                  <User className="h-4 w-4" /> Display Name
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="bg-slate-700 border-slate-600"
                    placeholder="Enter your name"
                  />
                  <Button
                    onClick={updateName}
                    disabled={saving || editName === profile?.name}
                    size="sm"
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    <Save className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Role */}
              <div className="space-y-2">
                <Label className="text-slate-400 flex items-center gap-2">
                  <Shield className="h-4 w-4" /> Role
                </Label>
                <div>
                  <Badge className={`${roleColors[profile?.role || 'VIEWER']} border`}>
                    {profile?.role}
                  </Badge>
                </div>
              </div>

              {/* Organization */}
              <div className="space-y-2">
                <Label className="text-slate-400 flex items-center gap-2">
                  <Building className="h-4 w-4" /> Organization
                </Label>
                <p className="text-white">{profile?.organization?.name || 'No organization'}</p>
              </div>

              {/* Last Login */}
              <div className="space-y-2">
                <Label className="text-slate-400 flex items-center gap-2">
                  <Clock className="h-4 w-4" /> Last Login
                </Label>
                <p className="text-white">
                  {profile?.lastLoginAt 
                    ? new Date(profile.lastLoginAt).toLocaleString()
                    : 'Never'}
                </p>
              </div>

              {/* Account Created */}
              <div className="space-y-2">
                <Label className="text-slate-400 flex items-center gap-2">
                  <Calendar className="h-4 w-4" /> Account Created
                </Label>
                <p className="text-white">
                  {profile?.createdAt 
                    ? new Date(profile.createdAt).toLocaleDateString()
                    : 'Unknown'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Security Settings */}
        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Lock className="h-5 w-5 text-amber-400" />
              Security
            </CardTitle>
            <CardDescription className="text-slate-400">
              Manage your password and two-factor authentication
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Password Section */}
            <div className="flex items-center justify-between p-4 bg-slate-700/50 rounded-lg border border-slate-600">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Key className="h-4 w-4 text-slate-400" />
                  <span className="font-medium text-white">Password</span>
                </div>
                <p className="text-sm text-slate-400">
                  {profile?.passwordChangedAt
                    ? `Last changed ${new Date(profile.passwordChangedAt).toLocaleDateString()}`
                    : 'Never changed'}
                </p>
              </div>
              <Button
                variant="outline"
                onClick={() => setShowPasswordChange(true)}
                className="border-slate-600"
              >
                <Lock className="h-4 w-4 mr-2" />
                Change Password
              </Button>
            </div>

            {/* MFA Section */}
            <div className="flex items-center justify-between p-4 bg-slate-700/50 rounded-lg border border-slate-600">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  {profile?.mfaEnabled ? (
                    <ShieldCheck className="h-4 w-4 text-green-400" />
                  ) : (
                    <ShieldOff className="h-4 w-4 text-slate-400" />
                  )}
                  <span className="font-medium text-white">Two-Factor Authentication (MFA)</span>
                  {profile?.mfaEnabled && (
                    <Badge className="bg-green-500/20 text-green-400 border border-green-500/30">
                      Enabled
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-slate-400">
                  {profile?.mfaEnabled
                    ? `Enabled on ${new Date(profile.mfaVerifiedAt!).toLocaleDateString()}. ${profile.backupCodesCount} backup codes remaining.`
                    : 'Add an extra layer of security to your account'}
                </p>
              </div>
              <div className="flex gap-2">
                {profile?.mfaEnabled ? (
                  <>
                    <Button
                      variant="outline"
                      onClick={regenerateBackupCodes}
                      className="border-slate-600"
                      disabled={saving}
                    >
                      <RefreshCw className="h-4 w-4 mr-2" />
                      New Backup Codes
                    </Button>
                    {!mfaRequired && (
                      <Button
                        variant="outline"
                        onClick={() => setShowDisableMFA(true)}
                        className="border-red-600 text-red-400 hover:bg-red-600/10"
                      >
                        <ShieldOff className="h-4 w-4 mr-2" />
                        Disable
                      </Button>
                    )}
                  </>
                ) : (
                  <Button
                    onClick={setupMFA}
                    className="bg-purple-600 hover:bg-purple-700"
                    disabled={saving}
                  >
                    <Smartphone className="h-4 w-4 mr-2" />
                    Setup MFA
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Password Change Dialog */}
        <Dialog open={showPasswordChange} onOpenChange={setShowPasswordChange}>
          <DialogContent className="bg-slate-800 border-slate-700 text-white">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Lock className="h-5 w-5 text-amber-400" />
                Change Password
              </DialogTitle>
              <DialogDescription className="text-slate-400">
                Enter your current password and choose a new one.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label className="text-slate-300">Current Password</Label>
                <div className="relative">
                  <Input
                    type={showCurrentPassword ? 'text' : 'password'}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="bg-slate-700 border-slate-600 pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                    onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  >
                    {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-slate-300">New Password</Label>
                <div className="relative">
                  <Input
                    type={showNewPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="bg-slate-700 border-slate-600 pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                  >
                    {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-slate-300">Confirm New Password</Label>
                <Input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="bg-slate-700 border-slate-600"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setShowPasswordChange(false);
                  setCurrentPassword('');
                  setNewPassword('');
                  setConfirmPassword('');
                }}
                className="border-slate-600"
              >
                Cancel
              </Button>
              <Button
                onClick={changePassword}
                disabled={saving || !currentPassword || !newPassword || !confirmPassword}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {saving ? 'Changing...' : 'Change Password'}
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
                Scan the QR code with your authenticator app (Google Authenticator, Authy, etc.)
              </DialogDescription>
            </DialogHeader>
            {mfaSetup && (
              <div className="space-y-4 py-4">
                {/* QR Code */}
                <div className="flex justify-center">
                  <div className="bg-white p-4 rounded-lg">
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(mfaSetup.qrCodeUrl)}`}
                      alt="MFA QR Code"
                      className="w-48 h-48"
                    />
                  </div>
                </div>

                {/* Manual Entry Secret */}
                <div className="space-y-2">
                  <Label className="text-slate-400">Or enter this code manually:</Label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 p-2 bg-slate-700 rounded text-sm font-mono text-center text-green-400">
                      {mfaSetup.secret}
                    </code>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyToClipboard(mfaSetup.secret, 'secret')}
                      className="border-slate-600"
                    >
                      {copiedCode === 'secret' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>

                {/* Verification Code */}
                <div className="space-y-2">
                  <Label className="text-slate-300">Enter the 6-digit code from your app</Label>
                  <Input
                    type="text"
                    maxLength={6}
                    placeholder="000000"
                    value={mfaToken}
                    onChange={(e) => setMfaToken(e.target.value.replace(/\D/g, ''))}
                    className="bg-slate-700 border-slate-600 text-center text-2xl tracking-widest"
                  />
                </div>
              </div>
            )}
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setShowMFASetup(false);
                  setMfaSetup(null);
                  setMfaToken('');
                }}
                className="border-slate-600"
              >
                Cancel
              </Button>
              <Button
                onClick={verifyMFA}
                disabled={saving || mfaToken.length !== 6}
                className="bg-purple-600 hover:bg-purple-700"
              >
                {saving ? 'Verifying...' : 'Enable MFA'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Backup Codes Dialog */}
        <Dialog open={showBackupCodes} onOpenChange={setShowBackupCodes}>
          <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Key className="h-5 w-5 text-amber-400" />
                Backup Codes
              </DialogTitle>
              <DialogDescription className="text-slate-400">
                Save these codes in a safe place. Each code can only be used once.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-2">
                {newBackupCodes.map((code, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-2 bg-slate-700 rounded font-mono text-sm"
                  >
                    <span className="text-green-400">{code}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={() => copyToClipboard(code, code)}
                    >
                      {copiedCode === code ? (
                        <Check className="h-3 w-3 text-green-400" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </Button>
                  </div>
                ))}
              </div>
              <Button
                variant="outline"
                onClick={() => copyToClipboard(newBackupCodes.join('\n'), 'all')}
                className="w-full border-slate-600"
              >
                {copiedCode === 'all' ? (
                  <><Check className="h-4 w-4 mr-2" /> Copied!</>
                ) : (
                  <><Copy className="h-4 w-4 mr-2" /> Copy All Codes</>
                )}
              </Button>
            </div>
            <DialogFooter>
              <Button
                onClick={() => {
                  setShowBackupCodes(false);
                  setNewBackupCodes([]);
                }}
                className="bg-blue-600 hover:bg-blue-700"
              >
                I&apos;ve Saved These Codes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Disable MFA Confirmation */}
        <AlertDialog open={showDisableMFA} onOpenChange={setShowDisableMFA}>
          <AlertDialogContent className="bg-slate-800 border-slate-700">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-white flex items-center gap-2">
                <ShieldOff className="h-5 w-5 text-red-400" />
                Disable Two-Factor Authentication?
              </AlertDialogTitle>
              <AlertDialogDescription className="text-slate-400">
                This will make your account less secure. Enter your current MFA code to confirm.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="py-4">
              <Input
                type="text"
                maxLength={6}
                placeholder="Enter MFA code"
                value={disableMfaToken}
                onChange={(e) => setDisableMfaToken(e.target.value.replace(/\D/g, ''))}
                className="bg-slate-700 border-slate-600 text-center text-xl tracking-widest"
              />
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel className="bg-slate-700 border-slate-600 text-white hover:bg-slate-600">
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={disableMFA}
                disabled={saving || disableMfaToken.length !== 6}
                className="bg-red-600 hover:bg-red-700"
              >
                {saving ? 'Disabling...' : 'Disable MFA'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </motion.div>
    </div>
  );
}
