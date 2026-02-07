'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  Network,
  Server,
  Shield,
  Users,
  RefreshCw,
  Send,
  Check,
  X,
  Crown,
  ArrowUpCircle,
  Link2,
  Unlink,
  Clock,
  Activity,
  Database,
  AlertTriangle,
  Settings,
  Copy,
  Eye,
  EyeOff,
  Loader2,
  ArrowRight,
  CheckCircle,
  XCircle,
  Timer,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface Identity {
  id: string;
  instanceId: string;
  name: string;
  domain: string;
  role: 'PRINCIPLE' | 'PARTNER' | 'STANDALONE';
  principleId: string | null;
  apiKey: string;
}

interface FederatedNode {
  id: string;
  instanceId: string;
  name: string;
  domain: string;
  role: 'PRINCIPLE' | 'PARTNER';
  status: string;
  syncEnabled: boolean;
  lastHeartbeat: string | null;
  lastSyncAt: string | null;
  promotionRequestAt: string | null;
  promotionRequestBy: string | null;
  syncLogs: SyncLog[];
}

interface FederationRequest {
  id: string;
  fromInstanceId: string;
  fromName: string;
  fromDomain: string;
  toInstanceId: string | null;
  requestType: 'PARTNERSHIP' | 'PROMOTION';
  status: string;
  message: string | null;
  expiresAt: string | null;
  createdAt: string;
}

interface SyncLog {
  id: string;
  direction: string;
  entityType: string;
  entityCount: number;
  status: string;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
}

