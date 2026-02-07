'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  ArrowLeft, Database, Server, Users, Activity, Settings, Play, Pause,
  RefreshCw, Trash2, RotateCcw, Loader2, Zap, Clock, Network,
  BarChart3, Gauge, AlertTriangle, CheckCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
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

interface PoolConfig {
  id: string;
  clusterId: string;
  enabled: boolean;
  poolerType: 'PGBOUNCER' | 'PGPOOL' | 'ODYSSEY';
  poolMode: 'SESSION' | 'TRANSACTION' | 'STATEMENT';
  maxClientConn: number;
  defaultPoolSize: number;
  minPoolSize: number;
  reservePoolSize: number;
  reservePoolTimeout: number;
  maxDbConnections: number;
  serverIdleTimeout: number;
  clientIdleTimeout: number;
  queryTimeout: number;
  serverResetQuery: string;
  serverCheckQuery: string;
}

interface PoolStats {
  totalClients: number;
  activeClients: number;
  waitingClients: number;
  totalServers: number;
  activeServers: number;
  idleServers: number;
  usedServers: number;
  avgQueryTime: string;
  avgWaitTime: string;
  totalQueries: number;
  totalTransactions: number;
  totalReceived: number;
  totalSent: number;
  clientUtilization: string;
  serverUtilization: string;
  databases: Array<{
    name: string;
    host: string;
    port: number;
    database: string;
    currentConnections: number;
    maxConnections: number;
    poolSize: number;
    minPoolSize: number;
    reservePool: number;
  }>;
  users: Array<{
    name: string;
    activeConnections: number;
    waitingConnections: number;
    maxConnections: number;
  }>;
  updatedAt: string;
}

interface Cluster {
  id: string;
  name: string;
}

