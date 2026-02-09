'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';

import { Database, Mail, Lock, Loader2, Shield, KeyRound, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaToken, setMfaToken] = useState('');
  const [mfaBackupCode, setMfaBackupCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [mfaRequired, setMfaRequired] = useState(false);
  const [useBackupCode, setUseBackupCode] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await signIn('credentials', {
        email,
        password,
        mfaToken: mfaRequired ? mfaToken : undefined,
        mfaBackupCode: mfaRequired && useBackupCode ? mfaBackupCode : undefined,
        redirect: false,
      });

      if (result?.error) {
        // Handle specific error codes
        if (result.error.includes('MFA_REQUIRED')) {
          setMfaRequired(true);
          setError('');
        } else if (result.error.includes('ACCOUNT_DISABLED')) {
          setError('Your account has been disabled. Please contact an administrator.');
        } else if (result.error.includes('ACCOUNT_LOCKED')) {
          setError('Your account is locked due to too many failed attempts. Please try again later.');
        } else if (result.error.includes('INVALID_MFA_TOKEN')) {
          setError('Invalid authentication code. Please try again.');
        } else if (result.error.includes('INVALID_BACKUP_CODE')) {
          setError('Invalid backup code. Please try again.');
        } else {
          setError('Invalid email or password');
        }
      } else {
        router.replace('/dashboard');
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    setMfaRequired(false);
    setMfaToken('');
    setMfaBackupCode('');
    setUseBackupCode(false);
    setError('');
  };

  return (
    <Card className="border-slate-700/50 bg-slate-800/80 backdrop-blur-md shadow-2xl">
      <CardHeader className="text-center pb-2">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 shadow-lg">
          {mfaRequired ? (
            <Shield className="h-8 w-8 text-white" />
          ) : (
            <Database className="h-8 w-8 text-white" />
          )}
        </div>
        <CardTitle className="text-2xl text-slate-100">
          {mfaRequired ? 'Two-Factor Authentication' : 'Welcome back'}
        </CardTitle>
        <CardDescription>
          {mfaRequired
            ? 'Enter the code from your authenticator app'
            : 'Sign in to your BroadPlane-DB account'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-md bg-red-500/10 border border-red-500/30 p-3 text-sm text-red-400">
              {error}
            </div>
          )}

          {!mfaRequired ? (
            <>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10"
                    required
                  />
                </div>
              </div>
            </>
          ) : (
            <>
              {!useBackupCode ? (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-300">Authentication Code</label>
                  <div className="relative">
                    <Shield className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      type="text"
                      placeholder="000000"
                      value={mfaToken}
                      onChange={(e) => setMfaToken(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      className="pl-10 text-center text-xl tracking-widest"
                      maxLength={6}
                      autoFocus
                      required
                    />
                  </div>
                  <p className="text-xs text-slate-500">
                    Enter the 6-digit code from your authenticator app
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-300">Backup Code</label>
                  <div className="relative">
                    <KeyRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      type="text"
                      placeholder="XXXXXXXX"
                      value={mfaBackupCode}
                      onChange={(e) => setMfaBackupCode(e.target.value.toUpperCase())}
                      className="pl-10 text-center text-xl tracking-widest"
                      maxLength={8}
                      autoFocus
                      required
                    />
                  </div>
                  <p className="text-xs text-slate-500">
                    Enter one of your backup codes
                  </p>
                </div>
              )}

              <button
                type="button"
                onClick={() => {
                  setUseBackupCode(!useBackupCode);
                  setMfaToken('');
                  setMfaBackupCode('');
                }}
                className="text-sm text-cyan-400 hover:text-cyan-300 w-full text-center"
              >
                {useBackupCode ? 'Use authenticator app instead' : 'Use a backup code instead'}
              </button>
            </>
          )}

          <div className="flex gap-2">
            {mfaRequired && (
              <Button
                type="button"
                variant="outline"
                onClick={handleBack}
                className="flex-1"
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
            )}
            <Button type="submit" className={mfaRequired ? 'flex-1' : 'w-full'} disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {mfaRequired ? 'Verifying...' : 'Signing in...'}
                </>
              ) : (
                mfaRequired ? 'Verify' : 'Sign in'
              )}
            </Button>
          </div>
        </form>


      </CardContent>
    </Card>
  );
}
