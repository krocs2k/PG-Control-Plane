'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Lightbulb,
  RefreshCw,
  Loader2,
  CheckCircle,
  XCircle,
  Play,
  Undo2,
  AlertTriangle,
  Zap,
  ArrowRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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

interface Recommendation {
  id: string;
  clusterId: string;
  type: string;
  title: string;
  description: string;
  impact: string;
  risk: string;
  evidence?: string;
  currentValue?: string;
  proposedValue?: string;
  status: string;
  appliedAt?: string;
  rolledBackAt?: string;
  createdAt: string;
}

interface Cluster {
  id: string;
  name: string;
}

export default function RecommendationsPage() {
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [selectedCluster, setSelectedCluster] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [selectedRec, setSelectedRec] = useState<Recommendation | null>(null);
  const [dialogAction, setDialogAction] = useState<'apply' | 'rollback' | null>(null);

  useEffect(() => {
    fetchClusters();
  }, []);

  useEffect(() => {
    if (selectedCluster) {
      fetchRecommendations();
    }
  }, [selectedCluster, statusFilter]);

  async function fetchClusters() {
    try {
      const res = await fetch('/api/clusters');
      const data = await res.json();
      setClusters(data || []);
      if (data?.length > 0) {
        setSelectedCluster(data[0].id);
      }
    } catch (error) {
      console.error('Error fetching clusters:', error);
    } finally {
      setLoading(false);
    }
  }

  async function fetchRecommendations() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ clusterId: selectedCluster });
      if (statusFilter !== 'all') params.append('status', statusFilter);
      
      const res = await fetch(`/api/ai/recommendations?${params}`);
      const data = await res.json();
      setRecommendations(data || []);
    } catch (error) {
      console.error('Error fetching recommendations:', error);
    } finally {
      setLoading(false);
    }
  }

  async function generateRecommendations() {
    setGenerating(true);
    try {
      // First run anomaly detection to get fresh data
      await fetch(`/api/metrics?clusterId=${selectedCluster}`);
      await fetch('/api/ai/anomalies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clusterId: selectedCluster, action: 'detect' }),
      });
      await fetch('/api/ai/forecasts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clusterId: selectedCluster }),
      });
      
      // Generate recommendations
      await fetch('/api/ai/recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clusterId: selectedCluster, action: 'generate' }),
      });
      
      fetchRecommendations();
    } catch (error) {
      console.error('Error generating recommendations:', error);
    } finally {
      setGenerating(false);
    }
  }

  async function handleAction(id: string, action: string) {
    setActionLoading(id);
    try {
      await fetch('/api/ai/recommendations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action }),
      });
      fetchRecommendations();
    } catch (error) {
      console.error(`Error performing ${action}:`, error);
    } finally {
      setActionLoading(null);
      setDialogAction(null);
      setSelectedRec(null);
    }
  }

  const statusColors: Record<string, string> = {
    PENDING: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    APPROVED: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    APPLIED: 'bg-green-500/20 text-green-400 border-green-500/30',
    ROLLED_BACK: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    REJECTED: 'bg-red-500/20 text-red-400 border-red-500/30',
  };

  const riskColors: Record<string, string> = {
    HIGH: 'text-red-400',
    MEDIUM: 'text-yellow-400',
    LOW: 'text-green-400',
  };

  const pendingCount = recommendations.filter(r => r.status === 'PENDING').length;
  const appliedCount = recommendations.filter(r => r.status === 'APPLIED').length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-100">Recommendations</h1>
          <p className="mt-1 text-slate-400">AI-generated optimization recommendations</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={selectedCluster} onValueChange={setSelectedCluster}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Select cluster" />
            </SelectTrigger>
            <SelectContent>
              {clusters.map(c => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Filter status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="PENDING">Pending</SelectItem>
              <SelectItem value="APPLIED">Applied</SelectItem>
              <SelectItem value="ROLLED_BACK">Rolled Back</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="rounded-lg p-3 bg-yellow-500/10">
                <Lightbulb className="h-6 w-6 text-yellow-400" />
              </div>
              <div>
                <p className="text-sm text-slate-400">Pending Review</p>
                <p className="text-2xl font-bold text-slate-100">{pendingCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="rounded-lg p-3 bg-green-500/10">
                <CheckCircle className="h-6 w-6 text-green-400" />
              </div>
              <div>
                <p className="text-sm text-slate-400">Applied</p>
                <p className="text-2xl font-bold text-slate-100">{appliedCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="rounded-lg p-3 bg-cyan-500/10">
                <Zap className="h-6 w-6 text-cyan-400" />
              </div>
              <div>
                <p className="text-sm text-slate-400">Total</p>
                <p className="text-2xl font-bold text-slate-100">{recommendations.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <Button onClick={generateRecommendations} disabled={generating || !selectedCluster}>
          {generating ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Zap className="h-4 w-4 mr-2" />
          )}
          Generate Recommendations
        </Button>
        <Button variant="outline" onClick={fetchRecommendations} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Recommendations List */}
      <Card>
        <CardHeader>
          <CardTitle>Recommendations</CardTitle>
          <CardDescription>Review and apply AI-generated recommendations</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-cyan-500" />
            </div>
          ) : recommendations.length === 0 ? (
            <div className="text-center py-12">
              <Lightbulb className="h-12 w-12 text-slate-600 mx-auto mb-3" />
              <p className="text-slate-400">No recommendations found</p>
              <p className="text-sm text-slate-500 mt-1">Generate recommendations to get optimization suggestions</p>
            </div>
          ) : (
            <div className="space-y-4">
              {recommendations.map((rec, index) => (
                <motion.div
                  key={rec.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.03 }}
                  className="p-4 border border-slate-700 rounded-lg hover:border-slate-600 transition-colors"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-slate-200">{rec.title}</span>
                        <Badge className={statusColors[rec.status]}>{rec.status}</Badge>
                        <span className={`text-sm ${riskColors[rec.risk]}`}>{rec.risk} Risk</span>
                      </div>
                      <p className="text-sm text-slate-400">{rec.description}</p>
                    </div>
                  </div>

                  {(rec.currentValue || rec.proposedValue) && (
                    <div className="flex items-center gap-3 mb-3 text-sm">
                      {rec.currentValue && (
                        <span className="px-2 py-1 rounded bg-slate-800 text-slate-300">
                          Current: {rec.currentValue}
                        </span>
                      )}
                      {rec.currentValue && rec.proposedValue && (
                        <ArrowRight className="h-4 w-4 text-slate-500" />
                      )}
                      {rec.proposedValue && (
                        <span className="px-2 py-1 rounded bg-cyan-500/10 text-cyan-400">
                          Proposed: {rec.proposedValue}
                        </span>
                      )}
                    </div>
                  )}

                  <div className="p-3 rounded bg-slate-800/50 mb-3">
                    <p className="text-sm text-slate-400">
                      <span className="text-slate-300 font-medium">Impact: </span>
                      {rec.impact}
                    </p>
                  </div>

                  <div className="flex gap-2">
                    {rec.status === 'PENDING' && (
                      <>
                        <Button
                          size="sm"
                          onClick={() => {
                            setSelectedRec(rec);
                            setDialogAction('apply');
                          }}
                          disabled={actionLoading === rec.id}
                        >
                          {actionLoading === rec.id ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-1" />
                          ) : (
                            <Play className="h-4 w-4 mr-1" />
                          )}
                          Apply
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleAction(rec.id, 'reject')}
                          disabled={actionLoading === rec.id}
                        >
                          <XCircle className="h-4 w-4 mr-1" />
                          Reject
                        </Button>
                      </>
                    )}
                    {rec.status === 'APPLIED' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSelectedRec(rec);
                          setDialogAction('rollback');
                        }}
                        disabled={actionLoading === rec.id}
                      >
                        <Undo2 className="h-4 w-4 mr-1" />
                        Rollback
                      </Button>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Confirmation Dialog */}
      <Dialog open={!!dialogAction} onOpenChange={() => setDialogAction(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialogAction === 'apply' ? 'Apply Recommendation' : 'Rollback Change'}
            </DialogTitle>
            <DialogDescription>
              {dialogAction === 'apply'
                ? 'This will apply the recommended change to your cluster configuration.'
                : 'This will revert the applied change back to the previous configuration.'}
            </DialogDescription>
          </DialogHeader>
          {selectedRec && (
            <div className="py-4">
              <p className="font-medium text-slate-200 mb-2">{selectedRec.title}</p>
              <p className="text-sm text-slate-400">{selectedRec.description}</p>
              {selectedRec.risk === 'HIGH' && (
                <div className="mt-4 p-3 rounded bg-red-500/10 border border-red-500/30">
                  <div className="flex items-center gap-2 text-red-400">
                    <AlertTriangle className="h-4 w-4" />
                    <span className="text-sm font-medium">High Risk Change</span>
                  </div>
                  <p className="text-sm text-red-300 mt-1">
                    This change has been identified as high risk. Proceed with caution.
                  </p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogAction(null)}>
              Cancel
            </Button>
            <Button
              variant={dialogAction === 'rollback' ? 'destructive' : 'default'}
              onClick={() => selectedRec && handleAction(selectedRec.id, dialogAction!)}
              disabled={actionLoading === selectedRec?.id}
            >
              {actionLoading === selectedRec?.id && (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              )}
              {dialogAction === 'apply' ? 'Apply Change' : 'Confirm Rollback'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
