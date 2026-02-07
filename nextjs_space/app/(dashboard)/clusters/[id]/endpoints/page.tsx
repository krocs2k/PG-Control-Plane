'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  Link2,
  Plus,
  Copy,
  Check,
  Settings,
  Trash2,
  Power,
  PowerOff,
  Wrench,
  RefreshCw,
  Activity,
  Database,
  Server,
  Shield,
  ArrowLeft,
  Eye,
  EyeOff,
  Zap,
  ArrowDownToLine,
  ArrowUpFromLine,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface ConnectionEndpoint {
  id: string;
  clusterId: string;
  name: string;
  slug: string;
  mode: 'READ_WRITE' | 'READ_ONLY' | 'WRITE_ONLY' | 'BALANCED';
  status: 'ACTIVE' | 'DISABLED' | 'MAINTENANCE';
  port: number;
  sslMode: string;
  maxConnections: number;
  poolSize: number;
  idleTimeout: number;
  readWeight: number;
  writeWeight: number;
  activeConnections: number;
  totalConnections: string;
  bytesIn: string;
  bytesOut: string;
  connectionString: string;
  lastUsedAt: string | null;
  createdAt: string;
}

interface Cluster {
  id: string;
  name: string;
  status: string;
  nodes: Array<{
    id: string;
    name: string;
    role: string;
    status: string;
  }>;
}

