'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  ArrowLeft, Database, HardDrive, Clock, Calendar, Play, CheckCircle,
  XCircle, RefreshCw, Download, Trash2, Shield, Settings, Plus,
  Archive, RotateCcw, AlertTriangle, Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface Backup {
  id: string;
  clusterId: string;
  nodeId: string | null;
  type: 'FULL' | 'INCREMENTAL' | 'WAL' | 'PITR';
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'VALIDATING' | 'VERIFIED';
  size: number | null;
  location: string | null;
  startedAt: string | null;
  completedAt: string | null;
  walStart: string | null;
  walEnd: string | null;
  pitrTarget: string | null;
  retentionDays: number;
  verified: boolean;
  verifiedAt: string | null;
  errorMessage: string | null;
  createdAt: string;
}

interface BackupSchedule {
  id: string;
  clusterId: string;
  enabled: boolean;
  fullBackupCron: string;
  incrBackupCron: string;
  walArchiving: boolean;
  retentionDays: number;
  lastFullBackup: string | null;
  lastIncrBackup: string | null;
  nextFullBackup: string | null;
  nextIncrBackup: string | null;
}

interface BackupStats {
  totalBackups: number;
  totalSize: number;
  completedBackups: number;
  failedBackups: number;
  lastFullBackup: string | null;
  lastIncrBackup: string | null;
}

interface Cluster {
  id: string;
  name: string;
  status: string;
}