export default function FederationPage() {
  const router = useRouter();
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [federatedNodes, setFederatedNodes] = useState<FederatedNode[]>([]);
  const [requests, setRequests] = useState<FederationRequest[]>([]);
  const [currentDomain, setCurrentDomain] = useState('');
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  // Dialog states
  const [showPartnershipDialog, setShowPartnershipDialog] = useState(false);
  const [showIdentityDialog, setShowIdentityDialog] = useState(false);
  const [showPromoteDialog, setShowPromoteDialog] = useState(false);
  const [showDisconnectDialog, setShowDisconnectDialog] = useState(false);
  const [selectedNode, setSelectedNode] = useState<FederatedNode | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const [fullApiKey, setFullApiKey] = useState('');

  // Form states
  const [partnershipForm, setPartnershipForm] = useState({ targetDomain: '', message: '' });
  const [identityForm, setIdentityForm] = useState({ name: '' });

  const fetchFederationData = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/federation');
      if (response.ok) {
        const data = await response.json();
        setIdentity(data.identity);
        setFederatedNodes(data.federatedNodes || []);
        setRequests(data.requests || []);
        setCurrentDomain(data.currentDomain || '');
      }
    } catch (error) {
      console.error('Error fetching federation data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFederationData();
    // Poll for updates every 5 seconds (for promotion timeouts)
    const interval = setInterval(fetchFederationData, 5000);
    return () => clearInterval(interval);
  }, [fetchFederationData]);

  const updateIdentity = async () => {
    try {
      const response = await fetch('/api/admin/federation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update-identity', name: identityForm.name }),
      });
      if (response.ok) {
        setShowIdentityDialog(false);
        fetchFederationData();
      }
    } catch (error) {
      console.error('Error updating identity:', error);
    }
  };

  const regenerateApiKey = async () => {
    try {
      const response = await fetch('/api/admin/federation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'regenerate-api-key' }),
      });
      if (response.ok) {
        const data = await response.json();
        setFullApiKey(data.apiKey);
        fetchFederationData();
      }
    } catch (error) {
      console.error('Error regenerating API key:', error);
    }
  };

  const sendPartnershipRequest = async () => {
    try {
      const response = await fetch('/api/admin/federation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send-partnership-request',
          targetDomain: partnershipForm.targetDomain,
          message: partnershipForm.message,
        }),
      });
      if (response.ok) {
        setShowPartnershipDialog(false);
        setPartnershipForm({ targetDomain: '', message: '' });
        fetchFederationData();
      }
    } catch (error) {
      console.error('Error sending partnership request:', error);
    }
  };

  const respondToRequest = async (requestId: string, accept: boolean) => {
    try {
      const response = await fetch('/api/admin/federation', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'respond-to-request', requestId, accept }),
      });
      if (response.ok) {
        fetchFederationData();
      }
    } catch (error) {
      console.error('Error responding to request:', error);
    }
  };

  const promotePartner = async () => {
    if (!selectedNode) return;
    try {
      const response = await fetch('/api/admin/federation', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'promote-partner', nodeId: selectedNode.id }),
      });
      if (response.ok) {
        setShowPromoteDialog(false);
        setSelectedNode(null);
        fetchFederationData();
      }
    } catch (error) {
      console.error('Error promoting partner:', error);
    }
  };

  const requestPromotion = async (nodeId: string) => {
    try {
      const response = await fetch('/api/admin/federation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'request-promotion', nodeId }),
      });
      if (response.ok) {
        fetchFederationData();
      }
    } catch (error) {
      console.error('Error requesting promotion:', error);
    }
  };

  const disconnectNode = async () => {
    if (!selectedNode) return;
    try {
      const response = await fetch('/api/admin/federation', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'disconnect-node', nodeId: selectedNode.id }),
      });
      if (response.ok) {
        setShowDisconnectDialog(false);
        setSelectedNode(null);
        fetchFederationData();
      }
    } catch (error) {
      console.error('Error disconnecting node:', error);
    }
  };

  const toggleSync = async (nodeId: string, enabled: boolean) => {
    try {
      await fetch('/api/admin/federation', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'toggle-sync', nodeId, enabled }),
      });
      fetchFederationData();
    } catch (error) {
      console.error('Error toggling sync:', error);
    }
  };

  const triggerSync = async (nodeId?: string) => {
    setSyncing(true);
    try {
      const response = await fetch('/api/admin/federation/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'trigger-sync', nodeId }),
      });
      if (response.ok) {
        fetchFederationData();
      }
    } catch (error) {
      console.error('Error triggering sync:', error);
    } finally {
      setSyncing(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'PRINCIPLE':
        return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
      case 'PARTNER':
        return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'STANDALONE':
        return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
      default:
        return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    }
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'CONNECTED':
        return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
      case 'SYNCING':
        return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'DISCONNECTED':
        return 'bg-red-500/20 text-red-400 border-red-500/30';
      case 'PENDING':
        return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      default:
        return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    }
  };

  const pendingRequests = requests.filter(
    (r) => r.status === 'PENDING' && r.toInstanceId === identity?.instanceId
  );

  const partners = federatedNodes.filter((n) => n.role === 'PARTNER');
  const principles = federatedNodes.filter((n) => n.role === 'PRINCIPLE');

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-slate-700 rounded w-1/3" />
            <div className="grid grid-cols-3 gap-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-32 bg-slate-700 rounded" />
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
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <Network className="h-6 w-6 text-purple-400" />
              Control Plane Federation
            </h1>
            <p className="text-slate-400">Connect and synchronize multiple PG Control Planes</p>
          </div>
          <div className="flex items-center gap-2">
            {identity?.role === 'PRINCIPLE' && (
              <Button
                onClick={() => triggerSync()}
                disabled={syncing}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                {syncing ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Sync All Partners
              </Button>
            )}
            <Button
              onClick={() => setShowPartnershipDialog(true)}
              className="bg-purple-600 hover:bg-purple-700"
            >
              <Link2 className="h-4 w-4 mr-2" />
              Connect Control Plane
            </Button>
          </div>
        </div>

        {/* Pending Requests Alert */}
        {pendingRequests.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4"
          >
            <div className="flex items-center gap-2 text-amber-400 mb-3">
              <AlertTriangle className="h-5 w-5" />
              <span className="font-semibold">
                {pendingRequests.length} Pending Request{pendingRequests.length > 1 ? 's' : ''}
              </span>
            </div>
            <div className="space-y-2">
              {pendingRequests.map((req) => (
                <div
                  key={req.id}
                  className="flex items-center justify-between bg-slate-800/50 rounded-lg p-3"
                >
                  <div>
                    <p className="text-white font-medium">{req.fromName}</p>
                    <p className="text-sm text-slate-400">{req.fromDomain}</p>
                    <p className="text-xs text-slate-500">
                      {req.requestType === 'PARTNERSHIP' ? 'Wants to partner' : 'Requesting promotion'}
                      {req.expiresAt && (
                        <span className="ml-2 text-amber-400">
                          <Timer className="h-3 w-3 inline mr-1" />
                          Expires: {new Date(req.expiresAt).toLocaleTimeString()}
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => respondToRequest(req.id, true)}
                      className="bg-emerald-600 hover:bg-emerald-700"
                    >
                      <Check className="h-4 w-4 mr-1" />
                      Accept
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => respondToRequest(req.id, false)}
                      className="text-red-400 hover:bg-red-500/20"
                    >
                      <X className="h-4 w-4 mr-1" />
                      Reject
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Identity Card */}
        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-purple-500/20">
                  <Shield className="h-6 w-6 text-purple-400" />
                </div>
                <div>
                  <CardTitle className="text-white">This Control Plane</CardTitle>
                  <CardDescription>Your federation identity</CardDescription>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setIdentityForm({ name: identity?.name || '' });
                  setShowIdentityDialog(true);
                }}
                className="text-slate-400 hover:text-white"
              >
                <Settings className="h-4 w-4 mr-2" />
                Configure
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-slate-900/50 rounded-lg p-4">
                <p className="text-sm text-slate-400 mb-1">Name</p>
                <p className="text-white font-semibold">{identity?.name}</p>
              </div>
              <div className="bg-slate-900/50 rounded-lg p-4">
                <p className="text-sm text-slate-400 mb-1">Role</p>
                <Badge className={getRoleBadgeColor(identity?.role || '')}>
                  {identity?.role === 'PRINCIPLE' && <Crown className="h-3 w-3 mr-1" />}
                  {identity?.role}
                </Badge>
              </div>
              <div className="bg-slate-900/50 rounded-lg p-4">
                <p className="text-sm text-slate-400 mb-1">Domain</p>
                <p className="text-cyan-400 font-mono text-sm truncate" title={currentDomain}>
                  {currentDomain}
                </p>
              </div>
              <div className="bg-slate-900/50 rounded-lg p-4">
                <p className="text-sm text-slate-400 mb-1">Instance ID</p>
                <div className="flex items-center gap-2">
                  <p className="text-white font-mono text-sm truncate">
                    {identity?.instanceId?.substring(0, 16)}...
                  </p>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-slate-400"
                    onClick={() => copyToClipboard(identity?.instanceId || '')}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </div>

            <div className="mt-4 bg-slate-900/50 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-400 mb-1">Federation API Key</p>
                  <div className="flex items-center gap-2">
                    <code className="text-emerald-400 font-mono text-sm">
                      {showApiKey && fullApiKey ? fullApiKey : identity?.apiKey}
                    </code>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-slate-400"
                      onClick={() => setShowApiKey(!showApiKey)}
                    >
                      {showApiKey ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-slate-400"
                      onClick={() => copyToClipboard(fullApiKey || identity?.apiKey || '')}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={regenerateApiKey}
                  className="text-amber-400 hover:bg-amber-500/20"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Regenerate
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tabs for Partners/Principle and Sync Logs */}
        <Tabs defaultValue="nodes" className="space-y-4">
          <TabsList className="bg-slate-800">
            <TabsTrigger value="nodes" className="flex items-center gap-2">
              <Server className="h-4 w-4" />
              Connected Nodes ({federatedNodes.length})
            </TabsTrigger>
            <TabsTrigger value="requests" className="flex items-center gap-2">
              <Send className="h-4 w-4" />
              Requests ({requests.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="nodes">
            {federatedNodes.length === 0 ? (
              <Card className="bg-slate-800/50 border-slate-700">
                <CardContent className="p-12 text-center">
                  <Network className="h-12 w-12 text-slate-500 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-white mb-2">No Connected Control Planes</h3>
                  <p className="text-slate-400 mb-4">
                    Connect to another PG Control Plane to enable federation and data synchronization.
                  </p>
                  <Button
                    onClick={() => setShowPartnershipDialog(true)}
                    className="bg-purple-600 hover:bg-purple-700"
                  >
                    <Link2 className="h-4 w-4 mr-2" />
                    Connect Control Plane
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {/* Principle Section */}
                {principles.length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                      <Crown className="h-5 w-5 text-amber-400" />
                      Principle Control Plane
                    </h3>
                    {principles.map((node) => (
                      <Card key={node.id} className="bg-slate-800/50 border-slate-700">
                        <CardContent className="p-6">
                          <div className="flex items-start justify-between">
                            <div className="flex items-center gap-4">
                              <div className="p-3 rounded-lg bg-amber-500/20">
                                <Crown className="h-6 w-6 text-amber-400" />
                              </div>
                              <div>
                                <h4 className="text-lg font-semibold text-white">{node.name}</h4>
                                <p className="text-cyan-400 font-mono text-sm">{node.domain}</p>
                                <div className="flex items-center gap-2 mt-2">
                                  <Badge className={getStatusBadgeColor(node.status)}>
                                    {node.status}
                                  </Badge>
                                  {node.lastHeartbeat && (
                                    <span className="text-xs text-slate-500">
                                      Last seen: {new Date(node.lastHeartbeat).toLocaleString()}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {identity?.role === 'PARTNER' && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => requestPromotion(node.id)}
                                  className="text-amber-400 hover:bg-amber-500/20"
                                >
                                  <ArrowUpCircle className="h-4 w-4 mr-2" />
                                  Request Promotion
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setSelectedNode(node);
                                  setShowDisconnectDialog(true);
                                }}
                                className="text-red-400 hover:bg-red-500/20"
                              >
                                <Unlink className="h-4 w-4 mr-2" />
                                Disconnect
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}

                {/* Partners Section */}
                {partners.length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                      <Users className="h-5 w-5 text-blue-400" />
                      Partner Control Planes ({partners.length})
                    </h3>
                    <div className="space-y-3">
                      {partners.map((node) => (
                        <Card key={node.id} className="bg-slate-800/50 border-slate-700">
                          <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-4">
                                <div className="p-2 rounded-lg bg-blue-500/20">
                                  <Server className="h-5 w-5 text-blue-400" />
                                </div>
                                <div>
                                  <h4 className="text-white font-medium">{node.name}</h4>
                                  <p className="text-cyan-400 font-mono text-sm">{node.domain}</p>
                                </div>
                              </div>

                              <div className="flex items-center gap-4">
                                <div className="flex items-center gap-2">
                                  <Badge className={getStatusBadgeColor(node.status)}>
                                    {node.status}
                                  </Badge>
                                </div>

                                <div className="flex items-center gap-2">
                                  <span className="text-sm text-slate-400">Sync</span>
                                  <Switch
                                    checked={node.syncEnabled}
                                    onCheckedChange={(checked) => toggleSync(node.id, checked)}
                                  />
                                </div>

                                {identity?.role === 'PRINCIPLE' && (
                                  <>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => triggerSync(node.id)}
                                      disabled={syncing || !node.syncEnabled}
                                      className="text-emerald-400 hover:bg-emerald-500/20"
                                    >
                                      <RefreshCw className="h-4 w-4 mr-2" />
                                      Sync
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => {
                                        setSelectedNode(node);
                                        setShowPromoteDialog(true);
                                      }}
                                      className="text-amber-400 hover:bg-amber-500/20"
                                    >
                                      <Crown className="h-4 w-4 mr-2" />
                                      Promote
                                    </Button>
                                  </>
                                )}

                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => {
                                    setSelectedNode(node);
                                    setShowDisconnectDialog(true);
                                  }}
                                  className="text-red-400 hover:bg-red-500/20"
                                >
                                  <Unlink className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>

                            {/* Recent Sync Logs */}
                            {node.syncLogs && node.syncLogs.length > 0 && (
                              <div className="mt-3 pt-3 border-t border-slate-700">
                                <p className="text-xs text-slate-400 mb-2">Recent Syncs:</p>
                                <div className="flex gap-2 flex-wrap">
                                  {node.syncLogs.slice(0, 3).map((log) => (
                                    <span
                                      key={log.id}
                                      className={`text-xs px-2 py-1 rounded ${
                                        log.status === 'COMPLETED'
                                          ? 'bg-emerald-500/20 text-emerald-400'
                                          : log.status === 'FAILED'
                                          ? 'bg-red-500/20 text-red-400'
                                          : 'bg-blue-500/20 text-blue-400'
                                      }`}
                                    >
                                      {log.direction} • {log.entityCount} entities •{' '}
                                      {new Date(log.createdAt).toLocaleTimeString()}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="requests">
            {requests.length === 0 ? (
              <Card className="bg-slate-800/50 border-slate-700">
                <CardContent className="p-12 text-center">
                  <Send className="h-12 w-12 text-slate-500 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-white mb-2">No Federation Requests</h3>
                  <p className="text-slate-400">Partnership and promotion requests will appear here.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {requests.map((req) => (
                  <Card key={req.id} className="bg-slate-800/50 border-slate-700">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div
                            className={`p-2 rounded-lg ${
                              req.requestType === 'PARTNERSHIP'
                                ? 'bg-blue-500/20'
                                : 'bg-amber-500/20'
                            }`}
                          >
                            {req.requestType === 'PARTNERSHIP' ? (
                              <Link2
                                className={`h-5 w-5 ${
                                  req.requestType === 'PARTNERSHIP'
                                    ? 'text-blue-400'
                                    : 'text-amber-400'
                                }`}
                              />
                            ) : (
                              <ArrowUpCircle className="h-5 w-5 text-amber-400" />
                            )}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="text-white font-medium">{req.fromName}</p>
                              <ArrowRight className="h-4 w-4 text-slate-500" />
                              <p className="text-slate-400">
                                {req.toInstanceId === identity?.instanceId ? 'You' : 'Remote'}
                              </p>
                            </div>
                            <p className="text-cyan-400 font-mono text-sm">{req.fromDomain}</p>
                            <p className="text-xs text-slate-500 mt-1">
                              {req.requestType} • {new Date(req.createdAt).toLocaleString()}
                            </p>
                          </div>
                        </div>
                        <Badge
                          className={
                            req.status === 'PENDING'
                              ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
                              : req.status === 'ACKNOWLEDGED'
                              ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                              : 'bg-red-500/20 text-red-400 border-red-500/30'
                          }
                        >
                          {req.status === 'ACKNOWLEDGED' && <CheckCircle className="h-3 w-3 mr-1" />}
                          {req.status === 'REJECTED' && <XCircle className="h-3 w-3 mr-1" />}
                          {req.status === 'PENDING' && <Clock className="h-3 w-3 mr-1" />}
                          {req.status}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Partnership Request Dialog */}
        <Dialog open={showPartnershipDialog} onOpenChange={setShowPartnershipDialog}>
          <DialogContent className="bg-slate-800 border-slate-700">
            <DialogHeader>
              <DialogTitle className="text-white">Connect Control Plane</DialogTitle>
              <DialogDescription className="text-slate-400">
                Send a partnership request to another PG Control Plane. You will become a Partner and
                they will become the Principle.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label className="text-slate-200">Target Control Plane Domain</Label>
                <Input
                  value={partnershipForm.targetDomain}
                  onChange={(e) =>
                    setPartnershipForm({ ...partnershipForm, targetDomain: e.target.value })
                  }
                  placeholder="https://other-control-plane.example.com"
                  className="bg-slate-900 border-slate-600 text-white"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-slate-200">Message (Optional)</Label>
                <Textarea
                  value={partnershipForm.message}
                  onChange={(e) =>
                    setPartnershipForm({ ...partnershipForm, message: e.target.value })
                  }
                  placeholder="Reason for partnership request..."
                  className="bg-slate-900 border-slate-600 text-white"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="ghost"
                onClick={() => setShowPartnershipDialog(false)}
                className="text-slate-400"
              >
                Cancel
              </Button>
              <Button
                onClick={sendPartnershipRequest}
                disabled={!partnershipForm.targetDomain}
                className="bg-purple-600 hover:bg-purple-700"
              >
                <Send className="h-4 w-4 mr-2" />
                Send Request
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Identity Configuration Dialog */}
        <Dialog open={showIdentityDialog} onOpenChange={setShowIdentityDialog}>
          <DialogContent className="bg-slate-800 border-slate-700">
            <DialogHeader>
              <DialogTitle className="text-white">Configure Identity</DialogTitle>
              <DialogDescription className="text-slate-400">
                Update your control plane's identity information.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label className="text-slate-200">Control Plane Name</Label>
                <Input
                  value={identityForm.name}
                  onChange={(e) => setIdentityForm({ ...identityForm, name: e.target.value })}
                  placeholder="My Control Plane"
                  className="bg-slate-900 border-slate-600 text-white"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="ghost"
                onClick={() => setShowIdentityDialog(false)}
                className="text-slate-400"
              >
                Cancel
              </Button>
              <Button
                onClick={updateIdentity}
                disabled={!identityForm.name}
                className="bg-purple-600 hover:bg-purple-700"
              >
                Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Promote Partner Dialog */}
        <AlertDialog open={showPromoteDialog} onOpenChange={setShowPromoteDialog}>
          <AlertDialogContent className="bg-slate-800 border-slate-700">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-white">Promote Partner to Principle</AlertDialogTitle>
              <AlertDialogDescription className="text-slate-400">
                Are you sure you want to promote &quot;{selectedNode?.name}&quot; to Principle? You will
                be demoted to Partner and they will become the new Principle for this federation.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="bg-slate-700 text-white border-slate-600">
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction onClick={promotePartner} className="bg-amber-600 hover:bg-amber-700">
                <Crown className="h-4 w-4 mr-2" />
                Promote to Principle
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Disconnect Node Dialog */}
        <AlertDialog open={showDisconnectDialog} onOpenChange={setShowDisconnectDialog}>
          <AlertDialogContent className="bg-slate-800 border-slate-700">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-white">Disconnect Control Plane</AlertDialogTitle>
              <AlertDialogDescription className="text-slate-400">
                Are you sure you want to disconnect &quot;{selectedNode?.name}&quot;? This will remove
                the federation link and stop all data synchronization.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="bg-slate-700 text-white border-slate-600">
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction onClick={disconnectNode} className="bg-red-600 hover:bg-red-700">
                <Unlink className="h-4 w-4 mr-2" />
                Disconnect
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