export default function ConnectionEndpointsPage() {
  const params = useParams();
  const router = useRouter();
  const clusterId = params.id as string;

  const [endpoints, setEndpoints] = useState<ConnectionEndpoint[]>([]);
  const [cluster, setCluster] = useState<Cluster | null>(null);
  const [domain, setDomain] = useState('');
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});

  // Dialog states
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedEndpoint, setSelectedEndpoint] = useState<ConnectionEndpoint | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    mode: 'READ_WRITE' as 'READ_WRITE' | 'READ_ONLY' | 'WRITE_ONLY' | 'BALANCED',
    port: 5432,
    sslMode: 'require',
    maxConnections: 100,
    poolSize: 20,
    idleTimeout: 300,
    readWeight: 100,
    writeWeight: 100,
  });

  const fetchEndpoints = async () => {
    try {
      const response = await fetch(`/api/connection-endpoints?clusterId=${clusterId}`);
      if (response.ok) {
        const data = await response.json();
        setEndpoints(data.endpoints || []);
        setCluster(data.cluster);
        setDomain(data.domain || '');
      }
    } catch (error) {
      console.error('Error fetching endpoints:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEndpoints();
  }, [clusterId]);

  const copyToClipboard = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const togglePasswordVisibility = (id: string) => {
    setShowPasswords((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const createEndpoint = async () => {
    setSaving(true);
    try {
      const response = await fetch('/api/connection-endpoints', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clusterId, ...formData }),
      });

      if (response.ok) {
        setShowCreateDialog(false);
        resetForm();
        fetchEndpoints();
      }
    } catch (error) {
      console.error('Error creating endpoint:', error);
    } finally {
      setSaving(false);
    }
  };

  const updateEndpoint = async () => {
    if (!selectedEndpoint) return;
    setSaving(true);
    try {
      const response = await fetch('/api/connection-endpoints', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selectedEndpoint.id, ...formData }),
      });

      if (response.ok) {
        setShowEditDialog(false);
        setSelectedEndpoint(null);
        fetchEndpoints();
      }
    } catch (error) {
      console.error('Error updating endpoint:', error);
    } finally {
      setSaving(false);
    }
  };

  const performAction = async (id: string, action: string) => {
    try {
      const response = await fetch('/api/connection-endpoints', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action }),
      });

      if (response.ok) {
        fetchEndpoints();
      }
    } catch (error) {
      console.error('Error performing action:', error);
    }
  };

  const deleteEndpoint = async () => {
    if (!selectedEndpoint) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/connection-endpoints?id=${selectedEndpoint.id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setShowDeleteDialog(false);
        setSelectedEndpoint(null);
        fetchEndpoints();
      }
    } catch (error) {
      console.error('Error deleting endpoint:', error);
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      mode: 'READ_WRITE',
      port: 5432,
      sslMode: 'require',
      maxConnections: 100,
      poolSize: 20,
      idleTimeout: 300,
      readWeight: 100,
      writeWeight: 100,
    });
  };

  const openEditDialog = (endpoint: ConnectionEndpoint) => {
    setSelectedEndpoint(endpoint);
    setFormData({
      name: endpoint.name,
      mode: endpoint.mode,
      port: endpoint.port,
      sslMode: endpoint.sslMode,
      maxConnections: endpoint.maxConnections,
      poolSize: endpoint.poolSize,
      idleTimeout: endpoint.idleTimeout,
      readWeight: endpoint.readWeight,
      writeWeight: endpoint.writeWeight,
    });
    setShowEditDialog(true);
  };

  const getModeColor = (mode: string) => {
    switch (mode) {
      case 'READ_WRITE':
        return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'READ_ONLY':
        return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'WRITE_ONLY':
        return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
      case 'BALANCED':
        return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
      default:
        return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
      case 'DISABLED':
        return 'bg-red-500/20 text-red-400 border-red-500/30';
      case 'MAINTENANCE':
        return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      default:
        return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    }
  };

  const formatBytes = (bytes: string) => {
    const num = parseInt(bytes, 10);
    if (num === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(num) / Math.log(k));
    return parseFloat((num / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getModeDescription = (mode: string) => {
    switch (mode) {
      case 'READ_WRITE':
        return 'Full access - reads and writes routed to appropriate nodes';
      case 'READ_ONLY':
        return 'Read-only - queries routed only to replica nodes';
      case 'WRITE_ONLY':
        return 'Write-only - all queries routed to primary node';
      case 'BALANCED':
        return 'Load balanced - random distribution across all healthy nodes';
      default:
        return '';
    }
  };

  // Calculate stats
  const totalActiveConnections = endpoints.reduce((sum, ep) => sum + ep.activeConnections, 0);
  const activeEndpoints = endpoints.filter((ep) => ep.status === 'ACTIVE').length;

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-slate-700 rounded w-1/3" />
            <div className="grid grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-24 bg-slate-700 rounded" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.push(`/clusters/${clusterId}`)}
              className="text-slate-400 hover:text-white"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                <Link2 className="h-6 w-6 text-cyan-400" />
                Connection Endpoints
              </h1>
              <p className="text-slate-400">
                {cluster?.name} - PostgreSQL connection strings with routing logic
              </p>
            </div>
          </div>
          <Button
            onClick={() => {
              resetForm();
              setShowCreateDialog(true);
            }}
            className="bg-cyan-600 hover:bg-cyan-700"
          >
            <Plus className="h-4 w-4 mr-2" />
            New Endpoint
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <Card className="bg-slate-800/50 border-slate-700">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-slate-400 text-sm">Total Endpoints</p>
                    <p className="text-2xl font-bold text-white">{endpoints.length}</p>
                  </div>
                  <Link2 className="h-8 w-8 text-cyan-400" />
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <Card className="bg-slate-800/50 border-slate-700">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-slate-400 text-sm">Active</p>
                    <p className="text-2xl font-bold text-emerald-400">{activeEndpoints}</p>
                  </div>
                  <Power className="h-8 w-8 text-emerald-400" />
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <Card className="bg-slate-800/50 border-slate-700">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-slate-400 text-sm">Active Connections</p>
                    <p className="text-2xl font-bold text-blue-400">{totalActiveConnections}</p>
                  </div>
                  <Activity className="h-8 w-8 text-blue-400" />
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
            <Card className="bg-slate-800/50 border-slate-700">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-slate-400 text-sm">Domain</p>
                    <p className="text-sm font-mono text-white truncate max-w-[150px]" title={domain}>
                      {domain.replace(/^https?:\/\//, '')}
                    </p>
                  </div>
                  <Server className="h-8 w-8 text-purple-400" />
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* Endpoints List */}
        {endpoints.length === 0 ? (
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-12 text-center">
              <Link2 className="h-12 w-12 text-slate-500 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-white mb-2">No Connection Endpoints</h3>
              <p className="text-slate-400 mb-4">
                Create your first connection endpoint to generate PostgreSQL connection strings with
                built-in routing logic.
              </p>
              <Button
                onClick={() => {
                  resetForm();
                  setShowCreateDialog(true);
                }}
                className="bg-cyan-600 hover:bg-cyan-700"
              >
                <Plus className="h-4 w-4 mr-2" />
                Create Endpoint
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {endpoints.map((endpoint, index) => (
              <motion.div
                key={endpoint.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <Card className="bg-slate-800/50 border-slate-700 hover:border-slate-600 transition-colors">
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div
                          className={`p-2 rounded-lg ${
                            endpoint.status === 'ACTIVE'
                              ? 'bg-emerald-500/20'
                              : endpoint.status === 'MAINTENANCE'
                              ? 'bg-yellow-500/20'
                              : 'bg-red-500/20'
                          }`}
                        >
                          <Database
                            className={`h-5 w-5 ${
                              endpoint.status === 'ACTIVE'
                                ? 'text-emerald-400'
                                : endpoint.status === 'MAINTENANCE'
                                ? 'text-yellow-400'
                                : 'text-red-400'
                            }`}
                          />
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold text-white">{endpoint.name}</h3>
                          <p className="text-sm text-slate-400 font-mono">{endpoint.slug}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Badge className={getModeColor(endpoint.mode)}>{endpoint.mode.replace('_', ' ')}</Badge>
                        <Badge className={getStatusColor(endpoint.status)}>{endpoint.status}</Badge>

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="text-slate-400 hover:text-white">
                              <Settings className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="bg-slate-800 border-slate-700">
                            <DropdownMenuItem
                              onClick={() => openEditDialog(endpoint)}
                              className="text-slate-200 hover:bg-slate-700"
                            >
                              <Settings className="h-4 w-4 mr-2" />
                              Configure
                            </DropdownMenuItem>
                            <DropdownMenuSeparator className="bg-slate-700" />
                            {endpoint.status === 'ACTIVE' ? (
                              <>
                                <DropdownMenuItem
                                  onClick={() => performAction(endpoint.id, 'maintenance')}
                                  className="text-yellow-400 hover:bg-slate-700"
                                >
                                  <Wrench className="h-4 w-4 mr-2" />
                                  Maintenance Mode
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => performAction(endpoint.id, 'disable')}
                                  className="text-red-400 hover:bg-slate-700"
                                >
                                  <PowerOff className="h-4 w-4 mr-2" />
                                  Disable
                                </DropdownMenuItem>
                              </>
                            ) : (
                              <DropdownMenuItem
                                onClick={() => performAction(endpoint.id, 'enable')}
                                className="text-emerald-400 hover:bg-slate-700"
                              >
                                <Power className="h-4 w-4 mr-2" />
                                Enable
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                              onClick={() => performAction(endpoint.id, 'reset_stats')}
                              className="text-slate-200 hover:bg-slate-700"
                            >
                              <RefreshCw className="h-4 w-4 mr-2" />
                              Reset Stats
                            </DropdownMenuItem>
                            <DropdownMenuSeparator className="bg-slate-700" />
                            <DropdownMenuItem
                              onClick={() => {
                                setSelectedEndpoint(endpoint);
                                setShowDeleteDialog(true);
                              }}
                              className="text-red-400 hover:bg-slate-700"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>

                    {/* Connection String */}
                    <div className="bg-slate-900/50 rounded-lg p-4 mb-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-slate-400">Connection String</span>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => togglePasswordVisibility(endpoint.id)}
                            className="text-slate-400 hover:text-white h-7 px-2"
                          >
                            {showPasswords[endpoint.id] ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => copyToClipboard(endpoint.connectionString, endpoint.id)}
                            className="text-slate-400 hover:text-white h-7 px-2"
                          >
                            {copiedId === endpoint.id ? (
                              <Check className="h-4 w-4 text-emerald-400" />
                            ) : (
                              <Copy className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </div>
                      <code className="text-sm text-cyan-400 break-all font-mono">
                        {showPasswords[endpoint.id]
                          ? endpoint.connectionString.replace('<password>', 'your_password_here')
                          : endpoint.connectionString}
                      </code>
                    </div>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-6 gap-4 text-sm">
                      <div className="bg-slate-900/30 rounded-lg p-3">
                        <div className="flex items-center gap-2 text-slate-400 mb-1">
                          <Activity className="h-3 w-3" />
                          <span>Active</span>
                        </div>
                        <p className="text-white font-semibold">
                          {endpoint.activeConnections} / {endpoint.maxConnections}
                        </p>
                      </div>

                      <div className="bg-slate-900/30 rounded-lg p-3">
                        <div className="flex items-center gap-2 text-slate-400 mb-1">
                          <Zap className="h-3 w-3" />
                          <span>Pool Size</span>
                        </div>
                        <p className="text-white font-semibold">{endpoint.poolSize}</p>
                      </div>

                      <div className="bg-slate-900/30 rounded-lg p-3">
                        <div className="flex items-center gap-2 text-slate-400 mb-1">
                          <Shield className="h-3 w-3" />
                          <span>SSL</span>
                        </div>
                        <p className="text-white font-semibold capitalize">{endpoint.sslMode}</p>
                      </div>

                      <div className="bg-slate-900/30 rounded-lg p-3">
                        <div className="flex items-center gap-2 text-slate-400 mb-1">
                          <ArrowDownToLine className="h-3 w-3" />
                          <span>Bytes In</span>
                        </div>
                        <p className="text-white font-semibold">{formatBytes(endpoint.bytesIn)}</p>
                      </div>

                      <div className="bg-slate-900/30 rounded-lg p-3">
                        <div className="flex items-center gap-2 text-slate-400 mb-1">
                          <ArrowUpFromLine className="h-3 w-3" />
                          <span>Bytes Out</span>
                        </div>
                        <p className="text-white font-semibold">{formatBytes(endpoint.bytesOut)}</p>
                      </div>

                      <div className="bg-slate-900/30 rounded-lg p-3">
                        <div className="flex items-center gap-2 text-slate-400 mb-1">
                          <Database className="h-3 w-3" />
                          <span>Port</span>
                        </div>
                        <p className="text-white font-semibold">{endpoint.port}</p>
                      </div>
                    </div>

                    {/* Mode Description */}
                    <p className="text-xs text-slate-500 mt-3">{getModeDescription(endpoint.mode)}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        )}

        {/* Create Dialog */}
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogContent className="bg-slate-800 border-slate-700 max-w-2xl">
            <DialogHeader>
              <DialogTitle className="text-white">Create Connection Endpoint</DialogTitle>
              <DialogDescription className="text-slate-400">
                Create a new PostgreSQL connection endpoint with custom routing configuration.
              </DialogDescription>
            </DialogHeader>

            <Tabs defaultValue="basic" className="mt-4">
              <TabsList className="bg-slate-900">
                <TabsTrigger value="basic">Basic</TabsTrigger>
                <TabsTrigger value="routing">Routing</TabsTrigger>
                <TabsTrigger value="advanced">Advanced</TabsTrigger>
              </TabsList>

              <TabsContent value="basic" className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label className="text-slate-200">Endpoint Name</Label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g., production-readonly"
                    className="bg-slate-900 border-slate-600 text-white"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-slate-200">Mode</Label>
                  <Select
                    value={formData.mode}
                    onValueChange={(value: typeof formData.mode) =>
                      setFormData({ ...formData, mode: value })
                    }
                  >
                    <SelectTrigger className="bg-slate-900 border-slate-600 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700">
                      <SelectItem value="READ_WRITE" className="text-slate-200">
                        Read/Write - Full access
                      </SelectItem>
                      <SelectItem value="READ_ONLY" className="text-slate-200">
                        Read Only - Replica routing
                      </SelectItem>
                      <SelectItem value="WRITE_ONLY" className="text-slate-200">
                        Write Only - Primary routing
                      </SelectItem>
                      <SelectItem value="BALANCED" className="text-slate-200">
                        Balanced - Load balanced
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-slate-500">{getModeDescription(formData.mode)}</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-slate-200">Port</Label>
                    <Input
                      type="number"
                      value={formData.port}
                      onChange={(e) => setFormData({ ...formData, port: parseInt(e.target.value) })}
                      className="bg-slate-900 border-slate-600 text-white"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-slate-200">SSL Mode</Label>
                    <Select
                      value={formData.sslMode}
                      onValueChange={(value) => setFormData({ ...formData, sslMode: value })}
                    >
                      <SelectTrigger className="bg-slate-900 border-slate-600 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-800 border-slate-700">
                        <SelectItem value="disable" className="text-slate-200">Disable</SelectItem>
                        <SelectItem value="allow" className="text-slate-200">Allow</SelectItem>
                        <SelectItem value="prefer" className="text-slate-200">Prefer</SelectItem>
                        <SelectItem value="require" className="text-slate-200">Require</SelectItem>
                        <SelectItem value="verify-ca" className="text-slate-200">Verify CA</SelectItem>
                        <SelectItem value="verify-full" className="text-slate-200">Verify Full</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="routing" className="space-y-4 mt-4">
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <Label className="text-slate-200">Read Weight</Label>
                      <span className="text-cyan-400 font-mono">{formData.readWeight}%</span>
                    </div>
                    <Slider
                      value={[formData.readWeight]}
                      onValueChange={([value]) => setFormData({ ...formData, readWeight: value })}
                      max={100}
                      step={5}
                      className="w-full"
                    />
                    <p className="text-xs text-slate-500 mt-1">
                      Weight applied to read queries for load distribution
                    </p>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <Label className="text-slate-200">Write Weight</Label>
                      <span className="text-orange-400 font-mono">{formData.writeWeight}%</span>
                    </div>
                    <Slider
                      value={[formData.writeWeight]}
                      onValueChange={([value]) => setFormData({ ...formData, writeWeight: value })}
                      max={100}
                      step={5}
                      className="w-full"
                    />
                    <p className="text-xs text-slate-500 mt-1">
                      Weight applied to write queries (only affects multi-primary setups)
                    </p>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="advanced" className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-slate-200">Max Connections</Label>
                    <Input
                      type="number"
                      value={formData.maxConnections}
                      onChange={(e) =>
                        setFormData({ ...formData, maxConnections: parseInt(e.target.value) })
                      }
                      className="bg-slate-900 border-slate-600 text-white"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-slate-200">Pool Size</Label>
                    <Input
                      type="number"
                      value={formData.poolSize}
                      onChange={(e) =>
                        setFormData({ ...formData, poolSize: parseInt(e.target.value) })
                      }
                      className="bg-slate-900 border-slate-600 text-white"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-slate-200">Idle Timeout (seconds)</Label>
                  <Input
                    type="number"
                    value={formData.idleTimeout}
                    onChange={(e) =>
                      setFormData({ ...formData, idleTimeout: parseInt(e.target.value) })
                    }
                    className="bg-slate-900 border-slate-600 text-white"
                  />
                  <p className="text-xs text-slate-500">
                    Time before idle connections are closed
                  </p>
                </div>
              </TabsContent>
            </Tabs>

            <DialogFooter>
              <Button
                variant="ghost"
                onClick={() => setShowCreateDialog(false)}
                className="text-slate-400"
              >
                Cancel
              </Button>
              <Button
                onClick={createEndpoint}
                disabled={!formData.name || saving}
                className="bg-cyan-600 hover:bg-cyan-700"
              >
                {saving ? 'Creating...' : 'Create Endpoint'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Dialog */}
        <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
          <DialogContent className="bg-slate-800 border-slate-700 max-w-2xl">
            <DialogHeader>
              <DialogTitle className="text-white">Configure Endpoint</DialogTitle>
              <DialogDescription className="text-slate-400">
                Update the configuration for {selectedEndpoint?.name}
              </DialogDescription>
            </DialogHeader>

            <Tabs defaultValue="basic" className="mt-4">
              <TabsList className="bg-slate-900">
                <TabsTrigger value="basic">Basic</TabsTrigger>
                <TabsTrigger value="routing">Routing</TabsTrigger>
                <TabsTrigger value="advanced">Advanced</TabsTrigger>
              </TabsList>

              <TabsContent value="basic" className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label className="text-slate-200">Endpoint Name</Label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="bg-slate-900 border-slate-600 text-white"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-slate-200">Mode</Label>
                  <Select
                    value={formData.mode}
                    onValueChange={(value: typeof formData.mode) =>
                      setFormData({ ...formData, mode: value })
                    }
                  >
                    <SelectTrigger className="bg-slate-900 border-slate-600 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700">
                      <SelectItem value="READ_WRITE" className="text-slate-200">
                        Read/Write - Full access
                      </SelectItem>
                      <SelectItem value="READ_ONLY" className="text-slate-200">
                        Read Only - Replica routing
                      </SelectItem>
                      <SelectItem value="WRITE_ONLY" className="text-slate-200">
                        Write Only - Primary routing
                      </SelectItem>
                      <SelectItem value="BALANCED" className="text-slate-200">
                        Balanced - Load balanced
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-slate-200">Port</Label>
                    <Input
                      type="number"
                      value={formData.port}
                      onChange={(e) => setFormData({ ...formData, port: parseInt(e.target.value) })}
                      className="bg-slate-900 border-slate-600 text-white"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-slate-200">SSL Mode</Label>
                    <Select
                      value={formData.sslMode}
                      onValueChange={(value) => setFormData({ ...formData, sslMode: value })}
                    >
                      <SelectTrigger className="bg-slate-900 border-slate-600 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-800 border-slate-700">
                        <SelectItem value="disable" className="text-slate-200">Disable</SelectItem>
                        <SelectItem value="allow" className="text-slate-200">Allow</SelectItem>
                        <SelectItem value="prefer" className="text-slate-200">Prefer</SelectItem>
                        <SelectItem value="require" className="text-slate-200">Require</SelectItem>
                        <SelectItem value="verify-ca" className="text-slate-200">Verify CA</SelectItem>
                        <SelectItem value="verify-full" className="text-slate-200">Verify Full</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="routing" className="space-y-4 mt-4">
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <Label className="text-slate-200">Read Weight</Label>
                      <span className="text-cyan-400 font-mono">{formData.readWeight}%</span>
                    </div>
                    <Slider
                      value={[formData.readWeight]}
                      onValueChange={([value]) => setFormData({ ...formData, readWeight: value })}
                      max={100}
                      step={5}
                      className="w-full"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <Label className="text-slate-200">Write Weight</Label>
                      <span className="text-orange-400 font-mono">{formData.writeWeight}%</span>
                    </div>
                    <Slider
                      value={[formData.writeWeight]}
                      onValueChange={([value]) => setFormData({ ...formData, writeWeight: value })}
                      max={100}
                      step={5}
                      className="w-full"
                    />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="advanced" className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-slate-200">Max Connections</Label>
                    <Input
                      type="number"
                      value={formData.maxConnections}
                      onChange={(e) =>
                        setFormData({ ...formData, maxConnections: parseInt(e.target.value) })
                      }
                      className="bg-slate-900 border-slate-600 text-white"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-slate-200">Pool Size</Label>
                    <Input
                      type="number"
                      value={formData.poolSize}
                      onChange={(e) =>
                        setFormData({ ...formData, poolSize: parseInt(e.target.value) })
                      }
                      className="bg-slate-900 border-slate-600 text-white"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-slate-200">Idle Timeout (seconds)</Label>
                  <Input
                    type="number"
                    value={formData.idleTimeout}
                    onChange={(e) =>
                      setFormData({ ...formData, idleTimeout: parseInt(e.target.value) })
                    }
                    className="bg-slate-900 border-slate-600 text-white"
                  />
                </div>
              </TabsContent>
            </Tabs>

            <DialogFooter>
              <Button
                variant="ghost"
                onClick={() => setShowEditDialog(false)}
                className="text-slate-400"
              >
                Cancel
              </Button>
              <Button
                onClick={updateEndpoint}
                disabled={!formData.name || saving}
                className="bg-cyan-600 hover:bg-cyan-700"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation */}
        <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <AlertDialogContent className="bg-slate-800 border-slate-700">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-white">Delete Connection Endpoint</AlertDialogTitle>
              <AlertDialogDescription className="text-slate-400">
                Are you sure you want to delete &ldquo;{selectedEndpoint?.name}&rdquo;? This will invalidate
                the connection string and any applications using it will lose connectivity.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="bg-slate-700 text-white border-slate-600">
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={deleteEndpoint}
                disabled={saving}
                className="bg-red-600 hover:bg-red-700"
              >
                {saving ? 'Deleting...' : 'Delete'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
