'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  Activity,
  ArrowLeft,
  RefreshCw,
  Server,
  HardDrive,
  TrendingUp,
  Clock,
  Layers,
  CheckCircle2,
  AlertTriangle,
  Play,
  Pause,
  Trash2,
  Plus,
  Wifi,
  WifiOff,
  ArrowRightLeft,
  Shield,
  Settings,
  Wrench,
  Copy,
  UserPlus,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';

interface Node {
  id: string;
  name: string;
  role: 'PRIMARY' | 'REPLICA';
  status: string;
  host: string;
  port: number;
}

interface ReplicationSlot {
  id: string;
  nodeId: string;
  slotName: string;
  slotType: string;
  database: string | null;
  active: boolean;
  restartLsn: string | null;
  confirmedFlushLsn: string | null;
  walStatus: string | null;
  safeWalSize: string;
  retainedWal: string;
}

interface LagData {
  id: string;
  nodeId: string;
  nodeName?: string;
  replayLag: number;
  writeLag: number;
  flushLag: number;
  sentLsn: string;
  replayLsn: string;
  walBytes: string;
  syncState: string;
  syncPriority: number;
}

interface WalActivity {
  currentLsn: string;
  walWrite: string;
  walSend: string;
  archiveCount: number;
  archiveFailed: number;
  lastArchived: string | null;
  lastArchivedAt: string | null;
  lastFailed: string | null;
  lastFailedAt: string | null;
}

interface LagHistoryPoint {
  timestamp: string;
  replayLag: number;
  writeLag: number;
  flushLag: number;
}

interface DiagnosticIssue {
  code: string;
  message: string;
  severity: 'error' | 'warning';
  canAutoFix: boolean;
  fixCommand?: string;
}

interface Diagnostics {
  canCreateSlots: boolean;
  issues: DiagnosticIssue[];
  config: {
    walLevel: string;
    maxReplicationSlots: number;
    maxWalSenders: number;
    currentUser: string;
    hasReplicationPrivilege: boolean;
    isSuperuser: boolean;
    existingSlots: number;
  } | null;
}

