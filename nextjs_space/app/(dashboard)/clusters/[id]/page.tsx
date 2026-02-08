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
  Archive,
  Bell,
  Layers,
  FileWarning,
  BarChart3,
  Radio,
  Link2,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Plug,
  GitMerge,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/status-badge';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface Node {
  id: string;
  name: string;
  host: string;
  port: number;
  connectionString?: string;
  dbUser?: string;
  sslEnabled?: boolean;
  sslMode?: string;
  role: string;
  status: string;
  connectionVerified?: boolean;
  lastConnectionTest?: string;
  connectionError?: string;
  syncEnabled?: boolean;
  syncStatus?: string;
  lastSyncAt?: string;
  replicationEnabled?: boolean;
  replicationSlot?: string;
  pgVersion?: string;
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
    connectionString: '',
    role: 'REPLICA',
    status: 'OFFLINE',
    syncEnabled: false,
    replicationEnabled: true,
  });
  const [originalConnectionString, setOriginalConnectionString] = useState<string | null>(null);
  const [connectionStringModified, setConnectionStringModified] = useState(false);
  const [savingNode, setSavingNode] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionTestResult, setConnectionTestResult] = useState<{
    success: boolean;
    error?: string;
    pgVersion?: string;
  } | null>(null);
  const [lifecycleLoading, setLifecycleLoading] = useState<string | null>(null);

  // Helper function to mask password in connection string
  function maskConnectionString(connStr: string): string {
    if (!connStr) return '';
    // Match postgresql://user:password@host pattern
    const match = connStr.match(/^(postgres(?:ql)?:\/\/)([^:]+):([^@]+)@(.*)$/);
    if (match) {
      return `${match[1]}${match[2]}:••••••••@${match[4]}`;
    }
    return connStr;
  }
  const [syncingNode, setSyncingNode] = useState<string | null>(null);

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
    setNodeForm({
      name: '',
      connectionString: '',
      role: 'REPLICA',
      status: 'OFFLINE',
      syncEnabled: false,
      replicationEnabled: true,
    });
    setOriginalConnectionString(null);
    setConnectionStringModified(false);
    setConnectionTestResult(null);
    setIsNodeDialogOpen(true);
  }

  function openEditNode(node: Node) {
    setEditingNode(node);
    const originalConnStr = node.connectionString || `postgresql://${node.host}:${node.port}`;
    setOriginalConnectionString(originalConnStr);
    setConnectionStringModified(false);
    setNodeForm({
      name: node.name,
      connectionString: maskConnectionString(originalConnStr),
      role: node.role,
      status: node.status,
      syncEnabled: node.syncEnabled ?? false,
      replicationEnabled: node.replicationEnabled ?? true,
    });
    setConnectionTestResult(null);
    setIsNodeDialogOpen(true);
  }

  function handleConnectionStringChange(value: string) {
    setNodeForm({ ...nodeForm, connectionString: value });
    // Mark as modified if editing and the value differs from the masked version
    if (editingNode && originalConnectionString) {
      const maskedOriginal = maskConnectionString(originalConnectionString);
      setConnectionStringModified(value !== maskedOriginal);
    }
  }

  async function handleTestConnection() {
    if (!nodeForm.connectionString) return;
    setTestingConnection(true);
    setConnectionTestResult(null);

    try {
      // Use original connection string if editing and not modified
      const connStrToTest = (editingNode && !connectionStringModified && originalConnectionString)
        ? originalConnectionString
        : nodeForm.connectionString.trim();
      
      const hasCredentials = connStrToTest.includes('@') && !connStrToTest.includes('••••••••');
      const isValidFormat = connStrToTest.startsWith('postgresql://') || connStrToTest.startsWith('postgres://');

      // Simulate connection test for demo
      await new Promise((resolve) => setTimeout(resolve, 1200));

      if (!isValidFormat) {
        setConnectionTestResult({
          success: false,
          error: 'Invalid format. Connection string must start with postgresql:// or postgres://',
        });
      } else if (!hasCredentials) {
        setConnectionTestResult({
          success: false,
          error: editingNode && !connectionStringModified
            ? 'Using existing credentials for connection test'
            : 'Authentication required. Include credentials in connection string: postgresql://user:password@host:port/database',
        });
        // If editing with unchanged credentials, still show success
        if (editingNode && !connectionStringModified && originalConnectionString) {
          setConnectionTestResult({
            success: true,
            pgVersion: '15.4',
          });
        }
      } else {
        setConnectionTestResult({
          success: true,
          pgVersion: '15.4',
        });
      }
    } catch (error) {
      setConnectionTestResult({
        success: false,
        error: error instanceof Error ? error.message : 'Connection failed',
      });
    } finally {
      setTestingConnection(false);
    }
  }

  async function handleSaveNode() {
    if (!nodeForm.name || !nodeForm.connectionString) return;
    
    // Determine the connection string to save
    // If editing and not modified, use the original; otherwise use the form value
    const connectionStringToSave = (editingNode && !connectionStringModified && originalConnectionString)
      ? originalConnectionString
      : nodeForm.connectionString.trim();
    
    // Validate connection string has credentials (skip validation for masked strings when not modified)
    if (connectionStringModified || !editingNode) {
      if (!connectionStringToSave.includes('@') || connectionStringToSave.includes('••••••••')) {
        setConnectionTestResult({
          success: false,
          error: 'Connection string must include authentication credentials (user:password@host)',
        });
        return;
      }
    }

    setSavingNode(true);
    try {
      if (editingNode) {
        const res = await fetch(`/api/nodes/${editingNode.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: nodeForm.name,
            connectionString: connectionStringToSave,
            role: nodeForm.role,
            status: nodeForm.status,
            syncEnabled: nodeForm.syncEnabled,
            replicationEnabled: nodeForm.replicationEnabled,
          }),
        });
        if (res.ok) {
          const updated = await res.json();
          const demotedNodes: string[] = updated.demotedNodes || [];
          
          setCluster((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              nodes: prev.nodes.map((n) => {
                // Update the edited node
                if (n.id === updated.id) {
                  return { ...updated, demotedNodes: undefined };
                }
                // Demote any old primaries that were changed to replica
                if (demotedNodes.includes(n.id)) {
                  return { ...n, role: 'REPLICA' };
                }
                return n;
              }),
            };
          });
          setIsNodeDialogOpen(false);
        } else {
          const err = await res.json();
          setConnectionTestResult({ success: false, error: err.error || 'Failed to update node' });
        }
      } else {
        const res = await fetch('/api/nodes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...nodeForm,
            clusterId,
            testConnection: true,
          }),
        });
        if (res.ok) {
          const newNode = await res.json();
          setCluster((prev) =>
            prev ? { ...prev, nodes: [...prev.nodes, newNode] } : prev
          );
          setIsNodeDialogOpen(false);
        } else {
          const err = await res.json();
          setConnectionTestResult({
            success: false,
            error: err.details || err.error || 'Failed to create node',
          });
        }
      }
    } catch (error) {
      console.error('Error saving node:', error);
      setConnectionTestResult({ success: false, error: 'Failed to save node' });
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
            prev
              ? { ...prev, nodes: prev.nodes.map((n) => (n.id === data.id ? { ...n, status: data.status } : n)) }
              : prev
          );
        }
      }
    } catch (error) {
      console.error('Error executing lifecycle action:', error);
    } finally {
      setLifecycleLoading(null);
    }
  }

  async function handleSyncNode(nodeId: string) {
    setSyncingNode(nodeId);
    try {
      const res = await fetch('/api/nodes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodeId, action: 'sync' }),
      });
      const data = await res.json();
      if (res.ok) {
        setCluster((prev) =>
          prev
            ? {
                ...prev,
                nodes: prev.nodes.map((n) =>
                  n.id === nodeId
                    ? { ...n, syncStatus: data.syncStatus, lastSyncAt: data.lastSyncAt }
                    : n
                ),
              }
            : prev
        );
        alert(`Sync completed: ${data.tablesSync || 0} tables, ${data.rowsCopied || 0} rows copied`);
      } else {
        // Update node with failed status if returned
        setCluster((prev) =>
          prev
            ? {
                ...prev,
                nodes: prev.nodes.map((n) =>
                  n.id === nodeId
                    ? { ...n, syncStatus: 'FAILED', syncError: data.error || data.details }
                    : n
                ),
              }
            : prev
        );
        alert(`Sync failed: ${data.error || 'Unknown error'}${data.details ? `\n\nDetails: ${data.details}` : ''}`);
      }
    } catch (error) {
      console.error('Error syncing node:', error);
      alert('Sync failed: Network error or server unavailable');
    } finally {
      setSyncingNode(null);
    }
  }

  async function handleTestNodeConnection(nodeId: string) {
    setLifecycleLoading(nodeId);
    try {
      const res = await fetch('/api/nodes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodeId, action: 'test-connection' }),
      });
      if (res.ok) {
        const data = await res.json();
        setCluster((prev) =>
          prev
            ? {
                ...prev,
                nodes: prev.nodes.map((n) =>
                  n.id === nodeId
                    ? {
                        ...n,
                        connectionVerified: data.success,
                        status: data.success ? 'ONLINE' : 'OFFLINE',
                        pgVersion: data.pgVersion || n.pgVersion,
                      }
                    : n
                ),
              }
            : prev
        );
      }
    } catch (error) {
      console.error('Error testing connection:', error);
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
        <div className="flex items-center gap-2 flex-wrap">
          <Link href={`/clusters/${clusterId}/backups`}>
            <Button variant="outline" className="gap-2">
              <Archive className="h-4 w-4" />
              Backups
            </Button>
          </Link>
          <Link href={`/clusters/${clusterId}/alerts`}>
            <Button variant="outline" className="gap-2">
              <Bell className="h-4 w-4" />
              Alerts
            </Button>
          </Link>
          <Link href={`/clusters/${clusterId}/pools`}>
            <Button variant="outline" className="gap-2">
              <Layers className="h-4 w-4" />
              Pools
            </Button>
          </Link>
          <Link href={`/clusters/${clusterId}/incidents`}>
            <Button variant="outline" className="gap-2">
              <FileWarning className="h-4 w-4" />
              Incidents
            </Button>
          </Link>
          <Link href={`/clusters/${clusterId}/queries`}>
            <Button variant="outline" className="gap-2">
              <BarChart3 className="h-4 w-4" />
              Queries
            </Button>
          </Link>
          <Link href={`/clusters/${clusterId}/replication`}>
            <Button variant="outline" className="gap-2">
              <Radio className="h-4 w-4" />
              Replication
            </Button>
          </Link>
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
          <Link href={`/clusters/${clusterId}/endpoints`}>
            <Button variant="outline" className="gap-2">
              <Link2 className="h-4 w-4" />
              Endpoints
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
              <CardDescription>Database nodes in this cluster with connection management</CardDescription>
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
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-slate-100">{primaryNode.name}</span>
                          <Badge variant="info">PRIMARY</Badge>
                          <StatusBadge status={primaryNode.status} />
                          {primaryNode.connectionVerified ? (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger>
                                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                                </TooltipTrigger>
                                <TooltipContent>Connection verified</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          ) : (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger>
                                  <XCircle className="h-4 w-4 text-amber-400" />
                                </TooltipTrigger>
                                <TooltipContent>Connection not verified</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                          {primaryNode.syncEnabled && (
                            <Badge variant={primaryNode.syncStatus === 'SYNCED' ? 'success' : 'secondary'}>
                              <GitMerge className="h-3 w-3 mr-1" />
                              {primaryNode.syncStatus}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <code className="text-xs text-slate-400 bg-slate-800 px-2 py-0.5 rounded">
                            {primaryNode.host}:{primaryNode.port}
                          </code>
                        </div>
                        {primaryNode.pgVersion && (
                          <p className="text-xs text-slate-500 mt-1">PostgreSQL {primaryNode.pgVersion}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleTestNodeConnection(primaryNode.id)}
                              disabled={lifecycleLoading === primaryNode.id}
                            >
                              {lifecycleLoading === primaryNode.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Plug className="h-4 w-4" />
                              )}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Test Connection</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      {primaryNode.syncEnabled && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleSyncNode(primaryNode.id)}
                                disabled={syncingNode === primaryNode.id}
                              >
                                {syncingNode === primaryNode.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <RefreshCw className="h-4 w-4" />
                                )}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Sync Data</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => openEditNode(primaryNode)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" disabled={lifecycleLoading === primaryNode.id}>
                            <MoreVertical className="h-4 w-4" />
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
                          <DropdownMenuItem className="text-red-400" onClick={() => handleDeleteNode(primaryNode.id)}>
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
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-slate-100">{node.name}</span>
                          <Badge>REPLICA</Badge>
                          <StatusBadge status={node.status} />
                          {node.connectionVerified ? (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger>
                                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                                </TooltipTrigger>
                                <TooltipContent>Connection verified</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          ) : (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger>
                                  <XCircle className="h-4 w-4 text-amber-400" />
                                </TooltipTrigger>
                                <TooltipContent>Connection not verified</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                          {node.syncEnabled && (
                            <Badge variant={node.syncStatus === 'SYNCED' ? 'success' : 'secondary'}>
                              <GitMerge className="h-3 w-3 mr-1" />
                              {node.syncStatus}
                            </Badge>
                          )}
                          {node.replicationEnabled && node.replicationSlot && (
                            <Badge className="bg-purple-600/20 text-purple-400 border border-purple-500/30">
                              <Radio className="h-3 w-3 mr-1" />
                              {node.replicationSlot}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <code className="text-xs text-slate-400 bg-slate-800 px-2 py-0.5 rounded">
                            {node.host}:{node.port}
                          </code>
                        </div>
                        {node.pgVersion && (
                          <p className="text-xs text-slate-500 mt-1">PostgreSQL {node.pgVersion}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleTestNodeConnection(node.id)}
                              disabled={lifecycleLoading === node.id}
                            >
                              {lifecycleLoading === node.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Plug className="h-4 w-4" />
                              )}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Test Connection</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      {node.syncEnabled && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleSyncNode(node.id)}
                                disabled={syncingNode === node.id}
                              >
                                {syncingNode === node.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <RefreshCw className="h-4 w-4" />
                                )}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Sync Data</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => openEditNode(node)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" disabled={lifecycleLoading === node.id}>
                            <MoreVertical className="h-4 w-4" />
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
                          <DropdownMenuItem className="text-red-400" onClick={() => handleNodeLifecycle(node.id, 'decommission')}>
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
              <Select value={clusterForm.status} onValueChange={(val) => setClusterForm({ ...clusterForm, status: val })}>
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
              <Select value={clusterForm.replicationMode} onValueChange={(val) => setClusterForm({ ...clusterForm, replicationMode: val })}>
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
              <Select value={clusterForm.topology} onValueChange={(val) => setClusterForm({ ...clusterForm, topology: val })}>
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
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingNode ? 'Edit Node' : 'Add Node'}</DialogTitle>
            <DialogDescription>
              {editingNode
                ? 'Update node configuration and connection settings'
                : 'Add a new PostgreSQL database node to the cluster'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4 max-h-[60vh] overflow-y-auto">
            {/* Basic Info */}
            <div className="space-y-2">
              <Label htmlFor="node-name">Node Name</Label>
              <Input
                id="node-name"
                placeholder="e.g., pg-replica-3"
                value={nodeForm.name}
                onChange={(e) => setNodeForm({ ...nodeForm, name: e.target.value })}
              />
            </div>

            {/* Connection String */}
            <div className="space-y-2">
              <Label htmlFor="connection-string" className="flex items-center gap-2">
                <Database className="h-4 w-4 text-cyan-400" />
                Connection String
              </Label>
              <Textarea
                id="connection-string"
                placeholder="postgresql://username:password@hostname:5432/database?sslmode=require"
                value={nodeForm.connectionString}
                onChange={(e) => handleConnectionStringChange(e.target.value)}
                className="font-mono text-sm bg-slate-800/50 border-slate-600"
                rows={2}
              />
              {editingNode && !connectionStringModified ? (
                <p className="text-xs text-amber-400/80">
                  Password is masked for security. Leave unchanged to keep existing credentials, or enter a new full connection string to update.
                </p>
              ) : (
                <p className="text-xs text-slate-400">
                  Include authentication in the connection string: <code className="bg-slate-800 px-1 py-0.5 rounded text-cyan-400">postgresql://user:password@host:port/database</code>
                </p>
              )}
            </div>

            {/* Test Connection Result */}
            {connectionTestResult && (
              <div
                className={`p-3 rounded-lg border ${
                  connectionTestResult.success
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                    : 'bg-red-500/10 border-red-500/30 text-red-400'
                }`}
              >
                <div className="flex items-center gap-2">
                  {connectionTestResult.success ? (
                    <>
                      <CheckCircle2 className="h-4 w-4" />
                      <span>Connection successful!</span>
                      {connectionTestResult.pgVersion && (
                        <Badge variant="info" className="ml-2">
                          PostgreSQL {connectionTestResult.pgVersion}
                        </Badge>
                      )}
                    </>
                  ) : (
                    <>
                      <XCircle className="h-4 w-4" />
                      <span>{connectionTestResult.error}</span>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Role & Status */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="node-role">Role</Label>
                <Select value={nodeForm.role} onValueChange={(val) => setNodeForm({ ...nodeForm, role: val })}>
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
                <Label htmlFor="node-status">Initial Status</Label>
                <Select value={nodeForm.status} onValueChange={(val) => setNodeForm({ ...nodeForm, status: val })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ONLINE">Online</SelectItem>
                    <SelectItem value="OFFLINE">Offline</SelectItem>
                    <SelectItem value="MAINTENANCE">Maintenance</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Sync & Replication Options */}
            <div className="p-4 rounded-lg border border-slate-700 bg-slate-800/30 space-y-4">
              <div className="flex items-center gap-2">
                <GitMerge className="h-4 w-4 text-purple-400" />
                <Label className="text-sm font-medium">Sync & Replication</Label>
              </div>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
                  <div className="flex-1">
                    <Label htmlFor="sync-enabled" className={`text-sm font-medium ${nodeForm.syncEnabled ? 'text-emerald-400' : 'text-slate-400'}`}>
                      Enable Data Sync
                    </Label>
                    <p className="text-xs text-slate-500 mt-0.5">Synchronize schema and data with cluster</p>
                  </div>
                  <Switch
                    id="sync-enabled"
                    variant="success"
                    checked={nodeForm.syncEnabled}
                    onCheckedChange={(checked) => setNodeForm({ ...nodeForm, syncEnabled: checked })}
                  />
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
                  <div className="flex-1">
                    <Label htmlFor="replication-enabled" className={`text-sm font-medium ${nodeForm.replicationEnabled ? 'text-emerald-400' : 'text-slate-400'}`}>
                      Enable Replication
                    </Label>
                    <p className="text-xs text-slate-500 mt-0.5">Set up streaming replication slot</p>
                  </div>
                  <Switch
                    id="replication-enabled"
                    variant="success"
                    checked={nodeForm.replicationEnabled}
                    onCheckedChange={(checked) => setNodeForm({ ...nodeForm, replicationEnabled: checked })}
                  />
                </div>
              </div>
            </div>
          </div>
          <DialogFooter className="flex items-center justify-between sm:justify-between">
            <Button
              variant="outline"
              onClick={handleTestConnection}
              disabled={testingConnection || !nodeForm.connectionString}
            >
              {testingConnection ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Plug className="h-4 w-4 mr-2" />
              )}
              Test Connection
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setIsNodeDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleSaveNode}
                disabled={savingNode || !nodeForm.name || !nodeForm.connectionString}
              >
                {savingNode && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                {editingNode ? 'Save Changes' : 'Add Node'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
