'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  Key,
  Copy,
  Check,
  RefreshCw,
  AlertTriangle,
  Clock,
  Database,
  Terminal,
  Server,
  Shield,
  PlayCircle,
  CheckCircle,
  XCircle,
  Loader2,
  Eye,
  EyeOff,
  Calendar,
  RotateCcw,
  Send,
  Smartphone,
  Lock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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

interface Credential {
  id: string;
  username: string;
  currentPassword: string;
  passwordHistoryCount: number;
  lastRotatedAt: string;
  rotationIntervalDays: number;
  nextRotationAt: string | null;
  status: string;
  passwordAge: number;
}

interface PropagationStatus {
  id: string;
  nodeId: string;
  clusterId: string;
  status: string;
  lastAttemptAt: string | null;
  successAt: string | null;
  errorMessage: string | null;
  passwordUsed: string | null;
}

interface CredentialAlert {
  id: string;
  nodeId: string;
  clusterId: string;
  alertType: string;
  message: string;
  resolved: boolean;
  createdAt: string;
}

interface Node {
  id: string;
  name: string;
  host: string;
  clusterId: string;
  clusterName: string;
}

export default function DBAdminPage() {
  const router = useRouter();
  const [credential, setCredential] = useState<Credential | null>(null);
  const [propagations, setPropagations] = useState<PropagationStatus[]>([]);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [alerts, setAlerts] = useState<CredentialAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [confirmPropagate, setConfirmPropagate] = useState(false);

  // MFA Gate state
  const [checkingMfa, setCheckingMfa] = useState(true);
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaVerified, setMfaVerified] = useState(false);
  const [showMfaPrompt, setShowMfaPrompt] = useState(false);
  const [showMfaVerify, setShowMfaVerify] = useState(false);
  const [mfaToken, setMfaToken] = useState('');
  const [mfaNotSetup, setMfaNotSetup] = useState(false);
  const [mfaVerifying, setMfaVerifying] = useState(false);

  // Check MFA requirement on mount
  useEffect(() => {
    const checkMfaAccess = async () => {
      try {
        const res = await fetch('/api/admin/mfa-settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'check_db_admin_access' }),
        });
        
        let allowed = false;
        
        if (res.ok) {
          const data = await res.json();
          if (data.allowed) {
            allowed = true;
          } else if (data.mfaRequired) {
            setMfaRequired(true);
            if (data.mfaNotSetup) {
              setMfaNotSetup(true);
            }
            setShowMfaPrompt(true);
            setCheckingMfa(false);
            setLoading(false); // Stop loading, show MFA prompt
            return; // Exit early - don't fetch credentials yet
          } else {
            // Fallback: allow access if response doesn't have expected fields
            allowed = true;
          }
        } else {
          // Non-OK response (401, 403, etc.) - allow access and let credentials API handle auth
          console.warn('MFA check returned non-OK status:', res.status);
          allowed = true;
        }
        
        setCheckingMfa(false);
        
        if (allowed) {
          setMfaVerified(true);
          // Fetch credentials immediately
          try {
            const credRes = await fetch('/api/admin/credentials');
            if (credRes.ok) {
              const credData = await credRes.json();
              setCredential(credData.credential);
              setPropagations(credData.propagations || []);
              setNodes(credData.nodes || []);
              setAlerts(credData.alerts || []);
            }
          } catch (credError) {
            console.error('Error fetching credentials:', credError);
            toast.error('Failed to fetch credentials');
          } finally {
            setLoading(false);
          }
        }
      } catch (error) {
        console.error('Error checking MFA access:', error);
        // Allow access if MFA check fails
        setCheckingMfa(false);
        setMfaVerified(true);
        setLoading(false);
      }
    };

    checkMfaAccess();
  }, []);

  const handleMfaPromptProceed = () => {
    setShowMfaPrompt(false);
    if (mfaNotSetup) {
      // Redirect to profile to setup MFA
      router.push('/profile');
    } else {
      setShowMfaVerify(true);
    }
  };

  const handleMfaPromptCancel = () => {
    setShowMfaPrompt(false);
    router.back();
  };

  const verifyMfaForAccess = async () => {
    try {
      setMfaVerifying(true);
      const res = await fetch('/api/admin/mfa-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify_db_admin_mfa', token: mfaToken }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.verified) {
          setMfaVerified(true);
          setShowMfaVerify(false);
          setMfaToken('');
          toast.success('MFA verified successfully');
          // Fetch credentials after successful MFA verification
          try {
            const credRes = await fetch('/api/admin/credentials');
            if (credRes.ok) {
              const credData = await credRes.json();
              setCredential(credData.credential);
              setPropagations(credData.propagations || []);
              setNodes(credData.nodes || []);
              setAlerts(credData.alerts || []);
            }
          } catch (credError) {
            console.error('Error fetching credentials:', credError);
            toast.error('Failed to fetch credentials');
          } finally {
            setLoading(false);
          }
        }
      } else {
        const error = await res.json();
        toast.error(error.error || 'Invalid MFA token');
      }
    } catch (error) {
      console.error('Error verifying MFA:', error);
      toast.error('Failed to verify MFA');
    } finally {
      setMfaVerifying(false);
    }
  };

  const fetchCredentials = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/credentials');
      if (res.ok) {
        const data = await res.json();
        setCredential(data.credential);
        setPropagations(data.propagations || []);
        setNodes(data.nodes || []);
        setAlerts(data.alerts || []);
      }
    } catch (error) {
      console.error('Error fetching credentials:', error);
      toast.error('Failed to fetch credentials');
    } finally {
      setLoading(false);
    }
  }, []);

  const initializeCredentials = async () => {
    setActionLoading('initialize');
    try {
      const res = await fetch('/api/admin/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'initialize' }),
      });
      if (res.ok) {
        toast.success('Superuser credentials initialized');
        await fetchCredentials();
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to initialize');
      }
    } catch (error) {
      console.error(error);
      toast.error('Failed to initialize credentials');
    } finally {
      setActionLoading(null);
    }
  };

  const rotatePassword = async () => {
    setConfirmRotate(false);
    setActionLoading('rotate');
    try {
      const res = await fetch('/api/admin/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'rotate' }),
      });
      if (res.ok) {
        toast.success('Password rotated successfully. Propagation will begin.');
        await fetchCredentials();
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to rotate password');
      }
    } catch (error) {
      console.error(error);
      toast.error('Failed to rotate password');
    } finally {
      setActionLoading(null);
    }
  };

  const propagateToAllNodes = async () => {
    setConfirmPropagate(false);
    setActionLoading('propagate-all');
    try {
      const res = await fetch('/api/admin/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'propagate-all' }),
      });
      if (res.ok) {
        const data = await res.json();
        toast.success(`Propagated to ${data.summary.successful}/${data.summary.total} nodes`);
        await fetchCredentials();
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to propagate');
      }
    } catch (error) {
      console.error(error);
      toast.error('Failed to propagate credentials');
    } finally {
      setActionLoading(null);
    }
  };

  const resolveAlert = async (alertId: string) => {
    try {
      const res = await fetch('/api/admin/credentials', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'resolve-alert', alertId }),
      });
      if (res.ok) {
        toast.success('Alert resolved');
        await fetchCredentials();
      }
    } catch (error) {
      console.error(error);
      toast.error('Failed to resolve alert');
    }
  };

  const copyToClipboard = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
      toast.success('Copied to clipboard');
    } catch {
      toast.error('Failed to copy');
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    return new Date(dateStr).toLocaleString();
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ACTIVE':
      case 'SUCCESS':
        return <Badge className="bg-green-500/20 text-green-400 border-green-500/30"><CheckCircle className="w-3 h-3 mr-1" />Active</Badge>;
      case 'SYNCING':
      case 'PENDING':
        return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30"><Loader2 className="w-3 h-3 mr-1 animate-spin" />Syncing</Badge>;
      case 'NEEDS_REENROLLMENT':
      case 'FAILED':
        return <Badge className="bg-red-500/20 text-red-400 border-red-500/30"><XCircle className="w-3 h-3 mr-1" />Needs Re-enrollment</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  // Generate scripts with current password
  const currentPassword = credential?.currentPassword || 'YOUR_PASSWORD_HERE';
  const escapedPassword = currentPassword.replace(/'/g, "'\"'\"'").replace(/\$/g, '\\$');

  const dockerScript = `--entrypoint /bin/sh -c "docker-entrypoint.sh postgres & sleep 5 && until pg_isready; do sleep 1; done && psql -U postgres -tc \"SELECT 1 FROM pg_roles WHERE rolname='broadplane_db'\" | grep -q 1 || psql -U postgres -c \"CREATE USER broadplane_db WITH SUPERUSER CREATEDB CREATEROLE REPLICATION LOGIN PASSWORD '${escapedPassword}'\" && wait"`;

  const pgAdminScript = `-- PgAdmin SQL Script for broadplane_db user setup
-- Run this as a superuser (e.g., postgres)

-- Check if user exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'broadplane_db') THEN
        CREATE USER broadplane_db WITH 
            SUPERUSER 
            CREATEDB 
            CREATEROLE 
            REPLICATION 
            LOGIN 
            PASSWORD '${currentPassword}';
        RAISE NOTICE 'User broadplane_db created successfully';
    ELSE
        ALTER USER broadplane_db WITH PASSWORD '${currentPassword}';
        RAISE NOTICE 'User broadplane_db password updated';
    END IF;
END
$$;`;

  const cliScript = `#!/bin/bash
# PostgreSQL broadplane_db user setup script
# Run on the PostgreSQL server with superuser access

PGPASSWORD=\${PGPASSWORD:-} psql -U postgres -d postgres -tc "SELECT 1 FROM pg_roles WHERE rolname='broadplane_db'" | grep -q 1
if [ \$? -ne 0 ]; then
    echo "Creating broadplane_db user..."
    PGPASSWORD=\${PGPASSWORD:-} psql -U postgres -d postgres -c "CREATE USER broadplane_db WITH SUPERUSER CREATEDB CREATEROLE REPLICATION LOGIN PASSWORD '${escapedPassword}'"
    echo "User created successfully."
else
    echo "Updating broadplane_db password..."
    PGPASSWORD=\${PGPASSWORD:-} psql -U postgres -d postgres -c "ALTER USER broadplane_db WITH PASSWORD '${escapedPassword}'"
    echo "Password updated."
fi`;

  const abacusScript = `# Abacus AI DeepAgent Script
# Use this to create the broadplane_db superuser via DeepAgent

# First, SSH into your PostgreSQL server or run these commands directly:

# Option 1: Using psql directly
sudo -u postgres psql -c "DO \$\$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'broadplane_db') THEN
        CREATE USER broadplane_db WITH SUPERUSER CREATEDB CREATEROLE REPLICATION LOGIN PASSWORD '${currentPassword}';
    ELSE
        ALTER USER broadplane_db WITH PASSWORD '${currentPassword}';
    END IF;
END
\$\$;"

# Option 2: If you have docker-compose running PostgreSQL
docker exec -it <postgres_container_name> psql -U postgres -c "CREATE USER broadplane_db WITH SUPERUSER CREATEDB CREATEROLE REPLICATION LOGIN PASSWORD '${currentPassword}' " 2>/dev/null || docker exec -it <postgres_container_name> psql -U postgres -c "ALTER USER broadplane_db WITH PASSWORD '${currentPassword}'"`;

  // Show loading while checking MFA or loading credentials
  if (checkingMfa || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-cyan-500" />
      </div>
    );
  }

  // Show MFA prompt if not verified yet
  if (mfaRequired && !mfaVerified) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-slate-100 to-slate-200 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 p-6 flex items-center justify-center">
        {/* MFA Prompt Dialog */}
        <AlertDialog open={showMfaPrompt} onOpenChange={setShowMfaPrompt}>
          <AlertDialogContent className="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-slate-900 dark:text-white flex items-center gap-2">
                <Shield className="h-5 w-5 text-amber-500" />
                MFA Authentication Required
              </AlertDialogTitle>
              <AlertDialogDescription className="text-slate-600 dark:text-slate-400">
                {mfaNotSetup
                  ? 'You need to set up MFA before accessing DB Admin. Click proceed to go to your profile and configure MFA.'
                  : 'MFA authentication is required to access the DB Admin section. Do you want to proceed?'}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={handleMfaPromptCancel} className="bg-slate-100 dark:bg-slate-700 border-slate-300 dark:border-slate-600">
                No
              </AlertDialogCancel>
              <AlertDialogAction onClick={handleMfaPromptProceed} className="bg-amber-600 hover:bg-amber-700">
                Yes
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* MFA Verification Dialog */}
        <Dialog open={showMfaVerify} onOpenChange={setShowMfaVerify}>
          <DialogContent className="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Lock className="h-5 w-5 text-amber-500" />
                Enter MFA Code
              </DialogTitle>
              <DialogDescription className="text-slate-600 dark:text-slate-400">
                Enter your 6-digit code from your authenticator app to access DB Admin.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label className="text-slate-700 dark:text-slate-300">MFA Code</Label>
                <Input
                  type="text"
                  maxLength={6}
                  placeholder="000000"
                  value={mfaToken}
                  onChange={(e) => setMfaToken(e.target.value.replace(/\D/g, ''))}
                  className="bg-slate-50 dark:bg-slate-700 border-slate-300 dark:border-slate-600 text-center text-2xl tracking-widest"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && mfaToken.length === 6) {
                      verifyMfaForAccess();
                    }
                  }}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setShowMfaVerify(false);
                  router.back();
                }}
                className="border-slate-300 dark:border-slate-600"
              >
                Cancel
              </Button>
              <Button
                onClick={verifyMfaForAccess}
                disabled={mfaToken.length !== 6 || mfaVerifying}
                className="bg-amber-600 hover:bg-amber-700"
              >
                {mfaVerifying ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  'Verify & Access'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-slate-100 to-slate-200 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-7xl mx-auto space-y-6"
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-cyan-500 to-blue-500 bg-clip-text text-transparent">
              DB Admin - Superuser Credentials
            </h1>
            <p className="text-slate-600 dark:text-slate-400 mt-1">
              Manage the broadplane_db superuser account across all PostgreSQL nodes
            </p>
          </div>
          <Button onClick={fetchCredentials} variant="outline" size="icon">
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>

        {/* Alerts */}
        {alerts.length > 0 && (
          <Card className="border-red-500/50 bg-red-500/10">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-red-500">
                <AlertTriangle className="w-5 h-5" />
                Credential Alerts ({alerts.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {alerts.map((alert) => (
                <div key={alert.id} className="flex items-center justify-between p-3 bg-red-500/10 rounded-lg border border-red-500/30">
                  <div>
                    <p className="text-sm font-medium text-red-400">{alert.message}</p>
                    <p className="text-xs text-slate-500">{formatDate(alert.createdAt)}</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => resolveAlert(alert.id)}>
                    <Check className="w-4 h-4 mr-1" /> Resolve
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Main Content */}
        {!credential ? (
          <Card className="bg-white/80 dark:bg-slate-800/50 backdrop-blur border-slate-200 dark:border-slate-700">
            <CardContent className="p-8 text-center">
              <Key className="w-16 h-16 mx-auto text-slate-400 mb-4" />
              <h2 className="text-xl font-semibold text-slate-700 dark:text-slate-200 mb-2">
                No Superuser Credentials Found
              </h2>
              <p className="text-slate-500 dark:text-slate-400 mb-6">
                Initialize the broadplane_db superuser account to manage your PostgreSQL databases.
              </p>
              <Button
                onClick={initializeCredentials}
                disabled={actionLoading === 'initialize'}
                className="bg-gradient-to-r from-cyan-500 to-blue-500"
              >
                {actionLoading === 'initialize' ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Shield className="w-4 h-4 mr-2" />
                )}
                Initialize Superuser Credentials
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-6">
            {/* Credential Status Card */}
            <Card className="bg-white/80 dark:bg-slate-800/50 backdrop-blur border-slate-200 dark:border-slate-700">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Key className="w-5 h-5 text-cyan-500" />
                    Current Credentials
                  </CardTitle>
                  {getStatusBadge(credential.status)}
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Username & Password */}
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-slate-500 dark:text-slate-400">Username</label>
                    <div className="flex items-center gap-2 mt-1">
                      <code className="flex-1 p-2 bg-slate-100 dark:bg-slate-900 rounded font-mono text-sm">
                        {credential.username}
                      </code>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => copyToClipboard(credential.username, 'username')}
                      >
                        {copiedField === 'username' ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                      </Button>
                    </div>
                  </div>
                  <div>
                    <label className="text-sm text-slate-500 dark:text-slate-400">Current Password</label>
                    <div className="flex items-center gap-2 mt-1">
                      <code className="flex-1 p-2 bg-slate-100 dark:bg-slate-900 rounded font-mono text-sm overflow-x-auto">
                        {showPassword ? credential.currentPassword : '••••••••••••••••••••••••••••••••'}
                      </code>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => copyToClipboard(credential.currentPassword, 'password')}
                      >
                        {copiedField === 'password' ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Password Stats */}
                <div className="grid md:grid-cols-4 gap-4">
                  <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-lg">
                    <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                      <Calendar className="w-4 h-4" />
                      <span className="text-xs">Last Changed</span>
                    </div>
                    <p className="text-sm font-medium mt-1">{formatDate(credential.lastRotatedAt)}</p>
                  </div>
                  <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-lg">
                    <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                      <Clock className="w-4 h-4" />
                      <span className="text-xs">Password Age</span>
                    </div>
                    <p className={`text-sm font-medium mt-1 ${credential.passwordAge > 40 ? 'text-yellow-500' : credential.passwordAge > 45 ? 'text-red-500' : ''}`}>
                      {credential.passwordAge} days
                    </p>
                  </div>
                  <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-lg">
                    <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                      <RotateCcw className="w-4 h-4" />
                      <span className="text-xs">Next Rotation</span>
                    </div>
                    <p className="text-sm font-medium mt-1">{formatDate(credential.nextRotationAt)}</p>
                  </div>
                  <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-lg">
                    <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                      <Key className="w-4 h-4" />
                      <span className="text-xs">History Size</span>
                    </div>
                    <p className="text-sm font-medium mt-1">{credential.passwordHistoryCount} / 6 passwords</p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-3">
                  <Button
                    onClick={() => setConfirmRotate(true)}
                    disabled={actionLoading !== null}
                    variant="outline"
                    className="border-yellow-500 text-yellow-600 hover:bg-yellow-50 dark:hover:bg-yellow-500/10"
                  >
                    {actionLoading === 'rotate' ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4 mr-2" />
                    )}
                    Force Password Rotation
                  </Button>
                  <Button
                    onClick={() => setConfirmPropagate(true)}
                    disabled={actionLoading !== null || nodes.length === 0}
                    className="bg-gradient-to-r from-cyan-500 to-blue-500"
                  >
                    {actionLoading === 'propagate-all' ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4 mr-2" />
                    )}
                    Propagate to All Nodes ({nodes.length})
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Setup Scripts Tabs */}
            <Card className="bg-white/80 dark:bg-slate-800/50 backdrop-blur border-slate-200 dark:border-slate-700">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Terminal className="w-5 h-5 text-cyan-500" />
                  Setup Scripts
                </CardTitle>
                <CardDescription>
                  Use these scripts to create the broadplane_db superuser on new PostgreSQL databases
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="docker" className="w-full">
                  <TabsList className="grid w-full grid-cols-4">
                    <TabsTrigger value="docker" className="flex items-center gap-2">
                      <Server className="w-4 h-4" />
                      Docker
                    </TabsTrigger>
                    <TabsTrigger value="pgadmin" className="flex items-center gap-2">
                      <Database className="w-4 h-4" />
                      PgAdmin
                    </TabsTrigger>
                    <TabsTrigger value="cli" className="flex items-center gap-2">
                      <Terminal className="w-4 h-4" />
                      CLI
                    </TabsTrigger>
                    <TabsTrigger value="abacus" className="flex items-center gap-2">
                      <PlayCircle className="w-4 h-4" />
                      Abacus AI
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="docker" className="mt-4">
                    <div className="space-y-3">
                      <p className="text-sm text-slate-600 dark:text-slate-400">
                        Use this as a Docker entrypoint command for Coolify or custom deployments:
                      </p>
                      <div className="relative">
                        <pre className="p-4 bg-slate-900 text-green-400 rounded-lg text-sm overflow-x-auto whitespace-pre-wrap font-mono">
                          {dockerScript}
                        </pre>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="absolute top-2 right-2 text-slate-400 hover:text-white"
                          onClick={() => copyToClipboard(dockerScript, 'docker')}
                        >
                          {copiedField === 'docker' ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                        </Button>
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="pgadmin" className="mt-4">
                    <div className="space-y-3">
                      <p className="text-sm text-slate-600 dark:text-slate-400">
                        Run this SQL in PgAdmin&apos;s Query Tool as a superuser (postgres):
                      </p>
                      <div className="relative">
                        <pre className="p-4 bg-slate-900 text-cyan-400 rounded-lg text-sm overflow-x-auto whitespace-pre-wrap font-mono">
                          {pgAdminScript}
                        </pre>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="absolute top-2 right-2 text-slate-400 hover:text-white"
                          onClick={() => copyToClipboard(pgAdminScript, 'pgadmin')}
                        >
                          {copiedField === 'pgadmin' ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                        </Button>
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="cli" className="mt-4">
                    <div className="space-y-3">
                      <p className="text-sm text-slate-600 dark:text-slate-400">
                        Save this as a shell script and run it on your PostgreSQL server:
                      </p>
                      <div className="relative">
                        <pre className="p-4 bg-slate-900 text-yellow-400 rounded-lg text-sm overflow-x-auto whitespace-pre-wrap font-mono">
                          {cliScript}
                        </pre>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="absolute top-2 right-2 text-slate-400 hover:text-white"
                          onClick={() => copyToClipboard(cliScript, 'cli')}
                        >
                          {copiedField === 'cli' ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                        </Button>
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="abacus" className="mt-4">
                    <div className="space-y-3">
                      <p className="text-sm text-slate-600 dark:text-slate-400">
                        Use this script with Abacus AI DeepAgent to create the superuser:
                      </p>
                      <div className="relative">
                        <pre className="p-4 bg-slate-900 text-purple-400 rounded-lg text-sm overflow-x-auto whitespace-pre-wrap font-mono">
                          {abacusScript}
                        </pre>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="absolute top-2 right-2 text-slate-400 hover:text-white"
                          onClick={() => copyToClipboard(abacusScript, 'abacus')}
                        >
                          {copiedField === 'abacus' ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                        </Button>
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>

            {/* Node Propagation Status */}
            {nodes.length > 0 && (
              <Card className="bg-white/80 dark:bg-slate-800/50 backdrop-blur border-slate-200 dark:border-slate-700">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Server className="w-5 h-5 text-cyan-500" />
                    Node Credential Status
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {nodes.map((node) => {
                      const propagation = propagations.find((p) => p.nodeId === node.id);
                      return (
                        <div
                          key={node.id}
                          className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-900/50 rounded-lg"
                        >
                          <div>
                            <p className="font-medium">{node.name}</p>
                            <p className="text-sm text-slate-500">{node.host} • {node.clusterName}</p>
                          </div>
                          <div className="flex items-center gap-4">
                            {propagation ? (
                              <>
                                {getStatusBadge(propagation.status)}
                                {propagation.lastAttemptAt && (
                                  <span className="text-xs text-slate-500">
                                    Last attempt: {formatDate(propagation.lastAttemptAt)}
                                  </span>
                                )}
                              </>
                            ) : (
                              <Badge variant="secondary">Not Synced</Badge>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Confirm Rotate Dialog */}
        <AlertDialog open={confirmRotate} onOpenChange={setConfirmRotate}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <RefreshCw className="w-5 h-5 text-yellow-500" />
                Force Password Rotation
              </AlertDialogTitle>
              <AlertDialogDescription>
                This will generate a new 32-character secure password and begin propagating it to all configured nodes.
                The current password will be stored in history for fallback purposes.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={rotatePassword} className="bg-yellow-500 hover:bg-yellow-600">
                Rotate Password
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Confirm Propagate Dialog */}
        <AlertDialog open={confirmPropagate} onOpenChange={setConfirmPropagate}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <Send className="w-5 h-5 text-cyan-500" />
                Propagate Credentials to All Nodes
              </AlertDialogTitle>
              <AlertDialogDescription>
                This will attempt to update the broadplane_db password on all {nodes.length} registered nodes.
                Nodes that cannot be updated will be flagged for manual re-enrollment.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={propagateToAllNodes} className="bg-cyan-500 hover:bg-cyan-600">
                Propagate Now
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </motion.div>
    </div>
  );
}
