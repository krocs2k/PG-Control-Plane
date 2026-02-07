'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  TrendingUp,
  RefreshCw,
  Loader2,
  CheckCircle,
  Clock,
  Zap,
  HardDrive,
  Cpu,
  Network,
  Activity,
  ChevronDown,
  ChevronUp,
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

interface Anomaly {
  id: string;
  clusterId: string;
  nodeId?: string;
  type: string;
  severity: string;
  title: string;
  description: string;
  metricValue?: number;
  threshold?: number;
  resolved: boolean;
  createdAt: string;
}

interface Forecast {
  id: string;
  clusterId: string;
  metricType: string;
  currentValue: number;
  predictedValue: number;
  predictedAt: string;
  confidence: number;
  riskLevel: string;
  description: string;
  createdAt: string;
}

interface Cluster {
  id: string;
  name: string;
}

export default function AIInsightsPage() {
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [forecasts, setForecasts] = useState<Forecast[]>([]);
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [selectedCluster, setSelectedCluster] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [detecting, setDetecting] = useState(false);
  const [forecasting, setForecasting] = useState(false);
  const [expandedAnomaly, setExpandedAnomaly] = useState<string | null>(null);

  useEffect(() => {
    fetchClusters();
  }, []);

  useEffect(() => {
    if (selectedCluster) {
      fetchData();
    }
  }, [selectedCluster]);

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

  async function fetchData() {
    setLoading(true);
    try {
      const [anomalyRes, forecastRes] = await Promise.all([
        fetch(`/api/ai/anomalies?clusterId=${selectedCluster}`),
        fetch(`/api/ai/forecasts?clusterId=${selectedCluster}`),
      ]);
      const anomalyData = await anomalyRes.json();
      const forecastData = await forecastRes.json();
      setAnomalies(anomalyData || []);
      setForecasts(forecastData || []);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function runDetection() {
    setDetecting(true);
    try {
      // First ensure metrics exist
      await fetch(`/api/metrics?clusterId=${selectedCluster}`);
      
      const res = await fetch('/api/ai/anomalies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clusterId: selectedCluster, action: 'detect' }),
      });
      const data = await res.json();
      if (data.detected > 0) {
        fetchData();
      }
    } catch (error) {
      console.error('Error running detection:', error);
    } finally {
      setDetecting(false);
    }
  }

  async function runForecasting() {
    setForecasting(true);
    try {
      // First ensure metrics exist
      await fetch(`/api/metrics?clusterId=${selectedCluster}`);
      
      await fetch('/api/ai/forecasts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clusterId: selectedCluster }),
      });
      fetchData();
    } catch (error) {
      console.error('Error running forecasting:', error);
    } finally {
      setForecasting(false);
    }
  }

  async function resolveAnomaly(id: string) {
    try {
      await fetch('/api/ai/anomalies', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, resolved: true }),
      });
      setAnomalies(prev => prev.map(a => a.id === id ? { ...a, resolved: true } : a));
    } catch (error) {
      console.error('Error resolving anomaly:', error);
    }
  }

  const severityColors: Record<string, string> = {
    CRITICAL: 'bg-red-500/20 text-red-400 border-red-500/30',
    HIGH: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    MEDIUM: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    LOW: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  };

  const riskColors: Record<string, string> = {
    HIGH: 'bg-red-500/20 text-red-400',
    MEDIUM: 'bg-yellow-500/20 text-yellow-400',
    LOW: 'bg-green-500/20 text-green-400',
  };

  const typeIcons: Record<string, any> = {
    LAG_SPIKE: Activity,
    LATENCY_ANOMALY: Clock,
    DISK_PRESSURE: HardDrive,
    CPU_SPIKE: Cpu,
    CONNECTION_SURGE: Network,
    WAL_GROWTH: Zap,
  };

  const activeAnomalies = anomalies.filter(a => !a.resolved);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-100">AI Insights</h1>
          <p className="mt-1 text-slate-400">Anomaly detection and predictive forecasting</p>
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
          <Button variant="outline" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="rounded-lg p-3 bg-red-500/10">
                <AlertTriangle className="h-6 w-6 text-red-400" />
              </div>
              <div>
                <p className="text-sm text-slate-400">Active Anomalies</p>
                <p className="text-2xl font-bold text-slate-100">{activeAnomalies.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="rounded-lg p-3 bg-orange-500/10">
                <Zap className="h-6 w-6 text-orange-400" />
              </div>
              <div>
                <p className="text-sm text-slate-400">Critical/High</p>
                <p className="text-2xl font-bold text-slate-100">
                  {activeAnomalies.filter(a => a.severity === 'CRITICAL' || a.severity === 'HIGH').length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="rounded-lg p-3 bg-purple-500/10">
                <TrendingUp className="h-6 w-6 text-purple-400" />
              </div>
              <div>
                <p className="text-sm text-slate-400">Forecasts</p>
                <p className="text-2xl font-bold text-slate-100">{forecasts.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="rounded-lg p-3 bg-cyan-500/10">
                <CheckCircle className="h-6 w-6 text-cyan-400" />
              </div>
              <div>
                <p className="text-sm text-slate-400">High Risk Forecasts</p>
                <p className="text-2xl font-bold text-slate-100">
                  {forecasts.filter(f => f.riskLevel === 'HIGH').length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Anomalies Section */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-red-400" />
                  Detected Anomalies
                </CardTitle>
                <CardDescription>Real-time anomaly detection</CardDescription>
              </div>
              <Button onClick={runDetection} disabled={detecting || !selectedCluster}>
                {detecting ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Zap className="h-4 w-4 mr-2" />
                )}
                Run Detection
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {activeAnomalies.length === 0 ? (
              <div className="text-center py-8">
                <CheckCircle className="h-12 w-12 text-green-400 mx-auto mb-3" />
                <p className="text-slate-400">No active anomalies detected</p>
                <p className="text-sm text-slate-500 mt-1">Run detection to scan for issues</p>
              </div>
            ) : (
              <div className="space-y-3">
                {activeAnomalies.map((anomaly, index) => {
                  const Icon = typeIcons[anomaly.type] || AlertTriangle;
                  const isExpanded = expandedAnomaly === anomaly.id;
                  return (
                    <motion.div
                      key={anomaly.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className="border border-slate-700 rounded-lg overflow-hidden"
                    >
                      <div
                        className="p-4 cursor-pointer hover:bg-slate-800/50 transition-colors"
                        onClick={() => setExpandedAnomaly(isExpanded ? null : anomaly.id)}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-start gap-3">
                            <div className={`rounded-lg p-2 ${severityColors[anomaly.severity]?.split(' ')[0] || 'bg-slate-700'}`}>
                              <Icon className="h-5 w-5" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-slate-200">{anomaly.title}</span>
                                <Badge className={severityColors[anomaly.severity]}>
                                  {anomaly.severity}
                                </Badge>
                              </div>
                              <p className="text-sm text-slate-400 mt-1">
                                {new Date(anomaly.createdAt).toLocaleString()}
                              </p>
                            </div>
                          </div>
                          {isExpanded ? (
                            <ChevronUp className="h-5 w-5 text-slate-400" />
                          ) : (
                            <ChevronDown className="h-5 w-5 text-slate-400" />
                          )}
                        </div>
                      </div>
                      {isExpanded && (
                        <div className="px-4 pb-4 border-t border-slate-700 pt-3">
                          <p className="text-sm text-slate-300">{anomaly.description}</p>
                          {anomaly.metricValue && (
                            <p className="text-sm text-slate-400 mt-2">
                              Current: <span className="text-slate-200">{anomaly.metricValue.toFixed(2)}</span>
                              {anomaly.threshold && (
                                <> | Threshold: <span className="text-slate-200">{anomaly.threshold}</span></>
                              )}
                            </p>
                          )}
                          <div className="mt-3 flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={(e) => {
                                e.stopPropagation();
                                resolveAnomaly(anomaly.id);
                              }}
                            >
                              <CheckCircle className="h-4 w-4 mr-1" />
                              Resolve
                            </Button>
                          </div>
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Forecasts Section */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-purple-400" />
                  Predictive Forecasts
                </CardTitle>
                <CardDescription>AI-powered predictions</CardDescription>
              </div>
              <Button onClick={runForecasting} disabled={forecasting || !selectedCluster}>
                {forecasting ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <TrendingUp className="h-4 w-4 mr-2" />
                )}
                Generate
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {forecasts.length === 0 ? (
              <div className="text-center py-8">
                <TrendingUp className="h-12 w-12 text-slate-600 mx-auto mb-3" />
                <p className="text-slate-400">No forecasts available</p>
                <p className="text-sm text-slate-500 mt-1">Generate forecasts to predict future trends</p>
              </div>
            ) : (
              <div className="space-y-3">
                {forecasts.slice(0, 6).map((forecast, index) => (
                  <motion.div
                    key={forecast.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="p-4 border border-slate-700 rounded-lg hover:border-slate-600 transition-colors"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <span className="font-medium text-slate-200 capitalize">
                        {forecast.metricType.replace(/_/g, ' ')}
                      </span>
                      <Badge className={riskColors[forecast.riskLevel]}>
                        {forecast.riskLevel} Risk
                      </Badge>
                    </div>
                    <p className="text-sm text-slate-400">{forecast.description}</p>
                    <div className="mt-3 flex items-center gap-4 text-sm">
                      <span className="text-slate-500">
                        Current: <span className="text-slate-300">{forecast.currentValue.toFixed(1)}</span>
                      </span>
                      <span className="text-slate-500">
                        Predicted: <span className="text-slate-300">{forecast.predictedValue.toFixed(1)}</span>
                      </span>
                      <span className="text-slate-500">
                        Confidence: <span className="text-slate-300">{(forecast.confidence * 100).toFixed(0)}%</span>
                      </span>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
