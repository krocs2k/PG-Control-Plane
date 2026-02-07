'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  ArrowLeft, Bell, BellOff, AlertTriangle, AlertCircle, Info, XCircle,
  CheckCircle, Clock, Plus, Settings, Trash2, RefreshCw, Filter,
  Mail, Webhook, Eye, EyeOff, Loader2, Volume2, VolumeX
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
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

interface Alert {
  id: string;
  clusterId: string;
  nodeId: string | null;
  ruleId: string | null;
  severity: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
  status: 'ACTIVE' | 'ACKNOWLEDGED' | 'RESOLVED' | 'SUPPRESSED';
  title: string;
  message: string;
  metricName: string | null;
  metricValue: number | null;
  threshold: number | null;
  acknowledgedBy: string | null;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  resolvedBy: string | null;
  suppressedUntil: string | null;
  createdAt: string;
}

interface AlertRule {
  id: string;
  clusterId: string | null;
  name: string;
  description: string | null;
  enabled: boolean;
  metric: string;
  operator: string;
  threshold: number;
  duration: number;
  severity: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
  cooldownMinutes: number;
  notifyEmail: boolean;
  notifyWebhook: boolean;
  webhookUrl: string | null;
}

interface AlertStats {
  active: number;
  critical: number;
  acknowledged: number;
  total: number;
}

interface Cluster {
  id: string;
  name: string;
}

