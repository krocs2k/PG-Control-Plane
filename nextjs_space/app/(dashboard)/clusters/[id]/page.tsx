'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Database,
  Server,
  ArrowLeft,
  Activity,
  Loader2,
  Trash2,
  Clock,
  Cpu,
  HardDrive,
  Network,
  Plus,
  Pencil,
  Settings,
  ArrowLeftRight,
  GitBranch,
  Power,
  PowerOff,
  Wrench,
  AlertTriangle,
  MoreVertical,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/status-badge';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface Node {
  id: string;
  name: string;
  host: string;
  port: number;
  role: string;
  status: string;
  createdAt: string;
}

interface ClusterDetail {
  id: string;
  name: string;
  status: string;
  replicationMode: string;
  topology: string;
  createdAt: string;
  nodes: Node[];
  project?: { name: string; environment: string; organization?: { name: string } };
}

export default function ClusterDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [cluster, setCluster] = useState<ClusterDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleteNodeId, setDeleteNodeId] = useState<string | null>(null);

  // Cluster edit state
  const [isEditClusterOpen, setIsEditClusterOpen] = useState(false);
  const [clusterForm, setClusterForm] = useState({
    name: '',
    status: '',
    replicationMode: '',
    topology: '',
  });
  const [savingCluster, setSavingCluster] = useState(false);

  // Node dialog state
  const [isNodeDialogOpen, setIsNodeDialogOpen] = useState(false);
  const [editingNode, setEditingNode] = useState<Node | null>(null);
  const [nodeForm, setNodeForm] = useState({
    name: '',
    host: '',
    port: '',
    role: 'REPLICA',
    status: 'OFFLINE',
  });
  const [savingNode, setSavingNode] = useState(false);
  const [lifecycleLoading, setLifecycleLoading] = useState<string | null>(null);

  const clusterId = params?.id as string;

  useEffect(() => {
    async function fetchCluster() {
      try {
        const res = await fetch(`/api/clusters/${clusterId}`);
        if (!res.ok) {
          router.push('/clusters');
          return;
        }
        const data = await res.json();
        setCluster(data);
      } catch (error) {
        console.error('Error fetching cluster:', error);
      } finally {
        setLoading(false);
      }
    }

    if (clusterId) {
      fetchCluster();
    }
  }, [clusterId, router]);

  // Cluster edit handlers
  function openEditCluster() {
    if (!cluster) return;
    setClusterForm({
      name: cluster.name,
      status: cluster.status,
      replicationMode: cluster.replicationMode,
      topology: cluster.topology,
    });
    setIsEditClusterOpen(true);
  }

  async function handleUpdateCluster() {
    if (!cluster) return;
    setSavingCluster(true);
    try {
      const res = await fetch(`/api/clusters/${cluster.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(clusterForm),
      });
      if (res.ok) {
        const updated = await res.json();
        setCluster((prev) => (prev ? { ...prev, ...updated } : prev));
        setIsEditClusterOpen(false);
      }
    } catch (error) {
      console.error('Error updating cluster:', error);
    } finally {
      setSavingCluster(false);
    }
  }

  // Node handlers
  function openAddNode() {
    setEditingNode(null);
    setNodeForm({ name: '', host: '', port: '', role: 'REPLICA', status: 'OFFLINE' });
    setIsNodeDialogOpen(true);
  }

  function openEditNode(node: Node) {
    setEditingNode(node);
    setNodeForm({
      name: node.name,
      host: node.host,
      port: String(node.port),
      role: node.role,
      status: node.status,
    });
    setIsNodeDialogOpen(true);
  }

  async function handleSaveNode() {
    if (!nodeForm.name || !nodeForm.host || !nodeForm.port) return;
    setSavingNode(true);
    try {
      if (editingNode) {
        // Update existing node
        const res = await fetch(`/api/nodes/${editingNode.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(nodeForm),
        });
        if (res.ok) {
          const updated = await res.json();
          setCluster((prev) =>
            prev
              ? { ...prev, nodes: prev.nodes.map((n) => (n.id === updated.id ? updated : n)) }
              : prev
          );
        }
      } else {
        // Create new node
        const res = await fetch('/api/nodes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...nodeForm, clusterId }),
        });
        if (res.ok) {
          const newNode = await res.json();
          setCluster((prev) =>
            prev ? { ...prev, nodes: [...prev.nodes, newNode] } : prev
          );
        }
      }
      setIsNodeDialogOpen(false);
    } catch (error) {
      console.error('Error saving node:', error);
    } finally {
      setSavingNode(false);
    }
  }

  async function handleDeleteNode(nodeId: string) {
    if (!confirm('Are you sure you want to remove this node?')) return;
    setDeleteNodeId(nodeId);
    try {
      const res = await fetch(`/api/nodes/${nodeId}`, { method: 'DELETE' });
      if (res.ok) {
        setCluster((prev) =>
          prev ? { ...prev, nodes: prev.nodes.filter((n) => n.id !== nodeId) } : null
        );
      }
    } catch (error) {
      console.error('Error deleting node:', error);
    } finally {
      setDeleteNodeId(null);
    }
  }

  async function handleNodeLifecycle(nodeId: string, action: string) {
    setLifecycleLoading(nodeId);
    try {
      const res = await fetch('/api/node-lifecycle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodeId, action }),
      });
      if (res.ok) {
        const data = await res.json();
        if (action === 'decommission') {
          setCluster((prev) =>
            prev ? { ...prev, nodes: prev.nodes.filter((n) => n.id !== nodeId) } : null
          );
        } else {
          setCluster((prev) =>
            prev ? { ...prev, nodes: prev.nodes.map((n) => (n.id === data.id ? { ...n, status: data.status } : n)) } : prev
          );
        }
      }
    } catch (error) {
      console.error('Error executing lifecycle action:', error);
    } finally {
      setLifecycleLoading(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-cyan-500" />
      </div>
    );
  }

  if (!cluster) {
    return (
      <div className="text-center py-16">
        <Database className="h-16 w-16 text-slate-600 mx-auto mb-4" />
        <h2 className="text-xl font-medium text-slate-300">Cluster not found</h2>
        <Link href="/clusters">
          <Button variant="outline" className="mt-4">
            Back to Clusters
          </Button>
        </Link>
      </div>
    );
  }

  const primaryNode = cluster.nodes.find((n) => n.role === 'PRIMARY');
  const replicaNodes = cluster.nodes.filter((n) => n.role === 'REPLICA');

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Link href="/clusters">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold text-slate-100">{cluster.name}</h1>
              <StatusBadge status={cluster.status} />
            </div>
            <p className="mt-1 text-slate-400">
              {cluster.project?.organization?.name} / {cluster.project?.name}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/clusters/${clusterId}/failover`}>
            <Button variant="outline" className="gap-2">
              <ArrowLeftRight className="h-4 w-4" />
              Failover
            </Button>
          </Link>
          <Link href={`/clusters/${clusterId}/routing`}>
            <Button variant="outline" className="gap-2">
              <GitBranch className="h-4 w-4" />
              Routing
            </Button>
          </Link>
          <Button variant="outline" className="gap-2" onClick={openEditCluster}>
            <Settings className="h-4 w-4" />
            Edit
          </Button>
        </div>
      </div>

      {/* Cluster Info Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="rounded-lg p-3 bg-purple-500/10">
                  <Activity className="h-6 w-6 text-purple-400" />
                </div>
                <div>
                  <p className="text-sm text-slate-400">Replication</p>
                  <p className="text-xl font-bold text-slate-100">{cluster.replicationMode}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="rounded-lg p-3 bg-cyan-500/10">
                  <Server className="h-6 w-6 text-cyan-400" />
                </div>
                <div>
                  <p className="text-sm text-slate-400">Total Nodes</p>
                  <p className="text-xl font-bold text-slate-100">{cluster.nodes.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="rounded-lg p-3 bg-emerald-500/10">
                  <Network className="h-6 w-6 text-emerald-400" />
                </div>
                <div>
                  <p className="text-sm text-slate-400">Topology</p>
                  <p className="text-xl font-bold text-slate-100 capitalize">{cluster.topology}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="rounded-lg p-3 bg-blue-500/10">
                  <Clock className="h-6 w-6 text-blue-400" />
                </div>
                <div>
                  <p className="text-sm text-slate-400">Created</p>
                  <p className="text-lg font-bold text-slate-100">
                    {new Date(cluster.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Nodes Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Nodes</CardTitle>
              <CardDescription>Database nodes in this cluster</CardDescription>
            </div>
            <Button className="gap-2" onClick={openAddNode}>
              <Plus className="h-4 w-4" />
              Add Node
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {cluster.nodes.length === 0 ? (
            <div className="text-center py-12">
              <Server className="h-12 w-12 text-slate-600 mx-auto mb-4" />
              <p className="text-slate-400">No nodes in this cluster</p>
              <Button className="mt-4 gap-2" onClick={openAddNode}>
                <Plus className="h-4 w-4" />
                Add First Node
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Primary Node */}
              {primaryNode && (
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="p-4 rounded-lg border border-cyan-500/30 bg-cyan-500/5"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="rounded-lg p-3 bg-cyan-500/20">
                        <Database className="h-6 w-6 text-cyan-400" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-100">{primaryNode.name}</span>
                          <Badge variant="info">PRIMARY</Badge>
                          <StatusBadge status={primaryNode.status} />
                        </div>
                        <p className="text-sm text-slate-400">
                          {primaryNode.host}:{primaryNode.port}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditNode(primaryNode)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" disabled={lifecycleLoading === primaryNode.id}>
                            {lifecycleLoading === primaryNode.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <MoreVertical className="h-4 w-4" />
                            )}
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-slate-800 border-slate-700">
                          {primaryNode.status === 'ONLINE' && (
                            <DropdownMenuItem onClick={() => handleNodeLifecycle(primaryNode.id, 'maintenance')}>
                              <Wrench className="h-4 w-4 mr-2" />
                              Maintenance Mode
                            </DropdownMenuItem>
                          )}
                          {primaryNode.status === 'MAINTENANCE' && (
                            <DropdownMenuItem onClick={() => handleNodeLifecycle(primaryNode.id, 'online')}>
                              <Power className="h-4 w-4 mr-2" />
                              Bring Online
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-red-400"
                            onClick={() => handleDeleteNode(primaryNode.id)}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Remove Node
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Replica Nodes */}
              {replicaNodes.map((node, index) => (
                <motion.div
                  key={node.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 + index * 0.05 }}
                  className="p-4 rounded-lg border border-slate-700 bg-slate-800/30 hover:border-slate-600 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="rounded-lg p-3 bg-slate-700/50">
                        <Server className="h-6 w-6 text-slate-400" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-100">{node.name}</span>
                          <Badge>REPLICA</Badge>
                          <StatusBadge status={node.status} />
                        </div>
                        <p className="text-sm text-slate-400">
                          {node.host}:{node.port}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditNode(node)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" disabled={lifecycleLoading === node.id}>
                            {lifecycleLoading === node.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <MoreVertical className="h-4 w-4" />
                            )}
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-slate-800 border-slate-700">
                          {node.status === 'ONLINE' && (
                            <>
                              <DropdownMenuItem onClick={() => handleNodeLifecycle(node.id, 'drain')}>
                                <AlertTriangle className="h-4 w-4 mr-2" />
                                Drain Connections
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleNodeLifecycle(node.id, 'maintenance')}>
                                <Wrench className="h-4 w-4 mr-2" />
                                Maintenance Mode
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleNodeLifecycle(node.id, 'offline')}>
                                <PowerOff className="h-4 w-4 mr-2" />
                                Take Offline
                              </DropdownMenuItem>
                            </>
                          )}
                          {node.status === 'DRAINING' && (
                            <DropdownMenuItem disabled>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Draining...
                            </DropdownMenuItem>
                          )}
                          {(node.status === 'MAINTENANCE' || node.status === 'OFFLINE') && (
                            <DropdownMenuItem onClick={() => handleNodeLifecycle(node.id, 'online')}>
                              <Power className="h-4 w-4 mr-2" />
                              Bring Online
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-red-400"
                            onClick={() => handleNodeLifecycle(node.id, 'decommission')}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Decommission
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Health Metrics Placeholder */}
      <Card>
        <CardHeader>
          <CardTitle>Health Metrics</CardTitle>
          <CardDescription>Real-time cluster health monitoring</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700">
              <div className="flex items-center gap-3">
                <Cpu className="h-5 w-5 text-cyan-400" />
                <span className="text-sm text-slate-400">CPU Usage</span>
              </div>
              <p className="mt-2 text-2xl font-bold text-slate-100">--</p>
              <p className="text-xs text-slate-500">Monitoring coming soon</p>
            </div>
            <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700">
              <div className="flex items-center gap-3">
                <HardDrive className="h-5 w-5 text-emerald-400" />
                <span className="text-sm text-slate-400">Disk Usage</span>
              </div>
              <p className="mt-2 text-2xl font-bold text-slate-100">--</p>
              <p className="text-xs text-slate-500">Monitoring coming soon</p>
            </div>
            <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700">
              <div className="flex items-center gap-3">
                <Activity className="h-5 w-5 text-purple-400" />
                <span className="text-sm text-slate-400">Replication Lag</span>
              </div>
              <p className="mt-2 text-2xl font-bold text-slate-100">--</p>
              <p className="text-xs text-slate-500">Monitoring coming soon</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Edit Cluster Dialog */}
      <Dialog open={isEditClusterOpen} onOpenChange={setIsEditClusterOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Cluster</DialogTitle>
            <DialogDescription>Update cluster configuration</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="cluster-name">Cluster Name</Label>
              <Input
                id="cluster-name"
                value={clusterForm.name}
                onChange={(e) => setClusterForm({ ...clusterForm, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cluster-status">Status</Label>
              <Select
                value={clusterForm.status}
                onValueChange={(val) => setClusterForm({ ...clusterForm, status: val })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PROVISIONING">Provisioning</SelectItem>
                  <SelectItem value="HEALTHY">Healthy</SelectItem>
                  <SelectItem value="DEGRADED">Degraded</SelectItem>
                  <SelectItem value="FAILING">Failing</SelectItem>
                  <SelectItem value="RECOVERING">Recovering</SelectItem>
                  <SelectItem value="MAINTENANCE">Maintenance</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="replication-mode">Replication Mode</Label>
              <Select
                value={clusterForm.replicationMode}
                onValueChange={(val) => setClusterForm({ ...clusterForm, replicationMode: val })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SYNC">Synchronous</SelectItem>
                  <SelectItem value="ASYNC">Asynchronous</SelectItem>
                  <SelectItem value="QUORUM">Quorum</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="topology">Topology</Label>
              <Select
                value={clusterForm.topology}
                onValueChange={(val) => setClusterForm({ ...clusterForm, topology: val })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="standard">Standard</SelectItem>
                  <SelectItem value="ha">High Availability</SelectItem>
                  <SelectItem value="multi-region">Multi-Region</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditClusterOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdateCluster} disabled={savingCluster}>
              {savingCluster && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Node Dialog (Add/Edit) */}
      <Dialog open={isNodeDialogOpen} onOpenChange={setIsNodeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingNode ? 'Edit Node' : 'Add Node'}</DialogTitle>
            <DialogDescription>
              {editingNode ? 'Update node configuration' : 'Add a new node to the cluster'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="node-name">Node Name</Label>
              <Input
                id="node-name"
                placeholder="e.g., pg-replica-3"
                value={nodeForm.name}
                onChange={(e) => setNodeForm({ ...nodeForm, name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="node-host">Host</Label>
                <Input
                  id="node-host"
                  placeholder="e.g., 192.168.1.100"
                  value={nodeForm.host}
                  onChange={(e) => setNodeForm({ ...nodeForm, host: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="node-port">Port</Label>
                <Input
                  id="node-port"
                  type="number"
                  placeholder="5432"
                  value={nodeForm.port}
                  onChange={(e) => setNodeForm({ ...nodeForm, port: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="node-role">Role</Label>
                <Select
                  value={nodeForm.role}
                  onValueChange={(val) => setNodeForm({ ...nodeForm, role: val })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PRIMARY">Primary</SelectItem>
                    <SelectItem value="REPLICA">Replica</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="node-status">Status</Label>
                <Select
                  value={nodeForm.status}
                  onValueChange={(val) => setNodeForm({ ...nodeForm, status: val })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ONLINE">Online</SelectItem>
                    <SelectItem value="OFFLINE">Offline</SelectItem>
                    <SelectItem value="DRAINING">Draining</SelectItem>
                    <SelectItem value="MAINTENANCE">Maintenance</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsNodeDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={handleSaveNode}
              disabled={savingNode || !nodeForm.name || !nodeForm.host || !nodeForm.port}
            >
              {savingNode && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {editingNode ? 'Save Changes' : 'Add Node'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
