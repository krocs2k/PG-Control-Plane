'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  ArrowLeftRight,
  ArrowLeft,
  Play,
  RotateCcw,
  XCircle,
  CheckCircle,
  Clock,
  AlertTriangle,
  Loader2,
  RefreshCw,
  Server,
  Shield,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
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

interface Node {
  id: string;
  name: string;
  host: string;
  role: 'PRIMARY' | 'REPLICA';
  status: string;
  priority: number;
}

interface FailoverOperation {
  id: string;
  clusterId: string;
  type: string;
  status: string;
  sourceNodeId: string;
  targetNodeId: string;
  reason?: string;
  preChecks?: string;
  steps?: string;
  errorMessage?: string;
  startedAt?: string;
  completedAt?: string;
  rolledBackAt?: string;
  createdAt: string;
}

interface Cluster {
  id: string;
  name: string;
  nodes: Node[];
}

export default function FailoverPage() {
  const params = useParams();
  const router = useRouter();
  const clusterId = params.id as string;

  const [cluster, setCluster] = useState<Cluster | null>(null);
  const [operations, setOperations] = useState<FailoverOperation[]>([]);
  const [loading, setLoading] = useState(true);
  const [executing, setExecuting] = useState(false);
  const [isNewDialogOpen, setIsNewDialogOpen] = useState(false);
  const [selectedOperation, setSelectedOperation] = useState<FailoverOperation | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ action: string; operationId: string } | null>(null);

  const [newFailover, setNewFailover] = useState({
    sourceNodeId: '',
    targetNodeId: '',
    type: 'PLANNED',
    reason: '',
  });

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchOperations, 3000);
    return () => clearInterval(interval);
  }, [clusterId]);

  async function fetchData() {
    setLoading(true);
    try {
      const [clusterRes, opsRes] = await Promise.all([
        fetch(`/api/clusters/${clusterId}`),
        fetch(`/api/failover?clusterId=${clusterId}`),
      ]);
      const clusterData = await clusterRes.json();
      const opsData = await opsRes.json();
      setCluster(clusterData);
      setOperations(opsData || []);

      if (clusterData.nodes) {
        const primary = clusterData.nodes.find((n: Node) => n.role === 'PRIMARY');
        const replicas = clusterData.nodes.filter((n: Node) => n.role === 'REPLICA' && n.status === 'ONLINE');
        if (primary) setNewFailover(prev => ({ ...prev, sourceNodeId: primary.id }));
        if (replicas.length > 0) setNewFailover(prev => ({ ...prev, targetNodeId: replicas[0].id }));
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function fetchOperations() {
    try {
      const res = await fetch(`/api/failover?clusterId=${clusterId}`);
      const data = await res.json();
      setOperations(data || []);
    } catch (error) {
      console.error('Error fetching operations:', error);
    }
  }

  async function initiateFailover() {
    setExecuting(true);
    try {
      const res = await fetch('/api/failover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clusterId, ...newFailover }),
      });
      if (res.ok) {
        setIsNewDialogOpen(false);
        fetchOperations();
      }
    } catch (error) {
      console.error('Error initiating failover:', error);
    } finally {
      setExecuting(false);
    }
  }

  async function executeAction(operationId: string, action: string) {
    setExecuting(true);
    try {
      await fetch('/api/failover', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: operationId, action }),
      });
      fetchOperations();
    } catch (error) {
      console.error('Error executing action:', error);
    } finally {
      setExecuting(false);
      setConfirmAction(null);
    }
  }

  const primary = cluster?.nodes.find(n => n.role === 'PRIMARY');
  const replicas = cluster?.nodes.filter(n => n.role === 'REPLICA') || [];
  const onlineReplicas = replicas.filter(n => n.status === 'ONLINE');

  const statusColors: Record<string, string> = {
    PENDING: 'bg-yellow-500/20 text-yellow-400',
    PRE_CHECK: 'bg-blue-500/20 text-blue-400',
    IN_PROGRESS: 'bg-cyan-500/20 text-cyan-400',
    VALIDATING: 'bg-purple-500/20 text-purple-400',
    COMPLETED: 'bg-green-500/20 text-green-400',
    FAILED: 'bg-red-500/20 text-red-400',
    ROLLED_BACK: 'bg-orange-500/20 text-orange-400',
  };

  const statusIcons: Record<string, any> = {
    PENDING: Clock,
    PRE_CHECK: Shield,
    IN_PROGRESS: Loader2,
    VALIDATING: CheckCircle,
    COMPLETED: CheckCircle,
    FAILED: XCircle,
    ROLLED_BACK: RotateCcw,
  };

  function getNodeName(nodeId: string) {
    return cluster?.nodes.find(n => n.id === nodeId)?.name || nodeId;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={() => router.push(`/clusters/${clusterId}`)}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Cluster
        </Button>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-100">Failover Management</h1>
          <p className="mt-1 text-slate-400">
            {cluster?.name} - Orchestrate primary/replica failovers
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={() => setIsNewDialogOpen(true)} disabled={onlineReplicas.length === 0}>
            <ArrowLeftRight className="h-4 w-4 mr-2" />
            New Failover
          </Button>
          <Button variant="outline" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Current Topology */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Server className="h-5 w-5 text-green-400" />
              Current Primary
            </CardTitle>
          </CardHeader>
          <CardContent>
            {primary ? (
              <div className="p-4 border border-green-500/30 rounded-lg bg-green-500/10">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-slate-200">{primary.name}</p>
                    <p className="text-sm text-slate-400">{primary.host}</p>
                  </div>
                  <Badge className="bg-green-500/20 text-green-400">PRIMARY</Badge>
                </div>
              </div>
            ) : (
              <p className="text-slate-400">No primary node found</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Server className="h-5 w-5 text-blue-400" />
              Available Replicas ({onlineReplicas.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {replicas.length === 0 ? (
              <p className="text-slate-400">No replicas available</p>
            ) : (
              <div className="space-y-2">
                {replicas.map(replica => (
                  <div
                    key={replica.id}
                    className={`p-3 border rounded-lg ${replica.status === 'ONLINE' ? 'border-blue-500/30 bg-blue-500/10' : 'border-slate-700 bg-slate-800/50 opacity-60'}`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-slate-200">{replica.name}</p>
                        <p className="text-sm text-slate-400">Priority: {replica.priority}</p>
                      </div>
                      <Badge className={replica.status === 'ONLINE' ? 'bg-green-500/20 text-green-400' : 'bg-slate-500/20 text-slate-400'}>
                        {replica.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Operations History */}
      <Card>
        <CardHeader>
          <CardTitle>Failover Operations</CardTitle>
          <CardDescription>History of failover operations</CardDescription>
        </CardHeader>
        <CardContent>
          {operations.length === 0 ? (
            <div className="text-center py-12">
              <ArrowLeftRight className="h-12 w-12 text-slate-600 mx-auto mb-3" />
              <p className="text-slate-400">No failover operations yet</p>
            </div>
          ) : (
            <div className="space-y-4">
              {operations.map((op, index) => {
                const StatusIcon = statusIcons[op.status] || Clock;
                const preChecks = op.preChecks ? JSON.parse(op.preChecks) : [];
                const steps = op.steps ? JSON.parse(op.steps) : [];

                return (
                  <motion.div
                    key={op.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="border border-slate-700 rounded-lg overflow-hidden"
                  >
                    <div className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`rounded-lg p-2 ${statusColors[op.status]?.split(' ')[0] || 'bg-slate-700'}`}>
                            <StatusIcon className={`h-5 w-5 ${op.status === 'IN_PROGRESS' ? 'animate-spin' : ''}`} />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-slate-200">
                                {getNodeName(op.sourceNodeId)} → {getNodeName(op.targetNodeId)}
                              </span>
                              <Badge className={statusColors[op.status]}>{op.status}</Badge>
                              <Badge variant="secondary">{op.type}</Badge>
                            </div>
                            <p className="text-sm text-slate-400 mt-1">
                              {new Date(op.createdAt).toLocaleString()}
                              {op.reason && ` • ${op.reason}`}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {op.status === 'PENDING' && (
                            <>
                              <Button
                                size="sm"
                                onClick={() => setConfirmAction({ action: 'execute', operationId: op.id })}
                                disabled={executing}
                              >
                                <Play className="h-4 w-4 mr-1" />
                                Execute
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setConfirmAction({ action: 'cancel', operationId: op.id })}
                              >
                                <XCircle className="h-4 w-4 mr-1" />
                                Cancel
                              </Button>
                            </>
                          )}
                          {(op.status === 'COMPLETED' || op.status === 'FAILED') && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setConfirmAction({ action: 'rollback', operationId: op.id })}
                            >
                              <RotateCcw className="h-4 w-4 mr-1" />
                              Rollback
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setSelectedOperation(selectedOperation?.id === op.id ? null : op)}
                          >
                            {selectedOperation?.id === op.id ? 'Hide' : 'Details'}
                          </Button>
                        </div>
                      </div>

                      {selectedOperation?.id === op.id && (
                        <div className="mt-4 pt-4 border-t border-slate-700">
                          {preChecks.length > 0 && (
                            <div className="mb-4">
                              <h4 className="text-sm font-medium text-slate-300 mb-2">Pre-flight Checks</h4>
                              <div className="space-y-1">
                                {preChecks.map((check: any, i: number) => (
                                  <div key={i} className="flex items-center gap-2 text-sm">
                                    {check.passed ? (
                                      <CheckCircle className="h-4 w-4 text-green-400" />
                                    ) : (
                                      <AlertTriangle className="h-4 w-4 text-yellow-400" />
                                    )}
                                    <span className="text-slate-300">{check.name}:</span>
                                    <span className="text-slate-400">{check.message}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {steps.length > 0 && (
                            <div>
                              <h4 className="text-sm font-medium text-slate-300 mb-2">Execution Steps</h4>
                              <div className="space-y-1 font-mono text-xs">
                                {steps.map((step: string, i: number) => (
                                  <div key={i} className="text-slate-400">{step}</div>
                                ))}
                              </div>
                            </div>
                          )}

                          {op.errorMessage && (
                            <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                              <p className="text-sm text-red-400">{op.errorMessage}</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* New Failover Dialog */}
      <Dialog open={isNewDialogOpen} onOpenChange={setIsNewDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Initiate Failover</DialogTitle>
            <DialogDescription>Configure and initiate a new failover operation</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Failover Type</Label>
              <Select value={newFailover.type} onValueChange={v => setNewFailover({ ...newFailover, type: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PLANNED">Planned Failover</SelectItem>
                  <SelectItem value="EMERGENCY">Emergency Failover</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Source (Current Primary)</Label>
              <Select value={newFailover.sourceNodeId} onValueChange={v => setNewFailover({ ...newFailover, sourceNodeId: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {cluster?.nodes.filter(n => n.role === 'PRIMARY').map(n => (
                    <SelectItem key={n.id} value={n.id}>{n.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Target (New Primary)</Label>
              <Select value={newFailover.targetNodeId} onValueChange={v => setNewFailover({ ...newFailover, targetNodeId: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {onlineReplicas.map(n => (
                    <SelectItem key={n.id} value={n.id}>{n.name} (Priority: {n.priority})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Reason (Optional)</Label>
              <Textarea
                value={newFailover.reason}
                onChange={e => setNewFailover({ ...newFailover, reason: e.target.value })}
                placeholder="Describe the reason for this failover..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsNewDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={initiateFailover}
              disabled={executing || !newFailover.sourceNodeId || !newFailover.targetNodeId}
            >
              {executing && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Initiate Failover
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Action Dialog */}
      <AlertDialog open={!!confirmAction} onOpenChange={() => setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction?.action === 'execute' && 'Execute Failover?'}
              {confirmAction?.action === 'rollback' && 'Rollback Failover?'}
              {confirmAction?.action === 'cancel' && 'Cancel Failover?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction?.action === 'execute' && 'This will start the failover process. Connections will be briefly interrupted.'}
              {confirmAction?.action === 'rollback' && 'This will revert to the previous primary node configuration.'}
              {confirmAction?.action === 'cancel' && 'This will cancel the pending failover operation.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmAction && executeAction(confirmAction.operationId, confirmAction.action)}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