export default function AlertsPage() {
  const params = useParams();
  const router = useRouter();
  const clusterId = params.id as string;

  const [cluster, setCluster] = useState<Cluster | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [stats, setStats] = useState<AlertStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterSeverity, setFilterSeverity] = useState<string>('all');

  const [showNewRule, setShowNewRule] = useState(false);
  const [showEditRule, setShowEditRule] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showSuppressDialog, setShowSuppressDialog] = useState(false);
  const [selectedAlert, setSelectedAlert] = useState<Alert | null>(null);
  const [selectedRule, setSelectedRule] = useState<AlertRule | null>(null);
  const [suppressDuration, setSuppressDuration] = useState(60);

  const [ruleForm, setRuleForm] = useState({
    name: '',
    description: '',
    metric: 'replication_lag',
    operator: '>',
    threshold: 100,
    duration: 60,
    severity: 'WARNING' as 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL',
    cooldownMinutes: 5,
    notifyEmail: true,
    notifyWebhook: false,
    webhookUrl: '',
  });

  useEffect(() => {
    fetchCluster();
    fetchAlerts();
  }, [clusterId]);

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

  const fetchAlerts = async () => {
    try {
      const res = await fetch(`/api/alerts?clusterId=${clusterId}`);
      if (res.ok) {
        const data = await res.json();
        setAlerts(data.alerts);
        setRules(data.rules);
        setStats(data.stats);
      }
    } catch (error) {
      console.error('Failed to fetch alerts:', error);
    } finally {
      setLoading(false);
    }
  };

  const generateTestAlerts = async () => {
    setActionLoading('generate');
    try {
      await fetch('/api/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generate_test', clusterId }),
      });
      fetchAlerts();
    } catch (error) {
      console.error('Failed to generate alerts:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const acknowledgeAlert = async (alert: Alert) => {
    setActionLoading(alert.id);
    try {
      await fetch('/api/alerts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: alert.id, action: 'acknowledge' }),
      });
      fetchAlerts();
    } catch (error) {
      console.error('Failed to acknowledge alert:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const resolveAlert = async (alert: Alert) => {
    setActionLoading(alert.id);
    try {
      await fetch('/api/alerts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: alert.id, action: 'resolve' }),
      });
      fetchAlerts();
    } catch (error) {
      console.error('Failed to resolve alert:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const suppressAlert = async () => {
    if (!selectedAlert) return;
    setActionLoading('suppress');
    try {
      await fetch('/api/alerts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selectedAlert.id, action: 'suppress', duration: suppressDuration }),
      });
      setShowSuppressDialog(false);
      setSelectedAlert(null);
      fetchAlerts();
    } catch (error) {
      console.error('Failed to suppress alert:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const deleteAlert = async (alert: Alert) => {
    setActionLoading(alert.id);
    try {
      await fetch(`/api/alerts?id=${alert.id}`, { method: 'DELETE' });
      fetchAlerts();
    } catch (error) {
      console.error('Failed to delete alert:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const createRule = async () => {
    setActionLoading('createRule');
    try {
      await fetch('/api/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create_rule', clusterId, ...ruleForm }),
      });
      setShowNewRule(false);
      resetRuleForm();
      fetchAlerts();
    } catch (error) {
      console.error('Failed to create rule:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const updateRule = async () => {
    if (!selectedRule) return;
    setActionLoading('updateRule');
    try {
      await fetch('/api/alerts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selectedRule.id, action: 'update', type: 'rule', ...ruleForm }),
      });
      setShowEditRule(false);
      setSelectedRule(null);
      resetRuleForm();
      fetchAlerts();
    } catch (error) {
      console.error('Failed to update rule:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const toggleRule = async (rule: AlertRule) => {
    setActionLoading(rule.id);
    try {
      await fetch('/api/alerts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: rule.id, action: 'toggle', type: 'rule' }),
      });
      fetchAlerts();
    } catch (error) {
      console.error('Failed to toggle rule:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const deleteRule = async () => {
    if (!selectedRule) return;
    setActionLoading('deleteRule');
    try {
      await fetch(`/api/alerts?id=${selectedRule.id}&type=rule`, { method: 'DELETE' });
      setShowDeleteConfirm(false);
      setSelectedRule(null);
      fetchAlerts();
    } catch (error) {
      console.error('Failed to delete rule:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const resetRuleForm = () => {
    setRuleForm({
      name: '',
      description: '',
      metric: 'replication_lag',
      operator: '>',
      threshold: 100,
      duration: 60,
      severity: 'WARNING',
      cooldownMinutes: 5,
      notifyEmail: true,
      notifyWebhook: false,
      webhookUrl: '',
    });
  };

  const editRule = (rule: AlertRule) => {
    setSelectedRule(rule);
    setRuleForm({
      name: rule.name,
      description: rule.description || '',
      metric: rule.metric,
      operator: rule.operator,
      threshold: rule.threshold,
      duration: rule.duration,
      severity: rule.severity,
      cooldownMinutes: rule.cooldownMinutes,
      notifyEmail: rule.notifyEmail,
      notifyWebhook: rule.notifyWebhook,
      webhookUrl: rule.webhookUrl || '',
    });
    setShowEditRule(true);
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'CRITICAL': return <XCircle className="w-5 h-5 text-red-500" />;
      case 'ERROR': return <AlertCircle className="w-5 h-5 text-orange-500" />;
      case 'WARNING': return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
      case 'INFO': return <Info className="w-5 h-5 text-blue-500" />;
      default: return <Info className="w-5 h-5 text-slate-500" />;
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'CRITICAL': return 'bg-red-500/20 text-red-400 border-red-500/30';
      case 'ERROR': return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
      case 'WARNING': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      case 'INFO': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      default: return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE': return 'bg-red-500/20 text-red-400';
      case 'ACKNOWLEDGED': return 'bg-yellow-500/20 text-yellow-400';
      case 'RESOLVED': return 'bg-green-500/20 text-green-400';
      case 'SUPPRESSED': return 'bg-slate-500/20 text-slate-400';
      default: return 'bg-slate-500/20 text-slate-400';
    }
  };

  const filteredAlerts = alerts.filter(a => {
    if (filterStatus !== 'all' && a.status !== filterStatus) return false;
    if (filterSeverity !== 'all' && a.severity !== filterSeverity) return false;
    return true;
  });

  const formatDate = (date: string | null) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleString();
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
              <Bell className="w-6 h-6 text-orange-500" />
              Alert Management
            </h1>
            <p className="text-slate-400">Cluster: {cluster?.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={fetchAlerts}>
            <RefreshCw className="w-4 h-4 mr-2" /> Refresh
          </Button>
          <Button variant="outline" onClick={generateTestAlerts} disabled={actionLoading === 'generate'}>
            {actionLoading === 'generate' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <AlertTriangle className="w-4 h-4 mr-2" />}
            Generate Test Alerts
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
                  <p className="text-sm text-slate-400">Active Alerts</p>
                  <p className="text-2xl font-bold text-red-500">{stats.active}</p>
                </div>
                <Bell className="w-8 h-8 text-red-500" />
              </div>
            </CardContent>
          </Card>
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-400">Critical</p>
                  <p className="text-2xl font-bold text-red-600">{stats.critical}</p>
                </div>
                <XCircle className="w-8 h-8 text-red-600" />
              </div>
            </CardContent>
          </Card>
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-400">Acknowledged</p>
                  <p className="text-2xl font-bold text-yellow-500">{stats.acknowledged}</p>
                </div>
                <Eye className="w-8 h-8 text-yellow-500" />
              </div>
            </CardContent>
          </Card>
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-400">Alert Rules</p>
                  <p className="text-2xl font-bold">{rules.length}</p>
                </div>
                <Settings className="w-8 h-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Tabs defaultValue="alerts" className="space-y-4">
        <TabsList className="bg-slate-800 border border-slate-700">
          <TabsTrigger value="alerts">Active Alerts</TabsTrigger>
          <TabsTrigger value="rules">Alert Rules</TabsTrigger>
        </TabsList>

        <TabsContent value="alerts" className="space-y-4">
          {/* Filters */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-slate-400" />
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-40 bg-slate-800 border-slate-700">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="ACKNOWLEDGED">Acknowledged</SelectItem>
                  <SelectItem value="RESOLVED">Resolved</SelectItem>
                  <SelectItem value="SUPPRESSED">Suppressed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Select value={filterSeverity} onValueChange={setFilterSeverity}>
              <SelectTrigger className="w-40 bg-slate-800 border-slate-700">
                <SelectValue placeholder="Severity" />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700">
                <SelectItem value="all">All Severity</SelectItem>
                <SelectItem value="CRITICAL">Critical</SelectItem>
                <SelectItem value="ERROR">Error</SelectItem>
                <SelectItem value="WARNING">Warning</SelectItem>
                <SelectItem value="INFO">Info</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Alerts List */}
          {filteredAlerts.length === 0 ? (
            <Card className="bg-slate-800/50 border-slate-700">
              <CardContent className="py-12 text-center">
                <CheckCircle className="w-12 h-12 mx-auto mb-4 text-green-500" />
                <p className="text-slate-400">No alerts matching your filters. All clear!</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {filteredAlerts.map((alert) => (
                <motion.div
                  key={alert.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <Card className={`border ${getSeverityColor(alert.severity)} bg-slate-800/50`}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-4">
                          {getSeverityIcon(alert.severity)}
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="font-medium">{alert.title}</h3>
                              <Badge className={getSeverityColor(alert.severity)}>{alert.severity}</Badge>
                              <Badge className={getStatusColor(alert.status)}>{alert.status}</Badge>
                            </div>
                            <p className="text-sm text-slate-400 mb-2">{alert.message}</p>
                            <div className="flex items-center gap-4 text-xs text-slate-500">
                              <span><Clock className="w-3 h-3 inline mr-1" />{formatDate(alert.createdAt)}</span>
                              {alert.metricName && (
                                <span>
                                  Metric: {alert.metricName} = {alert.metricValue} (threshold: {alert.threshold})
                                </span>
                              )}
                              {alert.acknowledgedBy && (
                                <span>Acknowledged by: {alert.acknowledgedBy}</span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {alert.status === 'ACTIVE' && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => acknowledgeAlert(alert)}
                                disabled={actionLoading === alert.id}
                              >
                                <Eye className="w-4 h-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => resolveAlert(alert)}
                                disabled={actionLoading === alert.id}
                              >
                                <CheckCircle className="w-4 h-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => { setSelectedAlert(alert); setShowSuppressDialog(true); }}
                              >
                                <VolumeX className="w-4 h-4" />
                              </Button>
                            </>
                          )}
                          {alert.status === 'ACKNOWLEDGED' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => resolveAlert(alert)}
                              disabled={actionLoading === alert.id}
                            >
                              <CheckCircle className="w-4 h-4 mr-1" /> Resolve
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-red-400 hover:text-red-300"
                            onClick={() => deleteAlert(alert)}
                            disabled={actionLoading === alert.id}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="rules" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => { resetRuleForm(); setShowNewRule(true); }}>
              <Plus className="w-4 h-4 mr-2" /> New Alert Rule
            </Button>
          </div>

          {rules.length === 0 ? (
            <Card className="bg-slate-800/50 border-slate-700">
              <CardContent className="py-12 text-center">
                <Settings className="w-12 h-12 mx-auto mb-4 text-slate-500" />
                <p className="text-slate-400">No alert rules configured. Create one to get started.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {rules.map((rule) => (
                <motion.div
                  key={rule.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <Card className="bg-slate-800/50 border-slate-700 hover:border-slate-600 transition-colors">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className={`p-2 rounded-lg ${rule.enabled ? 'bg-green-500/20' : 'bg-slate-700'}`}>
                            {rule.enabled ? <Volume2 className="w-5 h-5 text-green-400" /> : <VolumeX className="w-5 h-5 text-slate-400" />}
                          </div>
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="font-medium">{rule.name}</h3>
                              <Badge className={getSeverityColor(rule.severity)}>{rule.severity}</Badge>
                              {!rule.clusterId && <Badge className="bg-purple-500/20 text-purple-400">Global</Badge>}
                            </div>
                            <p className="text-sm text-slate-400">
                              {rule.metric} {rule.operator} {rule.threshold} for {rule.duration}s
                            </p>
                            <div className="flex items-center gap-4 mt-1 text-xs text-slate-500">
                              {rule.notifyEmail && <span><Mail className="w-3 h-3 inline mr-1" />Email</span>}
                              {rule.notifyWebhook && <span><Webhook className="w-3 h-3 inline mr-1" />Webhook</span>}
                              <span>Cooldown: {rule.cooldownMinutes}m</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={rule.enabled}
                            onCheckedChange={() => toggleRule(rule)}
                            disabled={actionLoading === rule.id}
                          />
                          <Button size="sm" variant="outline" onClick={() => editRule(rule)}>
                            <Settings className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-red-400 hover:text-red-300"
                            onClick={() => { setSelectedRule(rule); setShowDeleteConfirm(true); }}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* New/Edit Rule Dialog */}
      <Dialog open={showNewRule || showEditRule} onOpenChange={(open) => { setShowNewRule(false); setShowEditRule(false); if (!open) { setSelectedRule(null); resetRuleForm(); } }}>
        <DialogContent className="bg-slate-800 border-slate-700 max-w-lg">
          <DialogHeader>
            <DialogTitle>{showEditRule ? 'Edit Alert Rule' : 'Create Alert Rule'}</DialogTitle>
            <DialogDescription>Define conditions that trigger alerts</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
            <div>
              <Label>Rule Name</Label>
              <Input
                value={ruleForm.name}
                onChange={(e) => setRuleForm({ ...ruleForm, name: e.target.value })}
                className="mt-1 bg-slate-700 border-slate-600"
                placeholder="High Replication Lag"
              />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                value={ruleForm.description}
                onChange={(e) => setRuleForm({ ...ruleForm, description: e.target.value })}
                className="mt-1 bg-slate-700 border-slate-600"
                placeholder="Alert when replication lag exceeds threshold"
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label>Metric</Label>
                <Select value={ruleForm.metric} onValueChange={(v) => setRuleForm({ ...ruleForm, metric: v })}>
                  <SelectTrigger className="mt-1 bg-slate-700 border-slate-600">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    <SelectItem value="replication_lag">Replication Lag</SelectItem>
                    <SelectItem value="connections">Connections</SelectItem>
                    <SelectItem value="cpu_usage">CPU Usage</SelectItem>
                    <SelectItem value="memory_usage">Memory Usage</SelectItem>
                    <SelectItem value="disk_usage">Disk Usage</SelectItem>
                    <SelectItem value="query_time">Query Time</SelectItem>
                    <SelectItem value="pool_utilization">Pool Utilization</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Operator</Label>
                <Select value={ruleForm.operator} onValueChange={(v) => setRuleForm({ ...ruleForm, operator: v })}>
                  <SelectTrigger className="mt-1 bg-slate-700 border-slate-600">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    <SelectItem value=">">Greater than</SelectItem>
                    <SelectItem value=">=">Greater or equal</SelectItem>
                    <SelectItem value="<">Less than</SelectItem>
                    <SelectItem value="<=">Less or equal</SelectItem>
                    <SelectItem value="==">Equal to</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Threshold</Label>
                <Input
                  type="number"
                  value={ruleForm.threshold}
                  onChange={(e) => setRuleForm({ ...ruleForm, threshold: parseFloat(e.target.value) || 0 })}
                  className="mt-1 bg-slate-700 border-slate-600"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Duration (seconds)</Label>
                <Input
                  type="number"
                  value={ruleForm.duration}
                  onChange={(e) => setRuleForm({ ...ruleForm, duration: parseInt(e.target.value) || 60 })}
                  className="mt-1 bg-slate-700 border-slate-600"
                />
              </div>
              <div>
                <Label>Severity</Label>
                <Select value={ruleForm.severity} onValueChange={(v) => setRuleForm({ ...ruleForm, severity: v as 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL' })}>
                  <SelectTrigger className="mt-1 bg-slate-700 border-slate-600">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    <SelectItem value="INFO">Info</SelectItem>
                    <SelectItem value="WARNING">Warning</SelectItem>
                    <SelectItem value="ERROR">Error</SelectItem>
                    <SelectItem value="CRITICAL">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Cooldown (minutes)</Label>
              <Input
                type="number"
                value={ruleForm.cooldownMinutes}
                onChange={(e) => setRuleForm({ ...ruleForm, cooldownMinutes: parseInt(e.target.value) || 5 })}
                className="mt-1 bg-slate-700 border-slate-600"
              />
              <p className="text-xs text-slate-400 mt-1">Minimum time between repeated alerts</p>
            </div>
            <div className="space-y-2">
              <Label>Notifications</Label>
              <div className="flex items-center justify-between p-3 bg-slate-700/50 rounded-lg">
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-slate-400" />
                  <span>Email Notifications</span>
                </div>
                <Switch
                  checked={ruleForm.notifyEmail}
                  onCheckedChange={(v) => setRuleForm({ ...ruleForm, notifyEmail: v })}
                />
              </div>
              <div className="flex items-center justify-between p-3 bg-slate-700/50 rounded-lg">
                <div className="flex items-center gap-2">
                  <Webhook className="w-4 h-4 text-slate-400" />
                  <span>Webhook Notifications</span>
                </div>
                <Switch
                  checked={ruleForm.notifyWebhook}
                  onCheckedChange={(v) => setRuleForm({ ...ruleForm, notifyWebhook: v })}
                />
              </div>
              {ruleForm.notifyWebhook && (
                <div>
                  <Input
                    value={ruleForm.webhookUrl}
                    onChange={(e) => setRuleForm({ ...ruleForm, webhookUrl: e.target.value })}
                    className="bg-slate-700 border-slate-600"
                    placeholder="https://hooks.slack.com/..."
                  />
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowNewRule(false); setShowEditRule(false); setSelectedRule(null); resetRuleForm(); }}>Cancel</Button>
            <Button onClick={showEditRule ? updateRule : createRule} disabled={actionLoading === 'createRule' || actionLoading === 'updateRule' || !ruleForm.name}>
              {(actionLoading === 'createRule' || actionLoading === 'updateRule') && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {showEditRule ? 'Update Rule' : 'Create Rule'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Suppress Dialog */}
      <Dialog open={showSuppressDialog} onOpenChange={setShowSuppressDialog}>
        <DialogContent className="bg-slate-800 border-slate-700">
          <DialogHeader>
            <DialogTitle>Suppress Alert</DialogTitle>
            <DialogDescription>Temporarily suppress this alert</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Suppress Duration (minutes)</Label>
              <Select value={suppressDuration.toString()} onValueChange={(v) => setSuppressDuration(parseInt(v))}>
                <SelectTrigger className="mt-1 bg-slate-700 border-slate-600">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="15">15 minutes</SelectItem>
                  <SelectItem value="30">30 minutes</SelectItem>
                  <SelectItem value="60">1 hour</SelectItem>
                  <SelectItem value="120">2 hours</SelectItem>
                  <SelectItem value="240">4 hours</SelectItem>
                  <SelectItem value="480">8 hours</SelectItem>
                  <SelectItem value="1440">24 hours</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowSuppressDialog(false); setSelectedAlert(null); }}>Cancel</Button>
            <Button onClick={suppressAlert} disabled={actionLoading === 'suppress'}>
              {actionLoading === 'suppress' && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Suppress Alert
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Rule Confirmation */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent className="bg-slate-800 border-slate-700">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Alert Rule?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the rule &quot;{selectedRule?.name}&quot;. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-slate-700 border-slate-600">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={deleteRule} className="bg-red-600 hover:bg-red-700">
              {actionLoading === 'deleteRule' && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