export default function BackupsPage() {
  const params = useParams();
  const router = useRouter();
  const clusterId = params.id as string;

  const [cluster, setCluster] = useState<Cluster | null>(null);
  const [backups, setBackups] = useState<Backup[]>([]);
  const [schedule, setSchedule] = useState<BackupSchedule | null>(null);
  const [stats, setStats] = useState<BackupStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const [showNewBackup, setShowNewBackup] = useState(false);
  const [showScheduleEdit, setShowScheduleEdit] = useState(false);
  const [showRestoreDialog, setShowRestoreDialog] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [selectedBackup, setSelectedBackup] = useState<Backup | null>(null);

  const [newBackupType, setNewBackupType] = useState<'FULL' | 'INCREMENTAL' | 'WAL'>('FULL');
  const [scheduleForm, setScheduleForm] = useState({
    enabled: true,
    fullBackupCron: '0 2 * * 0',
    incrBackupCron: '0 2 * * 1-6',
    walArchiving: true,
    retentionDays: 30,
  });
  const [pitrTarget, setPitrTarget] = useState('');

  useEffect(() => {
    fetchCluster();
    fetchBackups();
  }, [clusterId]);

  useEffect(() => {
    if (schedule) {
      setScheduleForm({
        enabled: schedule.enabled,
        fullBackupCron: schedule.fullBackupCron,
        incrBackupCron: schedule.incrBackupCron,
        walArchiving: schedule.walArchiving,
        retentionDays: schedule.retentionDays,
      });
    }
  }, [schedule]);

  const fetchCluster = async () => {
    try {
      const res = await fetch(`/api/clusters/${clusterId}`);
      if (res.ok) {
        const data = await res.json();
        setCluster(data);
      }
    } catch (error) {
      console.error('Failed to fetch cluster:', error);
    }
  };

  const fetchBackups = async () => {
    try {
      const res = await fetch(`/api/backups?clusterId=${clusterId}`);
      if (res.ok) {
        const data = await res.json();
        setBackups(data.backups);
        setSchedule(data.schedule);
        setStats(data.stats);
      }
    } catch (error) {
      console.error('Failed to fetch backups:', error);
    } finally {
      setLoading(false);
    }
  };

  const createBackup = async () => {
    setActionLoading('create');
    try {
      const res = await fetch('/api/backups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clusterId, type: newBackupType }),
      });
      if (res.ok) {
        setShowNewBackup(false);
        fetchBackups();
        // Poll for updates
        const interval = setInterval(fetchBackups, 2000);
        setTimeout(() => clearInterval(interval), 30000);
      }
    } catch (error) {
      console.error('Failed to create backup:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const updateSchedule = async () => {
    setActionLoading('schedule');
    try {
      const res = await fetch('/api/backups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'schedule', clusterId, ...scheduleForm }),
      });
      if (res.ok) {
        setShowScheduleEdit(false);
        fetchBackups();
      }
    } catch (error) {
      console.error('Failed to update schedule:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const verifyBackup = async (backup: Backup) => {
    setActionLoading(backup.id);
    try {
      await fetch('/api/backups', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: backup.id, action: 'verify' }),
      });
      // Poll for verification completion
      const interval = setInterval(fetchBackups, 1000);
      setTimeout(() => clearInterval(interval), 10000);
    } catch (error) {
      console.error('Failed to verify backup:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const initiateRestore = async () => {
    if (!selectedBackup) return;
    setActionLoading('restore');
    try {
      const res = await fetch('/api/backups', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selectedBackup.id, action: 'restore', pitrTarget: pitrTarget || undefined }),
      });
      if (res.ok) {
        setShowRestoreDialog(false);
        setSelectedBackup(null);
        setPitrTarget('');
      }
    } catch (error) {
      console.error('Failed to initiate restore:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const deleteBackup = async () => {
    if (!selectedBackup) return;
    setActionLoading('delete');
    try {
      await fetch(`/api/backups?id=${selectedBackup.id}`, { method: 'DELETE' });
      setShowDeleteConfirm(false);
      setSelectedBackup(null);
      fetchBackups();
    } catch (error) {
      console.error('Failed to delete backup:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const formatSize = (bytes: number | null) => {
    if (!bytes) return 'N/A';
    if (bytes >= 1000000000) return `${(bytes / 1000000000).toFixed(2)} GB`;
    if (bytes >= 1000000) return `${(bytes / 1000000).toFixed(2)} MB`;
    return `${(bytes / 1000).toFixed(2)} KB`;
  };

  const formatDate = (date: string | null) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleString();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'COMPLETED':
      case 'VERIFIED': return 'bg-green-500/20 text-green-400';
      case 'IN_PROGRESS':
      case 'VALIDATING': return 'bg-blue-500/20 text-blue-400';
      case 'PENDING': return 'bg-yellow-500/20 text-yellow-400';
      case 'FAILED': return 'bg-red-500/20 text-red-400';
      default: return 'bg-slate-500/20 text-slate-400';
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'FULL': return 'bg-purple-500/20 text-purple-400';
      case 'INCREMENTAL': return 'bg-cyan-500/20 text-cyan-400';
      case 'WAL': return 'bg-orange-500/20 text-orange-400';
      case 'PITR': return 'bg-pink-500/20 text-pink-400';
      default: return 'bg-slate-500/20 text-slate-400';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push(`/clusters/${clusterId}`)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Archive className="w-6 h-6 text-purple-500" />
              Backup & Recovery
            </h1>
            <p className="text-slate-400">Cluster: {cluster?.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={fetchBackups}>
            <RefreshCw className="w-4 h-4 mr-2" /> Refresh
          </Button>
          <Button onClick={() => setShowNewBackup(true)}>
            <Plus className="w-4 h-4 mr-2" /> New Backup
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-400">Total Backups</p>
                  <p className="text-2xl font-bold">{stats.totalBackups}</p>
                </div>
                <Archive className="w-8 h-8 text-purple-500" />
              </div>
            </CardContent>
          </Card>
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-400">Total Size</p>
                  <p className="text-2xl font-bold">{formatSize(stats.totalSize)}</p>
                </div>
                <HardDrive className="w-8 h-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-400">Successful</p>
                  <p className="text-2xl font-bold text-green-500">{stats.completedBackups}</p>
                </div>
                <CheckCircle className="w-8 h-8 text-green-500" />
              </div>
            </CardContent>
          </Card>
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-400">Failed</p>
                  <p className="text-2xl font-bold text-red-500">{stats.failedBackups}</p>
                </div>
                <XCircle className="w-8 h-8 text-red-500" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Tabs defaultValue="backups" className="space-y-4">
        <TabsList className="bg-slate-800 border border-slate-700">
          <TabsTrigger value="backups">Backup History</TabsTrigger>
          <TabsTrigger value="schedule">Schedule</TabsTrigger>
          <TabsTrigger value="pitr">Point-in-Time Recovery</TabsTrigger>
        </TabsList>

        <TabsContent value="backups" className="space-y-4">
          {backups.length === 0 ? (
            <Card className="bg-slate-800/50 border-slate-700">
              <CardContent className="py-12 text-center">
                <Archive className="w-12 h-12 mx-auto mb-4 text-slate-500" />
                <p className="text-slate-400">No backups found. Create your first backup to get started.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {backups.map((backup) => (
                <motion.div
                  key={backup.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <Card className="bg-slate-800/50 border-slate-700 hover:border-slate-600 transition-colors">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="p-2 bg-slate-700 rounded-lg">
                            {backup.type === 'FULL' ? <Database className="w-5 h-5 text-purple-400" /> :
                             backup.type === 'INCREMENTAL' ? <HardDrive className="w-5 h-5 text-cyan-400" /> :
                             <Archive className="w-5 h-5 text-orange-400" />}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <Badge className={getTypeColor(backup.type)}>{backup.type}</Badge>
                              <Badge className={getStatusColor(backup.status)}>
                                {backup.status === 'IN_PROGRESS' || backup.status === 'VALIDATING' ? (
                                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                ) : backup.status === 'VERIFIED' ? (
                                  <Shield className="w-3 h-3 mr-1" />
                                ) : null}
                                {backup.status}
                              </Badge>
                              {backup.verified && <Badge className="bg-green-500/20 text-green-400"><Shield className="w-3 h-3 mr-1" /> Verified</Badge>}
                            </div>
                            <p className="text-sm text-slate-400 mt-1">
                              Created: {formatDate(backup.createdAt)}
                              {backup.completedAt && ` • Completed: ${formatDate(backup.completedAt)}`}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <p className="font-medium">{formatSize(backup.size)}</p>
                            <p className="text-xs text-slate-400">Retention: {backup.retentionDays} days</p>
                          </div>
                          <div className="flex items-center gap-2">
                            {backup.status === 'COMPLETED' && !backup.verified && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => verifyBackup(backup)}
                                disabled={actionLoading === backup.id}
                              >
                                {actionLoading === backup.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
                              </Button>
                            )}
                            {(backup.status === 'COMPLETED' || backup.status === 'VERIFIED') && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => { setSelectedBackup(backup); setShowRestoreDialog(true); }}
                              >
                                <RotateCcw className="w-4 h-4" />
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-red-400 hover:text-red-300"
                              onClick={() => { setSelectedBackup(backup); setShowDeleteConfirm(true); }}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                      {backup.errorMessage && (
                        <div className="mt-3 p-2 bg-red-500/10 border border-red-500/30 rounded text-sm text-red-400">
                          <AlertTriangle className="w-4 h-4 inline mr-2" />
                          {backup.errorMessage}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="schedule">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="w-5 h-5" /> Backup Schedule
                  </CardTitle>
                  <CardDescription>Configure automated backup schedules</CardDescription>
                </div>
                <Button onClick={() => setShowScheduleEdit(true)}>
                  <Settings className="w-4 h-4 mr-2" /> Edit Schedule
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {schedule && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 bg-slate-700/50 rounded-lg">
                      <div>
                        <p className="font-medium">Automated Backups</p>
                        <p className="text-sm text-slate-400">Schedule status</p>
                      </div>
                      <Badge className={schedule.enabled ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}>
                        {schedule.enabled ? 'Enabled' : 'Disabled'}
                      </Badge>
                    </div>
                    <div className="p-4 bg-slate-700/50 rounded-lg">
                      <p className="font-medium">Full Backup Schedule</p>
                      <p className="text-sm text-slate-400 mt-1">Cron: {schedule.fullBackupCron}</p>
                      <p className="text-sm text-slate-400">Last: {formatDate(schedule.lastFullBackup)}</p>
                    </div>
                    <div className="p-4 bg-slate-700/50 rounded-lg">
                      <p className="font-medium">Incremental Backup Schedule</p>
                      <p className="text-sm text-slate-400 mt-1">Cron: {schedule.incrBackupCron}</p>
                      <p className="text-sm text-slate-400">Last: {formatDate(schedule.lastIncrBackup)}</p>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 bg-slate-700/50 rounded-lg">
                      <div>
                        <p className="font-medium">WAL Archiving</p>
                        <p className="text-sm text-slate-400">Continuous archiving</p>
                      </div>
                      <Badge className={schedule.walArchiving ? 'bg-green-500/20 text-green-400' : 'bg-slate-500/20 text-slate-400'}>
                        {schedule.walArchiving ? 'Active' : 'Disabled'}
                      </Badge>
                    </div>
                    <div className="p-4 bg-slate-700/50 rounded-lg">
                      <p className="font-medium">Retention Policy</p>
                      <p className="text-sm text-slate-400 mt-1">{schedule.retentionDays} days</p>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pitr">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="w-5 h-5" /> Point-in-Time Recovery
              </CardTitle>
              <CardDescription>Restore to any point in time within WAL retention</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="p-4 bg-slate-700/50 rounded-lg">
                  <p className="font-medium mb-2">Recovery Window</p>
                  <p className="text-sm text-slate-400">
                    Based on WAL archiving and backup retention, you can recover to any point within the last {schedule?.retentionDays || 30} days.
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Target Date/Time</Label>
                    <Input
                      type="datetime-local"
                      value={pitrTarget}
                      onChange={(e) => setPitrTarget(e.target.value)}
                      className="mt-1 bg-slate-700 border-slate-600"
                    />
                  </div>
                  <div className="flex items-end">
                    <Button
                      onClick={() => {
                        if (backups.find(b => b.status === 'COMPLETED' || b.status === 'VERIFIED')) {
                          setSelectedBackup(backups.find(b => b.status === 'COMPLETED' || b.status === 'VERIFIED') || null);
                          setShowRestoreDialog(true);
                        }
                      }}
                      disabled={!pitrTarget || !backups.some(b => b.status === 'COMPLETED' || b.status === 'VERIFIED')}
                    >
                      <RotateCcw className="w-4 h-4 mr-2" /> Initiate PITR
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* New Backup Dialog */}
      <Dialog open={showNewBackup} onOpenChange={setShowNewBackup}>
        <DialogContent className="bg-slate-800 border-slate-700">
          <DialogHeader>
            <DialogTitle>Create New Backup</DialogTitle>
            <DialogDescription>Start a new backup for this cluster</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Backup Type</Label>
              <Select value={newBackupType} onValueChange={(v) => setNewBackupType(v as 'FULL' | 'INCREMENTAL' | 'WAL')}>
                <SelectTrigger className="mt-1 bg-slate-700 border-slate-600">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="FULL">Full Backup</SelectItem>
                  <SelectItem value="INCREMENTAL">Incremental Backup</SelectItem>
                  <SelectItem value="WAL">WAL Archive</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-slate-400 mt-1">
                {newBackupType === 'FULL' && 'Complete backup of all data. Recommended for initial and weekly backups.'}
                {newBackupType === 'INCREMENTAL' && 'Backs up only changes since last backup. Faster and smaller.'}
                {newBackupType === 'WAL' && 'Archive Write-Ahead Logs for point-in-time recovery.'}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewBackup(false)}>Cancel</Button>
            <Button onClick={createBackup} disabled={actionLoading === 'create'}>
              {actionLoading === 'create' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
              Start Backup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Schedule Edit Dialog */}
      <Dialog open={showScheduleEdit} onOpenChange={setShowScheduleEdit}>
        <DialogContent className="bg-slate-800 border-slate-700">
          <DialogHeader>
            <DialogTitle>Edit Backup Schedule</DialogTitle>
            <DialogDescription>Configure automated backup settings</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label>Enable Scheduled Backups</Label>
                <p className="text-xs text-slate-400">Automatically run backups on schedule</p>
              </div>
              <Switch
                checked={scheduleForm.enabled}
                onCheckedChange={(v) => setScheduleForm({ ...scheduleForm, enabled: v })}
              />
            </div>
            <div>
              <Label>Full Backup Schedule (Cron)</Label>
              <Input
                value={scheduleForm.fullBackupCron}
                onChange={(e) => setScheduleForm({ ...scheduleForm, fullBackupCron: e.target.value })}
                className="mt-1 bg-slate-700 border-slate-600"
                placeholder="0 2 * * 0"
              />
              <p className="text-xs text-slate-400 mt-1">Default: Every Sunday at 2 AM</p>
            </div>
            <div>
              <Label>Incremental Backup Schedule (Cron)</Label>
              <Input
                value={scheduleForm.incrBackupCron}
                onChange={(e) => setScheduleForm({ ...scheduleForm, incrBackupCron: e.target.value })}
                className="mt-1 bg-slate-700 border-slate-600"
                placeholder="0 2 * * 1-6"
              />
              <p className="text-xs text-slate-400 mt-1">Default: Mon-Sat at 2 AM</p>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label>WAL Archiving</Label>
                <p className="text-xs text-slate-400">Enable continuous WAL archiving</p>
              </div>
              <Switch
                checked={scheduleForm.walArchiving}
                onCheckedChange={(v) => setScheduleForm({ ...scheduleForm, walArchiving: v })}
              />
            </div>
            <div>
              <Label>Retention (Days)</Label>
              <Input
                type="number"
                value={scheduleForm.retentionDays}
                onChange={(e) => setScheduleForm({ ...scheduleForm, retentionDays: parseInt(e.target.value) || 30 })}
                className="mt-1 bg-slate-700 border-slate-600"
                min={1}
                max={365}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowScheduleEdit(false)}>Cancel</Button>
            <Button onClick={updateSchedule} disabled={actionLoading === 'schedule'}>
              {actionLoading === 'schedule' && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save Schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Restore Dialog */}
      <Dialog open={showRestoreDialog} onOpenChange={setShowRestoreDialog}>
        <DialogContent className="bg-slate-800 border-slate-700">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-yellow-400">
              <AlertTriangle className="w-5 h-5" /> Initiate Restore
            </DialogTitle>
            <DialogDescription>This will restore the cluster to the selected backup point</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
              <p className="text-sm text-yellow-400">
                Warning: Restoring will replace current data. This operation cannot be undone.
              </p>
            </div>
            {selectedBackup && (
              <div className="p-4 bg-slate-700/50 rounded-lg">
                <p className="font-medium">Selected Backup</p>
                <p className="text-sm text-slate-400">Type: {selectedBackup.type}</p>
                <p className="text-sm text-slate-400">Created: {formatDate(selectedBackup.createdAt)}</p>
                <p className="text-sm text-slate-400">Size: {formatSize(selectedBackup.size)}</p>
              </div>
            )}
            {pitrTarget && (
              <div className="p-4 bg-slate-700/50 rounded-lg">
                <p className="font-medium">Point-in-Time Target</p>
                <p className="text-sm text-slate-400">{new Date(pitrTarget).toLocaleString()}</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowRestoreDialog(false); setSelectedBackup(null); }}>Cancel</Button>
            <Button variant="destructive" onClick={initiateRestore} disabled={actionLoading === 'restore'}>
              {actionLoading === 'restore' && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Confirm Restore
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent className="bg-slate-800 border-slate-700">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Backup?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this backup. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-slate-700 border-slate-600">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={deleteBackup} className="bg-red-600 hover:bg-red-700">
              {actionLoading === 'delete' && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
