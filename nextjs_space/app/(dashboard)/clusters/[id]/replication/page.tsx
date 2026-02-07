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
  const [replicationMode, setReplicationMode] = useState<string>('ASYNC');

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
    if (!newSlotName || selectedNode === 'none') return;
    try {
      await fetch('/api/replication', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clusterId,
          action: 'create_slot',
          nodeId: selectedNode,
          slotName: newSlotName,
        }),
      });
      setShowCreateSlot(false);
      setNewSlotName('');
      fetchData();
    } catch (error) {
      console.error('Error creating slot:', error);
    }
  };

  const dropSlot = async (slotName: string) => {
    try {
      await fetch('/api/replication', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clusterId, action: 'drop_slot', slotName }),
      });
      fetchData();
    } catch (error) {
      console.error('Error dropping slot:', error);
    }
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
          <div className="flex justify-end">
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
                      >
                        <Trash2 className="h-4 w-4" />
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
      </Tabs>

      <Dialog open={showCreateSlot} onOpenChange={setShowCreateSlot}>
        <DialogContent className="bg-slate-800 border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-white">Create Replication Slot</DialogTitle>
            <DialogDescription className="text-slate-400">
              Create a new physical replication slot for a replica node
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-slate-300">Slot Name</Label>
              <Input
                value={newSlotName}
                onChange={(e) => setNewSlotName(e.target.value)}
                placeholder="replica_slot_name"
                className="bg-slate-700 border-slate-600"
              />
            </div>
            <div>
              <Label className="text-slate-300">Target Node</Label>
              <Select value={selectedNode} onValueChange={setSelectedNode}>
                <SelectTrigger className="bg-slate-700 border-slate-600">
                  <SelectValue placeholder="Select replica node" />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  {replicaNodes.map(node => (
                    <SelectItem key={node.id} value={node.id}>
                      {node.name} ({node.host}:{node.port})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateSlot(false)}>Cancel</Button>
            <Button onClick={createSlot} disabled={!newSlotName || selectedNode === 'none'}>
              Create Slot
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
