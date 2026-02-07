'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Play,
  RefreshCw,
  Loader2,
  Server,
  GitBranch,
  Activity,
  Gauge,
  Settings,
  Save,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';

interface Node {
  id: string;
  name: string;
  role: string;
  status: string;
  routingWeight: number;
  priority: number;
}

interface RoutingConfig {
  id: string;
  clusterId: string;
  readWriteSplit: boolean;
  primaryWeight: number;
  healthThreshold: number;
  lagThreshold: number;
  connectionLimit: number;
}

interface SimulationResult {
  clusterId: string;
  durationSeconds: number;
  loadProfile: string;
  aggregates: {
    totalConnections: number;
    avgLatencyMs: number;
    peakConnections: number;
    readWriteRatio: string;
  };
  timepoints: Array<{
    time: number;
    totalConnections: number;
    reads: number;
    writes: number;
    nodeDistribution: Record<string, {
      name: string;
      role: string;
      connections: number;
      latencyMs: number;
      cpuPercent: number;
      lagMs?: number;
    }>;
  }>;
}

export default function RoutingPage() {
  const params = useParams();
  const router = useRouter();
  const clusterId = params.id as string;

  const [nodes, setNodes] = useState<Node[]>([]);
  const [config, setConfig] = useState<RoutingConfig | null>(null);
  const [simulation, setSimulation] = useState<SimulationResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [simulating, setSimulating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadProfile, setLoadProfile] = useState('normal');
  const [duration, setDuration] = useState(60);
  const [nodeWeights, setNodeWeights] = useState<Record<string, number>>({});
  const [localConfig, setLocalConfig] = useState<Partial<RoutingConfig>>({});

  useEffect(() => {
    fetchData();
  }, [clusterId]);

  async function fetchData() {
    setLoading(true);
    try {
      const res = await fetch(`/api/routing?clusterId=${clusterId}`);
      const data = await res.json();
      setConfig(data.config);
      setLocalConfig(data.config);
      setNodes(data.nodes || []);
      const weights: Record<string, number> = {};
      data.nodes?.forEach((n: Node) => {
        weights[n.id] = n.routingWeight;
      });
      setNodeWeights(weights);
    } catch (error) {
      console.error('Error fetching routing data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function runSimulation() {
    setSimulating(true);
    try {
      const res = await fetch('/api/routing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clusterId,
          action: 'simulate',
          duration,
          loadProfile,
        }),
      });
      const data = await res.json();
      setSimulation(data);
    } catch (error) {
      console.error('Error running simulation:', error);
    } finally {
      setSimulating(false);
    }
  }

  async function saveConfig() {
    setSaving(true);
    try {
      await fetch('/api/routing', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clusterId,
          nodeWeights,
          ...localConfig,
        }),
      });
      fetchData();
    } catch (error) {
      console.error('Error saving config:', error);
    } finally {
      setSaving(false);
    }
  }

  const primary = nodes.find(n => n.role === 'PRIMARY');
  const replicas = nodes.filter(n => n.role === 'REPLICA');
  const totalWeight = replicas.reduce((sum, r) => sum + (nodeWeights[r.id] || r.routingWeight), 0);

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
          <h1 className="text-3xl font-bold text-slate-100">Routing Simulator</h1>
          <p className="mt-1 text-slate-400">Configure and simulate traffic routing</p>
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={runSimulation} disabled={simulating}>
            {simulating ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Play className="h-4 w-4 mr-2" />
            )}
            Run Simulation
          </Button>
          <Button variant="outline" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      <Tabs defaultValue="config">
        <TabsList>
          <TabsTrigger value="config">Configuration</TabsTrigger>
          <TabsTrigger value="weights">Node Weights</TabsTrigger>
          <TabsTrigger value="simulation">Simulation Results</TabsTrigger>
        </TabsList>

        <TabsContent value="config" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5 text-slate-400" />
                  Routing Configuration
                </CardTitle>
                <CardDescription>Configure how traffic is distributed</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Read/Write Split</Label>
                    <p className="text-sm text-slate-400">Route reads to replicas</p>
                  </div>
                  <Switch
                    checked={localConfig.readWriteSplit ?? config?.readWriteSplit}
                    onCheckedChange={v => setLocalConfig({ ...localConfig, readWriteSplit: v })}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Health Threshold (%)</Label>
                  <div className="flex items-center gap-4">
                    <Slider
                      value={[localConfig.healthThreshold ?? config?.healthThreshold ?? 80]}
                      onValueChange={([v]) => setLocalConfig({ ...localConfig, healthThreshold: v })}
                      min={50}
                      max={100}
                      step={5}
                      className="flex-1"
                    />
                    <span className="w-12 text-right text-slate-300">
                      {localConfig.healthThreshold ?? config?.healthThreshold ?? 80}%
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Lag Threshold (ms)</Label>
                  <Input
                    type="number"
                    value={localConfig.lagThreshold ?? config?.lagThreshold ?? 100}
                    onChange={e => setLocalConfig({ ...localConfig, lagThreshold: parseInt(e.target.value) })}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Connection Limit</Label>
                  <Input
                    type="number"
                    value={localConfig.connectionLimit ?? config?.connectionLimit ?? 1000}
                    onChange={e => setLocalConfig({ ...localConfig, connectionLimit: parseInt(e.target.value) })}
                  />
                </div>

                <Button onClick={saveConfig} disabled={saving} className="w-full">
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  Save Configuration
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5 text-slate-400" />
                  Simulation Settings
                </CardTitle>
                <CardDescription>Configure simulation parameters</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label>Load Profile</Label>
                  <Select value={loadProfile} onValueChange={setLoadProfile}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="normal">Normal Load</SelectItem>
                      <SelectItem value="steady">Steady Load</SelectItem>
                      <SelectItem value="spike">Traffic Spike</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Duration (seconds)</Label>
                  <div className="flex items-center gap-4">
                    <Slider
                      value={[duration]}
                      onValueChange={([v]) => setDuration(v)}
                      min={30}
                      max={300}
                      step={30}
                      className="flex-1"
                    />
                    <span className="w-12 text-right text-slate-300">{duration}s</span>
                  </div>
                </div>

                <div className="p-4 bg-slate-800 rounded-lg">
                  <h4 className="font-medium text-slate-200 mb-2">Current Topology</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Primary:</span>
                      <span className="text-slate-200">{primary?.name || 'None'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Replicas:</span>
                      <span className="text-slate-200">{replicas.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Read/Write Split:</span>
                      <span className="text-slate-200">{config?.readWriteSplit ? 'Enabled' : 'Disabled'}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="weights" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Gauge className="h-5 w-5 text-slate-400" />
                Node Routing Weights
              </CardTitle>
              <CardDescription>
                Adjust how traffic is distributed across replicas (0-100)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {primary && (
                <div className="p-4 border border-green-500/30 rounded-lg bg-green-500/10">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Server className="h-5 w-5 text-green-400" />
                      <span className="font-medium text-slate-200">{primary.name}</span>
                      <Badge className="bg-green-500/20 text-green-400">PRIMARY</Badge>
                    </div>
                    <span className="text-sm text-slate-400">All writes routed here</span>
                  </div>
                </div>
              )}

              {replicas.map(replica => (
                <div key={replica.id} className="p-4 border border-slate-700 rounded-lg">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Server className="h-5 w-5 text-blue-400" />
                      <span className="font-medium text-slate-200">{replica.name}</span>
                      <Badge className="bg-blue-500/20 text-blue-400">REPLICA</Badge>
                      <Badge variant="secondary">{replica.status}</Badge>
                    </div>
                    <span className="text-sm text-slate-300">
                      {totalWeight > 0 ? ((nodeWeights[replica.id] || 0) / totalWeight * 100).toFixed(0) : 0}% of reads
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    <Slider
                      value={[nodeWeights[replica.id] ?? replica.routingWeight]}
                      onValueChange={([v]) => setNodeWeights({ ...nodeWeights, [replica.id]: v })}
                      min={0}
                      max={100}
                      step={5}
                      className="flex-1"
                      disabled={replica.status !== 'ONLINE'}
                    />
                    <Input
                      type="number"
                      value={nodeWeights[replica.id] ?? replica.routingWeight}
                      onChange={e => setNodeWeights({ ...nodeWeights, [replica.id]: parseInt(e.target.value) || 0 })}
                      className="w-20"
                      min={0}
                      max={100}
                      disabled={replica.status !== 'ONLINE'}
                    />
                  </div>
                </div>
              ))}

              <Button onClick={saveConfig} disabled={saving} className="w-full">
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Save Weights
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="simulation" className="space-y-6">
          {!simulation ? (
            <Card>
              <CardContent className="py-12">
                <div className="text-center">
                  <GitBranch className="h-12 w-12 text-slate-600 mx-auto mb-3" />
                  <p className="text-slate-400">No simulation results yet</p>
                  <p className="text-sm text-slate-500 mt-1">Run a simulation to see traffic distribution</p>
                  <Button onClick={runSimulation} disabled={simulating} className="mt-4">
                    {simulating ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Play className="h-4 w-4 mr-2" />
                    )}
                    Run Simulation
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Aggregates */}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Card>
                  <CardContent className="p-6">
                    <div className="text-sm text-slate-400">Total Connections</div>
                    <div className="text-2xl font-bold text-slate-100">
                      {simulation.aggregates.totalConnections.toLocaleString()}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-6">
                    <div className="text-sm text-slate-400">Peak Connections</div>
                    <div className="text-2xl font-bold text-slate-100">
                      {simulation.aggregates.peakConnections.toLocaleString()}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-6">
                    <div className="text-sm text-slate-400">Avg Latency</div>
                    <div className="text-2xl font-bold text-slate-100">
                      {simulation.aggregates.avgLatencyMs.toFixed(1)}ms
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-6">
                    <div className="text-sm text-slate-400">Read/Write Ratio</div>
                    <div className="text-2xl font-bold text-slate-100">
                      {simulation.aggregates.readWriteRatio}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Node Distribution */}
              <Card>
                <CardHeader>
                  <CardTitle>Traffic Distribution</CardTitle>
                  <CardDescription>Connection distribution across nodes over time</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {simulation.timepoints.slice(-5).map((tp, index) => (
                      <motion.div
                        key={tp.time}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.1 }}
                        className="p-4 border border-slate-700 rounded-lg"
                      >
                        <div className="flex items-center justify-between mb-3">
                          <span className="font-medium text-slate-200">T+{tp.time}s</span>
                          <div className="flex items-center gap-4 text-sm">
                            <span className="text-green-400">Reads: {tp.reads}</span>
                            <span className="text-orange-400">Writes: {tp.writes}</span>
                          </div>
                        </div>
                        <div className="grid gap-2 md:grid-cols-3">
                          {Object.entries(tp.nodeDistribution).map(([nodeId, data]) => (
                            <div
                              key={nodeId}
                              className={`p-3 rounded-lg ${data.role === 'PRIMARY' ? 'bg-green-500/10 border border-green-500/30' : 'bg-blue-500/10 border border-blue-500/30'}`}
                            >
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-sm font-medium text-slate-200">{data.name}</span>
                                <Badge className={data.role === 'PRIMARY' ? 'bg-green-500/20 text-green-400' : 'bg-blue-500/20 text-blue-400'}>
                                  {data.role}
                                </Badge>
                              </div>
                              <div className="grid grid-cols-2 gap-1 text-xs text-slate-400">
                                <span>Conn: {data.connections}</span>
                                <span>Latency: {data.latencyMs.toFixed(1)}ms</span>
                                <span>CPU: {data.cpuPercent.toFixed(0)}%</span>
                                {data.lagMs !== undefined && <span>Lag: {data.lagMs.toFixed(0)}ms</span>}
                              </div>
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