export default function ConnectionPoolsPage() {
  const params = useParams();
  const router = useRouter();
  const clusterId = params.id as string;

  const [cluster, setCluster] = useState<Cluster | null>(null);
  const [config, setConfig] = useState<PoolConfig | null>(null);
  const [stats, setStats] = useState<PoolStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const [showConfigDialog, setShowConfigDialog] = useState(false);
  const [showKillConfirm, setShowKillConfirm] = useState(false);

  const [configForm, setConfigForm] = useState({
    enabled: true,
    poolerType: 'PGBOUNCER' as 'PGBOUNCER' | 'PGPOOL' | 'ODYSSEY',
    poolMode: 'TRANSACTION' as 'SESSION' | 'TRANSACTION' | 'STATEMENT',
    maxClientConn: 1000,
    defaultPoolSize: 20,
    minPoolSize: 5,
    reservePoolSize: 5,
    reservePoolTimeout: 5,
    maxDbConnections: 100,
    serverIdleTimeout: 600,
    clientIdleTimeout: 0,
    queryTimeout: 0,
    serverResetQuery: 'DISCARD ALL',
    serverCheckQuery: 'SELECT 1',
  });

  useEffect(() => {
    fetchCluster();
    fetchPoolData();
    const interval = setInterval(fetchPoolData, 5000);
    return () => clearInterval(interval);
  }, [clusterId]);

  useEffect(() => {
    if (config) {
      setConfigForm({
        enabled: config.enabled,
        poolerType: config.poolerType,
        poolMode: config.poolMode,
        maxClientConn: config.maxClientConn,
        defaultPoolSize: config.defaultPoolSize,
        minPoolSize: config.minPoolSize,
        reservePoolSize: config.reservePoolSize,
        reservePoolTimeout: config.reservePoolTimeout,
        maxDbConnections: config.maxDbConnections,
        serverIdleTimeout: config.serverIdleTimeout,
        clientIdleTimeout: config.clientIdleTimeout,
        queryTimeout: config.queryTimeout,
        serverResetQuery: config.serverResetQuery,
        serverCheckQuery: config.serverCheckQuery,
      });
    }
  }, [config]);

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

  const fetchPoolData = async () => {
    try {
      const res = await fetch(`/api/connection-pools?clusterId=${clusterId}`);
      if (res.ok) {
        const data = await res.json();
        setConfig(data.config);
        setStats(data.stats);
      }
    } catch (error) {
      console.error('Failed to fetch pool data:', error);
    } finally {
      setLoading(false);
    }
  };

  const performAction = async (action: string) => {
    setActionLoading(action);
    try {
      await fetch('/api/connection-pools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clusterId, action }),
      });
      fetchPoolData();
    } catch (error) {
      console.error(`Failed to ${action}:`, error);
    } finally {
      setActionLoading(null);
      if (action === 'kill_connections') {
        setShowKillConfirm(false);
      }
    }
  };

  const saveConfig = async () => {
    setActionLoading('save');
    try {
      await fetch('/api/connection-pools', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clusterId, ...configForm }),
      });
      setShowConfigDialog(false);
      fetchPoolData();
    } catch (error) {
      console.error('Failed to save config:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes >= 1000000000) return `${(bytes / 1000000000).toFixed(2)} GB`;
    if (bytes >= 1000000) return `${(bytes / 1000000).toFixed(2)} MB`;
    if (bytes >= 1000) return `${(bytes / 1000).toFixed(2)} KB`;
    return `${bytes} B`;
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  const clientUtil = parseFloat(stats?.clientUtilization || '0');
  const serverUtil = parseFloat(stats?.serverUtilization || '0');

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
              <Network className="w-6 h-6 text-cyan-500" />
              Connection Pooling
            </h1>
            <p className="text-slate-400">Cluster: {cluster?.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={config?.enabled ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}>
            {config?.enabled ? 'Pool Active' : 'Pool Paused'}
          </Badge>
          <Badge className="bg-purple-500/20 text-purple-400">{config?.poolerType}</Badge>
          <Badge className="bg-blue-500/20 text-blue-400">{config?.poolMode}</Badge>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="flex items-center gap-2">
        {config?.enabled ? (
          <Button variant="outline" onClick={() => performAction('pause')} disabled={actionLoading === 'pause'}>
            {actionLoading === 'pause' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Pause className="w-4 h-4 mr-2" />}
            Pause Pool
          </Button>
        ) : (
          <Button onClick={() => performAction('resume')} disabled={actionLoading === 'resume'}>
            {actionLoading === 'resume' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
            Resume Pool
          </Button>
        )}
        <Button variant="outline" onClick={() => performAction('reload')} disabled={actionLoading === 'reload'}>
          {actionLoading === 'reload' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
          Reload Config
        </Button>
        <Button variant="outline" onClick={() => performAction('reset')} disabled={actionLoading === 'reset'}>
          {actionLoading === 'reset' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RotateCcw className="w-4 h-4 mr-2" />}
          Reset Stats
        </Button>
        <Button variant="outline" className="text-red-400 hover:text-red-300" onClick={() => setShowKillConfirm(true)}>
          <Trash2 className="w-4 h-4 mr-2" /> Kill Idle Connections
        </Button>
        <div className="flex-1" />
        <Button onClick={() => setShowConfigDialog(true)}>
          <Settings className="w-4 h-4 mr-2" /> Configure
        </Button>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-slate-400">Client Connections</p>
              <Users className="w-5 h-5 text-blue-500" />
            </div>
            <p className="text-2xl font-bold">{stats?.activeClients || 0} <span className="text-sm text-slate-400">/ {config?.maxClientConn}</span></p>
            <Progress value={clientUtil} className="mt-2 h-2" />
            <p className="text-xs text-slate-500 mt-1">{stats?.clientUtilization}% utilized</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-slate-400">Server Connections</p>
              <Server className="w-5 h-5 text-green-500" />
            </div>
            <p className="text-2xl font-bold">{stats?.activeServers || 0} <span className="text-sm text-slate-400">/ {config?.defaultPoolSize}</span></p>
            <Progress value={serverUtil} className="mt-2 h-2" />
            <p className="text-xs text-slate-500 mt-1">{stats?.serverUtilization}% utilized</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-slate-400">Avg Query Time</p>
              <Clock className="w-5 h-5 text-yellow-500" />
            </div>
            <p className="text-2xl font-bold">{stats?.avgQueryTime || '0'} <span className="text-sm text-slate-400">ms</span></p>
            <p className="text-xs text-slate-500 mt-3">Avg wait: {stats?.avgWaitTime || '0'}ms</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-slate-400">Waiting Clients</p>
              <Activity className="w-5 h-5 text-orange-500" />
            </div>
            <p className="text-2xl font-bold">{stats?.waitingClients || 0}</p>
            <p className="text-xs text-slate-500 mt-3">
              {(stats?.waitingClients || 0) > 0 ? (
                <span className="text-yellow-400"><AlertTriangle className="w-3 h-3 inline mr-1" />Clients waiting</span>
              ) : (
                <span className="text-green-400"><CheckCircle className="w-3 h-3 inline mr-1" />No queue</span>
              )}
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="bg-slate-800 border border-slate-700">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="databases">Databases</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="config">Configuration</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Traffic Stats */}
            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="w-5 h-5" /> Traffic Statistics
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 bg-slate-700/50 rounded-lg">
                    <span className="text-slate-400">Total Queries</span>
                    <span className="font-mono font-medium">{formatNumber(stats?.totalQueries || 0)}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-slate-700/50 rounded-lg">
                    <span className="text-slate-400">Total Transactions</span>
                    <span className="font-mono font-medium">{formatNumber(stats?.totalTransactions || 0)}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-slate-700/50 rounded-lg">
                    <span className="text-slate-400">Data Received</span>
                    <span className="font-mono font-medium">{formatBytes(stats?.totalReceived || 0)}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-slate-700/50 rounded-lg">
                    <span className="text-slate-400">Data Sent</span>
                    <span className="font-mono font-medium">{formatBytes(stats?.totalSent || 0)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Connection Breakdown */}
            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Gauge className="w-5 h-5" /> Connection Breakdown
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-slate-400">Active Clients</span>
                      <span>{stats?.activeClients || 0}</span>
                    </div>
                    <Progress value={(stats?.activeClients || 0) / (config?.maxClientConn || 1) * 100} className="h-2" />
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-slate-400">Idle Servers</span>
                      <span>{stats?.idleServers || 0}</span>
                    </div>
                    <Progress value={(stats?.idleServers || 0) / (config?.defaultPoolSize || 1) * 100} className="h-2 bg-slate-700 [&>div]:bg-green-500" />
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-slate-400">Used Servers</span>
                      <span>{stats?.usedServers || 0}</span>
                    </div>
                    <Progress value={(stats?.usedServers || 0) / (config?.defaultPoolSize || 1) * 100} className="h-2 bg-slate-700 [&>div]:bg-blue-500" />
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-slate-400">Waiting Clients</span>
                      <span>{stats?.waitingClients || 0}</span>
                    </div>
                    <Progress value={(stats?.waitingClients || 0) / 50 * 100} className="h-2 bg-slate-700 [&>div]:bg-orange-500" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="databases">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="w-5 h-5" /> Database Pools
              </CardTitle>
              <CardDescription>Connection pools per database</CardDescription>
            </CardHeader>
            <CardContent>
              {stats?.databases && stats.databases.length > 0 ? (
                <div className="space-y-3">
                  {stats.databases.map((db, index) => (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.1 }}
                      className="p-4 bg-slate-700/50 rounded-lg"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                          <Database className="w-5 h-5 text-cyan-400" />
                          <div>
                            <p className="font-medium">{db.name}</p>
                            <p className="text-xs text-slate-400">{db.host}:{db.port}/{db.database}</p>
                          </div>
                        </div>
                        <Badge className={db.currentConnections > db.poolSize * 0.8 ? 'bg-yellow-500/20 text-yellow-400' : 'bg-green-500/20 text-green-400'}>
                          {db.currentConnections} / {db.maxConnections}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-4 gap-4 text-sm">
                        <div>
                          <p className="text-slate-400">Pool Size</p>
                          <p className="font-medium">{db.poolSize}</p>
                        </div>
                        <div>
                          <p className="text-slate-400">Min Pool</p>
                          <p className="font-medium">{db.minPoolSize}</p>
                        </div>
                        <div>
                          <p className="text-slate-400">Reserve</p>
                          <p className="font-medium">{db.reservePool}</p>
                        </div>
                        <div>
                          <p className="text-slate-400">Utilization</p>
                          <p className="font-medium">{Math.round(db.currentConnections / db.poolSize * 100)}%</p>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-slate-400 py-8">No database pools available</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="users">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5" /> User Connections
              </CardTitle>
              <CardDescription>Connection usage per database user</CardDescription>
            </CardHeader>
            <CardContent>
              {stats?.users && stats.users.length > 0 ? (
                <div className="space-y-3">
                  {stats.users.map((user, index) => (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.1 }}
                      className="p-4 bg-slate-700/50 rounded-lg"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                          <Users className="w-5 h-5 text-blue-400" />
                          <p className="font-medium">{user.name}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {user.waitingConnections > 0 && (
                            <Badge className="bg-orange-500/20 text-orange-400">
                              {user.waitingConnections} waiting
                            </Badge>
                          )}
                          <Badge className="bg-blue-500/20 text-blue-400">
                            {user.activeConnections} active
                          </Badge>
                        </div>
                      </div>
                      <div className="mt-2">
                        <div className="flex justify-between text-xs text-slate-400 mb-1">
                          <span>Connection usage</span>
                          <span>{user.activeConnections} / {user.maxConnections}</span>
                        </div>
                        <Progress value={user.activeConnections / user.maxConnections * 100} className="h-2" />
                      </div>
                    </motion.div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-slate-400 py-8">No user connections available</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="config">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Settings className="w-5 h-5" /> Current Configuration
                  </CardTitle>
                  <CardDescription>Active pool settings</CardDescription>
                </div>
                <Button onClick={() => setShowConfigDialog(true)}>
                  <Settings className="w-4 h-4 mr-2" /> Edit
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {config && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <h3 className="font-medium text-slate-300">Connection Limits</h3>
                    <div className="space-y-2">
                      <div className="flex justify-between p-2 bg-slate-700/30 rounded">
                        <span className="text-slate-400">Max Client Connections</span>
                        <span className="font-mono">{config.maxClientConn}</span>
                      </div>
                      <div className="flex justify-between p-2 bg-slate-700/30 rounded">
                        <span className="text-slate-400">Default Pool Size</span>
                        <span className="font-mono">{config.defaultPoolSize}</span>
                      </div>
                      <div className="flex justify-between p-2 bg-slate-700/30 rounded">
                        <span className="text-slate-400">Min Pool Size</span>
                        <span className="font-mono">{config.minPoolSize}</span>
                      </div>
                      <div className="flex justify-between p-2 bg-slate-700/30 rounded">
                        <span className="text-slate-400">Reserve Pool Size</span>
                        <span className="font-mono">{config.reservePoolSize}</span>
                      </div>
                      <div className="flex justify-between p-2 bg-slate-700/30 rounded">
                        <span className="text-slate-400">Max DB Connections</span>
                        <span className="font-mono">{config.maxDbConnections}</span>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <h3 className="font-medium text-slate-300">Timeouts</h3>
                    <div className="space-y-2">
                      <div className="flex justify-between p-2 bg-slate-700/30 rounded">
                        <span className="text-slate-400">Server Idle Timeout</span>
                        <span className="font-mono">{config.serverIdleTimeout}s</span>
                      </div>
                      <div className="flex justify-between p-2 bg-slate-700/30 rounded">
                        <span className="text-slate-400">Client Idle Timeout</span>
                        <span className="font-mono">{config.clientIdleTimeout || 'Disabled'}</span>
                      </div>
                      <div className="flex justify-between p-2 bg-slate-700/30 rounded">
                        <span className="text-slate-400">Query Timeout</span>
                        <span className="font-mono">{config.queryTimeout || 'Disabled'}</span>
                      </div>
                      <div className="flex justify-between p-2 bg-slate-700/30 rounded">
                        <span className="text-slate-400">Reserve Pool Timeout</span>
                        <span className="font-mono">{config.reservePoolTimeout}s</span>
                      </div>
                    </div>
                  </div>
                  <div className="md:col-span-2 space-y-4">
                    <h3 className="font-medium text-slate-300">Server Queries</h3>
                    <div className="space-y-2">
                      <div className="p-2 bg-slate-700/30 rounded">
                        <span className="text-slate-400 text-sm">Reset Query</span>
                        <p className="font-mono text-sm mt-1">{config.serverResetQuery}</p>
                      </div>
                      <div className="p-2 bg-slate-700/30 rounded">
                        <span className="text-slate-400 text-sm">Check Query</span>
                        <p className="font-mono text-sm mt-1">{config.serverCheckQuery}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Configuration Dialog */}
      <Dialog open={showConfigDialog} onOpenChange={setShowConfigDialog}>
        <DialogContent className="bg-slate-800 border-slate-700 max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Configure Connection Pool</DialogTitle>
            <DialogDescription>Adjust pool settings for optimal performance</DialogDescription>
          </DialogHeader>
          <div className="space-y-6">
            {/* Pool Type & Mode */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Pooler Type</Label>
                <Select value={configForm.poolerType} onValueChange={(v) => setConfigForm({ ...configForm, poolerType: v as 'PGBOUNCER' | 'PGPOOL' | 'ODYSSEY' })}>
                  <SelectTrigger className="mt-1 bg-slate-700 border-slate-600">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    <SelectItem value="PGBOUNCER">PgBouncer</SelectItem>
                    <SelectItem value="PGPOOL">PgPool-II</SelectItem>
                    <SelectItem value="ODYSSEY">Odyssey</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Pool Mode</Label>
                <Select value={configForm.poolMode} onValueChange={(v) => setConfigForm({ ...configForm, poolMode: v as 'SESSION' | 'TRANSACTION' | 'STATEMENT' })}>
                  <SelectTrigger className="mt-1 bg-slate-700 border-slate-600">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    <SelectItem value="SESSION">Session</SelectItem>
                    <SelectItem value="TRANSACTION">Transaction</SelectItem>
                    <SelectItem value="STATEMENT">Statement</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-slate-400 mt-1">
                  {configForm.poolMode === 'SESSION' && 'Client stays connected to same server'}
                  {configForm.poolMode === 'TRANSACTION' && 'Server returned after each transaction'}
                  {configForm.poolMode === 'STATEMENT' && 'Server returned after each statement'}
                </p>
              </div>
            </div>

            {/* Connection Limits */}
            <div className="space-y-4">
              <h3 className="font-medium">Connection Limits</h3>
              <div>
                <div className="flex justify-between">
                  <Label>Max Client Connections</Label>
                  <span className="text-sm text-slate-400">{configForm.maxClientConn}</span>
                </div>
                <Slider
                  value={[configForm.maxClientConn]}
                  onValueChange={([v]) => setConfigForm({ ...configForm, maxClientConn: v })}
                  min={100}
                  max={10000}
                  step={100}
                  className="mt-2"
                />
              </div>
              <div>
                <div className="flex justify-between">
                  <Label>Default Pool Size</Label>
                  <span className="text-sm text-slate-400">{configForm.defaultPoolSize}</span>
                </div>
                <Slider
                  value={[configForm.defaultPoolSize]}
                  onValueChange={([v]) => setConfigForm({ ...configForm, defaultPoolSize: v })}
                  min={5}
                  max={200}
                  step={5}
                  className="mt-2"
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>Min Pool Size</Label>
                  <Input
                    type="number"
                    value={configForm.minPoolSize}
                    onChange={(e) => setConfigForm({ ...configForm, minPoolSize: parseInt(e.target.value) || 0 })}
                    className="mt-1 bg-slate-700 border-slate-600"
                  />
                </div>
                <div>
                  <Label>Reserve Pool Size</Label>
                  <Input
                    type="number"
                    value={configForm.reservePoolSize}
                    onChange={(e) => setConfigForm({ ...configForm, reservePoolSize: parseInt(e.target.value) || 0 })}
                    className="mt-1 bg-slate-700 border-slate-600"
                  />
                </div>
                <div>
                  <Label>Max DB Connections</Label>
                  <Input
                    type="number"
                    value={configForm.maxDbConnections}
                    onChange={(e) => setConfigForm({ ...configForm, maxDbConnections: parseInt(e.target.value) || 0 })}
                    className="mt-1 bg-slate-700 border-slate-600"
                  />
                </div>
              </div>
            </div>

            {/* Timeouts */}
            <div className="space-y-4">
              <h3 className="font-medium">Timeouts (seconds)</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Server Idle Timeout</Label>
                  <Input
                    type="number"
                    value={configForm.serverIdleTimeout}
                    onChange={(e) => setConfigForm({ ...configForm, serverIdleTimeout: parseInt(e.target.value) || 0 })}
                    className="mt-1 bg-slate-700 border-slate-600"
                  />
                </div>
                <div>
                  <Label>Client Idle Timeout (0 = disabled)</Label>
                  <Input
                    type="number"
                    value={configForm.clientIdleTimeout}
                    onChange={(e) => setConfigForm({ ...configForm, clientIdleTimeout: parseInt(e.target.value) || 0 })}
                    className="mt-1 bg-slate-700 border-slate-600"
                  />
                </div>
                <div>
                  <Label>Query Timeout (0 = disabled)</Label>
                  <Input
                    type="number"
                    value={configForm.queryTimeout}
                    onChange={(e) => setConfigForm({ ...configForm, queryTimeout: parseInt(e.target.value) || 0 })}
                    className="mt-1 bg-slate-700 border-slate-600"
                  />
                </div>
                <div>
                  <Label>Reserve Pool Timeout</Label>
                  <Input
                    type="number"
                    value={configForm.reservePoolTimeout}
                    onChange={(e) => setConfigForm({ ...configForm, reservePoolTimeout: parseInt(e.target.value) || 0 })}
                    className="mt-1 bg-slate-700 border-slate-600"
                  />
                </div>
              </div>
            </div>

            {/* Server Queries */}
            <div className="space-y-4">
              <h3 className="font-medium">Server Queries</h3>
              <div>
                <Label>Server Reset Query</Label>
                <Input
                  value={configForm.serverResetQuery}
                  onChange={(e) => setConfigForm({ ...configForm, serverResetQuery: e.target.value })}
                  className="mt-1 bg-slate-700 border-slate-600 font-mono text-sm"
                />
              </div>
              <div>
                <Label>Server Check Query</Label>
                <Input
                  value={configForm.serverCheckQuery}
                  onChange={(e) => setConfigForm({ ...configForm, serverCheckQuery: e.target.value })}
                  className="mt-1 bg-slate-700 border-slate-600 font-mono text-sm"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfigDialog(false)}>Cancel</Button>
            <Button onClick={saveConfig} disabled={actionLoading === 'save'}>
              {actionLoading === 'save' && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save Configuration
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Kill Connections Confirmation */}
      <AlertDialog open={showKillConfirm} onOpenChange={setShowKillConfirm}>
        <AlertDialogContent className="bg-slate-800 border-slate-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-yellow-400">
              <AlertTriangle className="w-5 h-5" /> Kill Idle Connections?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will terminate all idle server connections. Active connections will not be affected.
              This can help free up resources but may cause brief connection latency.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-slate-700 border-slate-600">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => performAction('kill_connections')} className="bg-red-600 hover:bg-red-700">
              {actionLoading === 'kill_connections' && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Kill Connections
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