export default function ReplicationPage() {
  const params = useParams();
  const router = useRouter();
  const clusterId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [slots, setSlots] = useState<ReplicationSlot[]>([]);
  const [lagData, setLagData] = useState<LagData[]>([]);
  const [walActivity, setWalActivity] = useState<WalActivity | null>(null);
  const [lagHistory, setLagHistory] = useState<LagHistoryPoint[]>([]);
  const [selectedNode, setSelectedNode] = useState<string>('none');
  const [showCreateSlot, setShowCreateSlot] = useState(false);
  const [newSlotName, setNewSlotName] = useState('');
  const [newSlotType, setNewSlotType] = useState<'physical' | 'logical'>('physical');
  const [newSlotDatabase, setNewSlotDatabase] = useState('');
  const [creatingSlot, setCreatingSlot] = useState(false);
  const [slotError, setSlotError] = useState<string | null>(null);
  const [replicationMode, setReplicationMode] = useState<string>('ASYNC');
  
  // Diagnostics state
  const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null);
  const [loadingDiagnostics, setLoadingDiagnostics] = useState(false);
  const [applyingFix, setApplyingFix] = useState<string | null>(null);
  const [fixResult, setFixResult] = useState<{ success: boolean; message: string } | null>(null);
  const [showCreateUserDialog, setShowCreateUserDialog] = useState(false);
  const [newUsername, setNewUsername] = useState('replication_user');
  const [newPassword, setNewPassword] = useState('');

  useEffect(() => {
    fetchData();
  }, [clusterId]);

  useEffect(() => {
    if (selectedNode && selectedNode !== 'none') {
      fetchLagHistory(selectedNode);
    }
  }, [selectedNode]);

  const fetchData = async () => {
    try {
      const res = await fetch(`/api/replication?clusterId=${clusterId}&type=overview`);
      if (res.ok) {
        const data = await res.json();
        setNodes(data.nodes);
        setSlots(data.slots);
        setLagData(data.lag);
        setWalActivity(data.walActivity);
        setReplicationMode(data.cluster?.replicationMode || 'ASYNC');
        if (data.lag.length > 0 && selectedNode === 'none') {
          setSelectedNode(data.lag[0].nodeId);
        }
      }
    } catch (error) {
      console.error('Error fetching replication data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchLagHistory = async (nodeId: string) => {
    try {
      const res = await fetch(`/api/replication?clusterId=${clusterId}&type=lag_history&nodeId=${nodeId}&hours=24`);
      if (res.ok) {
        const data = await res.json();
        setLagHistory(data);
      }
    } catch (error) {
      console.error('Error fetching lag history:', error);
    }
  };

  const refreshMetrics = async () => {
    setRefreshing(true);
    try {
      await fetch('/api/replication', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clusterId, action: 'record_metrics' }),
      });
      await fetchData();
    } catch (error) {
      console.error('Error refreshing metrics:', error);
    } finally {
      setRefreshing(false);
    }
  };

  const createSlot = async () => {
    if (!newSlotName) {
      setSlotError('Slot name is required');
      return;
    }
    
    // Validate slot name format
    if (!/^[a-z_][a-z0-9_]*$/.test(newSlotName)) {
      setSlotError('Slot name must start with a letter or underscore and contain only lowercase letters, numbers, and underscores');
      return;
    }
    
    if (newSlotType === 'logical' && !newSlotDatabase) {
      setSlotError('Database is required for logical replication slots');
      return;
    }

    setCreatingSlot(true);
    setSlotError(null);
    
    try {
      const res = await fetch('/api/replication', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clusterId,
          action: 'create_slot',
          nodeId: selectedNode !== 'none' ? selectedNode : undefined,
          slotName: newSlotName,
          slotType: newSlotType,
          database: newSlotType === 'logical' ? newSlotDatabase : undefined,
          outputPlugin: newSlotType === 'logical' ? 'pgoutput' : undefined,
        }),
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        setSlotError(data.details || data.error || 'Failed to create replication slot');
        return;
      }
      
      setShowCreateSlot(false);
      setNewSlotName('');
      setNewSlotType('physical');
      setNewSlotDatabase('');
      setSlotError(null);
      fetchData();
    } catch (error) {
      console.error('Error creating slot:', error);
      setSlotError((error as Error).message || 'Network error occurred');
    } finally {
      setCreatingSlot(false);
    }
  };

  const [droppingSlot, setDroppingSlot] = useState<string | null>(null);
  const [dropSlotError, setDropSlotError] = useState<string | null>(null);
  
  const dropSlot = async (slotName: string) => {
    if (!confirm(`Are you sure you want to drop the replication slot "${slotName}"? This action cannot be undone.`)) {
      return;
    }
    
    setDroppingSlot(slotName);
    setDropSlotError(null);
    
    try {
      const res = await fetch('/api/replication', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clusterId, action: 'drop_slot', slotName }),
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        setDropSlotError(data.details || data.error || 'Failed to drop replication slot');
        return;
      }
      
      fetchData();
    } catch (error) {
      console.error('Error dropping slot:', error);
      setDropSlotError((error as Error).message || 'Network error occurred');
    } finally {
      setDroppingSlot(null);
    }
  };

  // Diagnostic functions
  const fetchDiagnostics = async () => {
    setLoadingDiagnostics(true);
    setFixResult(null);
    try {
      const res = await fetch(`/api/replication?clusterId=${clusterId}&type=diagnostics`);
      const data = await res.json();
      setDiagnostics(data);
    } catch (error) {
      console.error('Error fetching diagnostics:', error);
    } finally {
      setLoadingDiagnostics(false);
    }
  };

  const applyFix = async (issueCode: string) => {
    setApplyingFix(issueCode);
    setFixResult(null);
    
    try {
      let action = '';
      let body: Record<string, unknown> = { clusterId };
      
      switch (issueCode) {
        case 'NO_REPLICATION_PRIVILEGE':
          action = 'grant_replication';
          break;
        case 'WAL_LEVEL_MINIMAL':
          action = 'apply_config';
          body.walLevel = 'replica';
          break;
        case 'NO_REPLICATION_SLOTS':
        case 'SLOTS_EXHAUSTED':
          action = 'apply_config';
          body.maxReplicationSlots = 10;
          break;
        case 'NO_WAL_SENDERS':
          action = 'apply_config';
          body.maxWalSenders = 10;
          break;
        default:
          setFixResult({ success: false, message: 'Unknown issue type' });
          return;
      }
      
      body.action = action;
      
      const res = await fetch('/api/replication', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        setFixResult({ success: false, message: data.details || data.error || 'Failed to apply fix' });
        return;
      }
      
      setFixResult({ 
        success: true, 
        message: data.message || (data.requiresRestart 
          ? 'Configuration applied. Please restart PostgreSQL for changes to take effect.'
          : 'Fix applied successfully!')
      });
      
      // Refresh diagnostics
      await fetchDiagnostics();
    } catch (error) {
      setFixResult({ success: false, message: (error as Error).message });
    } finally {
      setApplyingFix(null);
    }
  };

  const createReplicationUser = async () => {
    if (!newUsername || !newPassword) return;
    
    setApplyingFix('CREATE_USER');
    setFixResult(null);
    
    try {
      const res = await fetch('/api/replication', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clusterId,
          action: 'create_replication_user',
          username: newUsername,
          password: newPassword,
        }),
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        setFixResult({ success: false, message: data.details || data.error || 'Failed to create user' });
        return;
      }
      
      setFixResult({ 
        success: true, 
        message: `User "${newUsername}" created with REPLICATION privilege. Update your node's connection string to use this user.`
      });
      setShowCreateUserDialog(false);
      setNewPassword('');
      
      // Refresh diagnostics
      await fetchDiagnostics();
    } catch (error) {
      setFixResult({ success: false, message: (error as Error).message });
    } finally {
      setApplyingFix(null);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const formatBytes = (bytes: string | number) => {
    const num = typeof bytes === 'string' ? parseInt(bytes) : bytes;
    if (num >= 1073741824) return `${(num / 1073741824).toFixed(2)} GB`;
    if (num >= 1048576) return `${(num / 1048576).toFixed(2)} MB`;
    if (num >= 1024) return `${(num / 1024).toFixed(2)} KB`;
    return `${num} B`;
  };

  const formatLag = (seconds: number) => {
    if (seconds < 0.001) return '<1ms';
    if (seconds < 1) return `${(seconds * 1000).toFixed(0)}ms`;
    if (seconds < 60) return `${seconds.toFixed(1)}s`;
    return `${(seconds / 60).toFixed(1)}m`;
  };

  const getLagColor = (lag: number) => {
    if (lag < 0.1) return 'text-green-400';
    if (lag < 1) return 'text-yellow-400';
    if (lag < 5) return 'text-orange-400';
    return 'text-red-400';
  };

  const primaryNode = nodes.find(n => n.role === 'PRIMARY');
  const replicaNodes = nodes.filter(n => n.role === 'REPLICA');
  const maxLag = Math.max(...lagData.map(l => l.replayLag), 0);
  const avgLag = lagData.length > 0 ? lagData.reduce((acc, l) => acc + l.replayLag, 0) / lagData.length : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <RefreshCw className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.push(`/clusters/${clusterId}`)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Cluster
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <ArrowRightLeft className="h-6 w-6 text-cyan-400" />
              Replication Health
            </h1>
            <p className="text-slate-400">Monitor WAL, replication lag, and slot status</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={replicationMode === 'SYNC' ? 'bg-green-500/20 text-green-400' : 'bg-blue-500/20 text-blue-400'}>
            {replicationMode} Replication
          </Badge>
          <Button onClick={refreshMetrics} disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-400 text-sm">Primary Node</p>
                <p className="text-xl font-bold text-white">{primaryNode?.name || 'N/A'}</p>
                <p className="text-xs text-slate-500">{primaryNode?.host}:{primaryNode?.port}</p>
              </div>
              <Server className="h-8 w-8 text-green-400" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-400 text-sm">Replicas</p>
                <p className="text-2xl font-bold text-blue-400">{replicaNodes.length}</p>
                <p className="text-xs text-slate-500">{lagData.filter(l => l.syncState === 'sync').length} synchronous</p>
              </div>
              <Layers className="h-8 w-8 text-blue-400" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-400 text-sm">Max Lag</p>
                <p className={`text-2xl font-bold ${getLagColor(maxLag)}`}>{formatLag(maxLag)}</p>
              </div>
              <Clock className="h-8 w-8 text-yellow-400" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-400 text-sm">Active Slots</p>
                <p className="text-2xl font-bold text-purple-400">
                  {slots.filter(s => s.active).length}/{slots.length}
                </p>
              </div>
              <HardDrive className="h-8 w-8 text-purple-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="lag" className="space-y-4">
        <TabsList className="bg-slate-800">
          <TabsTrigger value="lag" className="data-[state=active]:bg-slate-700">
            <Activity className="h-4 w-4 mr-2" />Replication Lag
          </TabsTrigger>
          <TabsTrigger value="slots" className="data-[state=active]:bg-slate-700">
            <HardDrive className="h-4 w-4 mr-2" />Replication Slots
          </TabsTrigger>
          <TabsTrigger value="wal" className="data-[state=active]:bg-slate-700">
            <TrendingUp className="h-4 w-4 mr-2" />WAL Activity
          </TabsTrigger>
          <TabsTrigger value="diagnostics" className="data-[state=active]:bg-slate-700" onClick={() => !diagnostics && fetchDiagnostics()}>
            <Shield className="h-4 w-4 mr-2" />Diagnostics
          </TabsTrigger>
        </TabsList>

        <TabsContent value="lag" className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader>
                <CardTitle className="text-white text-lg">Replica Status</CardTitle>
                <CardDescription className="text-slate-400">Current replication state per replica</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {lagData.length === 0 ? (
                  <p className="text-slate-500 text-center py-4">No replicas found</p>
                ) : (
                  lagData.map((lag) => {
                    const node = nodes.find(n => n.id === lag.nodeId);
                    return (
                      <div key={lag.id} className="bg-slate-700/50 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <Server className="h-4 w-4 text-blue-400" />
                            <span className="font-medium text-white">{node?.name || lag.nodeName}</span>
                            <Badge className={lag.syncState === 'sync' ? 'bg-green-500/20 text-green-400' : 'bg-blue-500/20 text-blue-400'}>
                              {lag.syncState}
                            </Badge>
                          </div>
                          <span className={`text-lg font-bold ${getLagColor(lag.replayLag)}`}>
                            {formatLag(lag.replayLag)}
                          </span>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-sm">
                          <div>
                            <p className="text-slate-500">Write Lag</p>
                            <p className={getLagColor(lag.writeLag)}>{formatLag(lag.writeLag)}</p>
                          </div>
                          <div>
                            <p className="text-slate-500">Flush Lag</p>
                            <p className={getLagColor(lag.flushLag)}>{formatLag(lag.flushLag)}</p>
                          </div>
                          <div>
                            <p className="text-slate-500">WAL Behind</p>
                            <p className="text-white">{formatBytes(lag.walBytes)}</p>
                          </div>
                        </div>
                        <div className="mt-2">
                          <p className="text-xs text-slate-500">Replay LSN: {lag.replayLsn}</p>
                        </div>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>

            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-white text-lg">Lag History (24h)</CardTitle>
                    <CardDescription className="text-slate-400">Replication lag over time</CardDescription>
                  </div>
                  <Select value={selectedNode} onValueChange={setSelectedNode}>
                    <SelectTrigger className="w-40 bg-slate-700 border-slate-600">
                      <SelectValue placeholder="Select node" />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700">
                      {lagData.map(l => {
                        const node = nodes.find(n => n.id === l.nodeId);
                        return (
                          <SelectItem key={l.nodeId} value={l.nodeId}>
                            {node?.name || l.nodeName}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent>
                <div className="h-64 flex items-end gap-1">
                  {lagHistory.slice(-48).map((point, idx) => {
                    const maxHistoryLag = Math.max(...lagHistory.map(p => p.replayLag), 1);
                    const height = (point.replayLag / maxHistoryLag) * 100;
                    return (
                      <div
                        key={idx}
                        className="flex-1 bg-cyan-500/60 hover:bg-cyan-400 transition-colors rounded-t"
                        style={{ height: `${Math.max(height, 2)}%` }}
                        title={`${formatLag(point.replayLag)} at ${new Date(point.timestamp).toLocaleTimeString()}`}
                      />
                    );
                  })}
                </div>
                <div className="flex justify-between mt-2 text-xs text-slate-500">
                  <span>24h ago</span>
                  <span>Now</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="slots" className="space-y-4">
          <div className="flex items-center justify-between">
            {dropSlotError && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-400" />
                <p className="text-red-400 text-sm">{dropSlotError}</p>
                <Button variant="ghost" size="sm" onClick={() => setDropSlotError(null)} className="h-6 w-6 p-0 ml-2">
                  ×
                </Button>
              </div>
            )}
            <div className="flex-1" />
            <Button onClick={() => setShowCreateSlot(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Slot
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {slots.length === 0 ? (
              <Card className="bg-slate-800/50 border-slate-700 col-span-2">
                <CardContent className="py-12 text-center">
                  <HardDrive className="h-12 w-12 mx-auto text-slate-600 mb-4" />
                  <p className="text-slate-400">No replication slots configured</p>
                </CardContent>
              </Card>
            ) : (
              slots.map((slot) => (
                <Card key={slot.id} className="bg-slate-800/50 border-slate-700">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          {slot.active ? (
                            <Wifi className="h-4 w-4 text-green-400" />
                          ) : (
                            <WifiOff className="h-4 w-4 text-slate-500" />
                          )}
                          <span className="font-medium text-white">{slot.slotName}</span>
                          <Badge className={slot.active ? 'bg-green-500/20 text-green-400' : 'bg-slate-500/20 text-slate-400'}>
                            {slot.active ? 'Active' : 'Inactive'}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                          <div>
                            <p className="text-slate-500">Type</p>
                            <p className="text-white">{slot.slotType}</p>
                          </div>
                          <div>
                            <p className="text-slate-500">WAL Status</p>
                            <p className="text-white">{slot.walStatus || 'N/A'}</p>
                          </div>
                          <div>
                            <p className="text-slate-500">Restart LSN</p>
                            <p className="text-white font-mono text-xs">{slot.restartLsn || 'N/A'}</p>
                          </div>
                          <div>
                            <p className="text-slate-500">Confirmed LSN</p>
                            <p className="text-white font-mono text-xs">{slot.confirmedFlushLsn || 'N/A'}</p>
                          </div>
                          <div>
                            <p className="text-slate-500">Safe WAL Size</p>
                            <p className="text-white">{formatBytes(slot.safeWalSize)}</p>
                          </div>
                          <div>
                            <p className="text-slate-500">Retained WAL</p>
                            <p className="text-yellow-400">{formatBytes(slot.retainedWal)}</p>
                          </div>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                        onClick={() => dropSlot(slot.slotName)}
                        disabled={droppingSlot === slot.slotName}
                      >
                        {droppingSlot === slot.slotName ? (
                          <RefreshCw className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="wal" className="space-y-4">
          {walActivity ? (
            <div className="grid grid-cols-2 gap-4">
              <Card className="bg-slate-800/50 border-slate-700">
                <CardHeader>
                  <CardTitle className="text-white text-lg">WAL Position</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="bg-slate-700/50 rounded-lg p-4">
                    <p className="text-slate-400 text-sm mb-1">Current LSN</p>
                    <p className="text-2xl font-mono text-cyan-400">{walActivity.currentLsn}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-slate-700/50 rounded-lg p-4">
                      <p className="text-slate-400 text-sm mb-1">WAL Written</p>
                      <p className="text-xl font-bold text-white">{formatBytes(walActivity.walWrite)}</p>
                    </div>
                    <div className="bg-slate-700/50 rounded-lg p-4">
                      <p className="text-slate-400 text-sm mb-1">WAL Sent</p>
                      <p className="text-xl font-bold text-white">{formatBytes(walActivity.walSend)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-slate-800/50 border-slate-700">
                <CardHeader>
                  <CardTitle className="text-white text-lg">WAL Archiving</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-slate-700/50 rounded-lg p-4">
                      <p className="text-slate-400 text-sm mb-1">Archived</p>
                      <p className="text-2xl font-bold text-green-400">{walActivity.archiveCount}</p>
                    </div>
                    <div className="bg-slate-700/50 rounded-lg p-4">
                      <p className="text-slate-400 text-sm mb-1">Failed</p>
                      <p className={`text-2xl font-bold ${walActivity.archiveFailed > 0 ? 'text-red-400' : 'text-slate-400'}`}>
                        {walActivity.archiveFailed}
                      </p>
                    </div>
                  </div>
                  {walActivity.lastArchived && (
                    <div className="bg-slate-700/50 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <CheckCircle2 className="h-4 w-4 text-green-400" />
                        <span className="text-slate-400 text-sm">Last Archived</span>
                      </div>
                      <p className="font-mono text-white">{walActivity.lastArchived}</p>
                      <p className="text-xs text-slate-500">
                        {walActivity.lastArchivedAt ? new Date(walActivity.lastArchivedAt).toLocaleString() : ''}
                      </p>
                    </div>
                  )}
                  {walActivity.archiveFailed > 0 && walActivity.lastFailed && (
                    <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <AlertTriangle className="h-4 w-4 text-red-400" />
                        <span className="text-red-400 text-sm">Last Failed</span>
                      </div>
                      <p className="font-mono text-white">{walActivity.lastFailed}</p>
                      <p className="text-xs text-slate-500">
                        {walActivity.lastFailedAt ? new Date(walActivity.lastFailedAt).toLocaleString() : ''}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          ) : (
            <Card className="bg-slate-800/50 border-slate-700">
              <CardContent className="py-12 text-center">
                <Activity className="h-12 w-12 mx-auto text-slate-600 mb-4" />
                <p className="text-slate-400">No WAL activity data available</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="diagnostics" className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-white">Replication Prerequisites</h3>
              <p className="text-sm text-slate-400">Check if your PostgreSQL server is configured for replication</p>
            </div>
            <Button onClick={fetchDiagnostics} disabled={loadingDiagnostics}>
              {loadingDiagnostics ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Checking...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Run Diagnostics
                </>
              )}
            </Button>
          </div>

          {fixResult && (
            <div className={`rounded-lg p-4 flex items-start gap-3 ${
              fixResult.success 
                ? 'bg-green-500/10 border border-green-500/30' 
                : 'bg-red-500/10 border border-red-500/30'
            }`}>
              {fixResult.success ? (
                <CheckCircle2 className="h-5 w-5 text-green-400 shrink-0 mt-0.5" />
              ) : (
                <XCircle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
              )}
              <p className={fixResult.success ? 'text-green-400' : 'text-red-400'}>{fixResult.message}</p>
            </div>
          )}

          {diagnostics ? (
            <div className="grid grid-cols-2 gap-4">
              {/* Status Card */}
              <Card className="bg-slate-800/50 border-slate-700">
                <CardHeader>
                  <CardTitle className="text-white text-lg flex items-center gap-2">
                    {diagnostics.canCreateSlots ? (
                      <CheckCircle2 className="h-5 w-5 text-green-400" />
                    ) : (
                      <AlertTriangle className="h-5 w-5 text-red-400" />
                    )}
                    Overall Status
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className={`text-2xl font-bold ${diagnostics.canCreateSlots ? 'text-green-400' : 'text-red-400'}`}>
                    {diagnostics.canCreateSlots ? 'Ready for Replication' : 'Configuration Required'}
                  </div>
                  <p className="text-slate-400 mt-2">
                    {diagnostics.issues.filter(i => i.severity === 'error').length} errors, {' '}
                    {diagnostics.issues.filter(i => i.severity === 'warning').length} warnings
                  </p>
                </CardContent>
              </Card>

              {/* Config Card */}
              <Card className="bg-slate-800/50 border-slate-700">
                <CardHeader>
                  <CardTitle className="text-white text-lg flex items-center gap-2">
                    <Settings className="h-5 w-5 text-cyan-400" />
                    Current Configuration
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {diagnostics.config ? (
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-slate-500">User</p>
                        <p className="text-white font-mono">{diagnostics.config.currentUser}</p>
                      </div>
                      <div>
                        <p className="text-slate-500">WAL Level</p>
                        <p className={`font-mono ${diagnostics.config.walLevel === 'minimal' ? 'text-red-400' : 'text-green-400'}`}>
                          {diagnostics.config.walLevel}
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-500">Replication Slots</p>
                        <p className="text-white">{diagnostics.config.existingSlots} / {diagnostics.config.maxReplicationSlots}</p>
                      </div>
                      <div>
                        <p className="text-slate-500">WAL Senders</p>
                        <p className="text-white">{diagnostics.config.maxWalSenders}</p>
                      </div>
                      <div>
                        <p className="text-slate-500">Has Replication</p>
                        <Badge className={diagnostics.config.hasReplicationPrivilege ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}>
                          {diagnostics.config.hasReplicationPrivilege ? 'Yes' : 'No'}
                        </Badge>
                      </div>
                      <div>
                        <p className="text-slate-500">Is Superuser</p>
                        <Badge className={diagnostics.config.isSuperuser ? 'bg-purple-500/20 text-purple-400' : 'bg-slate-500/20 text-slate-400'}>
                          {diagnostics.config.isSuperuser ? 'Yes' : 'No'}
                        </Badge>
                      </div>
                    </div>
                  ) : (
                    <p className="text-slate-400">No configuration data available</p>
                  )}
                </CardContent>
              </Card>

              {/* Issues Card */}
              <Card className="bg-slate-800/50 border-slate-700 col-span-2">
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-white text-lg">Issues & Fixes</CardTitle>
                    <CardDescription className="text-slate-400">
                      Problems detected and available solutions
                    </CardDescription>
                  </div>
                  {!diagnostics.config?.isSuperuser && diagnostics.issues.some(i => i.code === 'NO_REPLICATION_PRIVILEGE') && (
                    <Button variant="outline" onClick={() => setShowCreateUserDialog(true)}>
                      <UserPlus className="h-4 w-4 mr-2" />
                      Create Replication User
                    </Button>
                  )}
                </CardHeader>
                <CardContent className="space-y-3">
                  {diagnostics.issues.length === 0 ? (
                    <div className="text-center py-8">
                      <CheckCircle2 className="h-12 w-12 mx-auto text-green-400 mb-4" />
                      <p className="text-green-400 font-medium">All checks passed!</p>
                      <p className="text-slate-400 text-sm mt-1">Your database is ready for replication</p>
                    </div>
                  ) : (
                    diagnostics.issues.map((issue, idx) => (
                      <div 
                        key={idx} 
                        className={`rounded-lg p-4 ${
                          issue.severity === 'error' 
                            ? 'bg-red-500/10 border border-red-500/30' 
                            : 'bg-yellow-500/10 border border-yellow-500/30'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-start gap-3">
                            {issue.severity === 'error' ? (
                              <XCircle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
                            ) : (
                              <AlertTriangle className="h-5 w-5 text-yellow-400 shrink-0 mt-0.5" />
                            )}
                            <div>
                              <p className={issue.severity === 'error' ? 'text-red-400 font-medium' : 'text-yellow-400 font-medium'}>
                                {issue.message}
                              </p>
                              {issue.fixCommand && (
                                <div className="mt-2 flex items-center gap-2">
                                  <code className="text-xs bg-slate-700 px-2 py-1 rounded font-mono text-slate-300">
                                    {issue.fixCommand}
                                  </code>
                                  <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    className="h-6 w-6 p-0"
                                    onClick={() => copyToClipboard(issue.fixCommand!)}
                                  >
                                    <Copy className="h-3 w-3" />
                                  </Button>
                                </div>
                              )}
                            </div>
                          </div>
                          {diagnostics.config?.isSuperuser && issue.code !== 'NO_REPLICATION_PRIVILEGE' && (
                            <Button
                              size="sm"
                              onClick={() => applyFix(issue.code)}
                              disabled={applyingFix === issue.code}
                            >
                              {applyingFix === issue.code ? (
                                <RefreshCw className="h-4 w-4 animate-spin" />
                              ) : (
                                <>
                                  <Wrench className="h-4 w-4 mr-1" />
                                  Auto-Fix
                                </>
                              )}
                            </Button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </div>
          ) : (
            <Card className="bg-slate-800/50 border-slate-700">
              <CardContent className="py-12 text-center">
                <Shield className="h-12 w-12 mx-auto text-slate-600 mb-4" />
                <p className="text-slate-400">Click &quot;Run Diagnostics&quot; to check replication prerequisites</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Create Replication User Dialog */}
      <Dialog open={showCreateUserDialog} onOpenChange={setShowCreateUserDialog}>
        <DialogContent className="bg-slate-800 border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-white">Create Replication User</DialogTitle>
            <DialogDescription className="text-slate-400">
              Create a dedicated PostgreSQL user with REPLICATION privilege
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-slate-300">Username</Label>
              <Input
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
                placeholder="replication_user"
                className="bg-slate-700 border-slate-600"
              />
            </div>
            <div>
              <Label className="text-slate-300">Password</Label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter a strong password"
                className="bg-slate-700 border-slate-600"
              />
            </div>
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
              <p className="text-blue-400 text-sm">
                <strong>Note:</strong> This requires superuser privileges on the primary database. 
                After creation, update your node&apos;s connection string to use this new user.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateUserDialog(false)}>Cancel</Button>
            <Button onClick={createReplicationUser} disabled={!newUsername || !newPassword || applyingFix === 'CREATE_USER'}>
              {applyingFix === 'CREATE_USER' ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create User'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showCreateSlot} onOpenChange={(open) => {
        setShowCreateSlot(open);
        if (!open) {
          setSlotError(null);
          setNewSlotName('');
          setNewSlotType('physical');
          setNewSlotDatabase('');
        }
      }}>
        <DialogContent className="bg-slate-800 border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-white">Create Replication Slot</DialogTitle>
            <DialogDescription className="text-slate-400">
              Create a replication slot on the primary node for streaming replication
            </DialogDescription>
          </DialogHeader>
          
          {slotError && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 flex items-start gap-2">
              <AlertTriangle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
              <p className="text-red-400 text-sm">{slotError}</p>
            </div>
          )}
          
          <div className="space-y-4">
            <div>
              <Label className="text-slate-300">Slot Type</Label>
              <Select value={newSlotType} onValueChange={(v: 'physical' | 'logical') => setNewSlotType(v)}>
                <SelectTrigger className="bg-slate-700 border-slate-600">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="physical">Physical (Streaming Replication)</SelectItem>
                  <SelectItem value="logical">Logical (Change Data Capture)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-slate-500 mt-1">
                {newSlotType === 'physical' 
                  ? 'Used for streaming replication to standby servers' 
                  : 'Used for logical replication and CDC applications'}
              </p>
            </div>
            
            <div>
              <Label className="text-slate-300">Slot Name</Label>
              <Input
                value={newSlotName}
                onChange={(e) => setNewSlotName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
                placeholder="replica_slot_1"
                className="bg-slate-700 border-slate-600"
              />
              <p className="text-xs text-slate-500 mt-1">
                Lowercase letters, numbers, and underscores only
              </p>
            </div>
            
            {newSlotType === 'logical' && (
              <div>
                <Label className="text-slate-300">Database</Label>
                <Input
                  value={newSlotDatabase}
                  onChange={(e) => setNewSlotDatabase(e.target.value)}
                  placeholder="postgres"
                  className="bg-slate-700 border-slate-600"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Database to replicate (required for logical slots)
                </p>
              </div>
            )}
            
            {replicaNodes.length > 0 && (
              <div>
                <Label className="text-slate-300">Associate with Node (Optional)</Label>
                <Select value={selectedNode} onValueChange={setSelectedNode}>
                  <SelectTrigger className="bg-slate-700 border-slate-600">
                    <SelectValue placeholder="Select replica node" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    <SelectItem value="none">No specific node</SelectItem>
                    {replicaNodes.map(node => (
                      <SelectItem key={node.id} value={node.id}>
                        {node.name} ({node.host}:{node.port})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateSlot(false)} disabled={creatingSlot}>
              Cancel
            </Button>
            <Button onClick={createSlot} disabled={!newSlotName || creatingSlot}>
              {creatingSlot ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Slot'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
