'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  Database,
  Search,
  Clock,
  Zap,
  TrendingUp,
  RefreshCw,
  ArrowLeft,
  AlertCircle,
  CheckCircle2,
  Play,
  Sparkles,
  ListTree,
  BarChart3,
  Filter,
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

interface QueryStat {
  id: string;
  queryHash: string;
  queryText: string;
  calls: number;
  totalTime: number;
  meanTime: number;
  minTime: number;
  maxTime: number;
  rows: string;
  sharedBlksHit: string;
  sharedBlksRead: string;
  lastSeen: string;
}

interface SlowQuery {
  id: string;
  queryText: string;
  duration: number;
  database: string;
  username: string;
  waitEvent: string | null;
  state: string;
  analyzed: boolean;
  explainPlan?: string;
  suggestions?: string;
  capturedAt: string;
}

interface IndexRecommendation {
  id: string;
  tableName: string;
  columnNames: string;
  indexType: string;
  reason: string;
  estimatedGain: number;
  ddlStatement: string;
  status: string;
}

export default function QueriesPage() {
  const params = useParams();
  const router = useRouter();
  const clusterId = params.id as string;

  const [stats, setStats] = useState<QueryStat[]>([]);
  const [slowQueries, setSlowQueries] = useState<SlowQuery[]>([]);
  const [recommendations, setRecommendations] = useState<IndexRecommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedQuery, setSelectedQuery] = useState<SlowQuery | null>(null);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<string>('meanTime');

  useEffect(() => {
    fetchData();
  }, [clusterId]);

  const fetchData = async () => {
    try {
      const [statsRes, slowRes, recRes] = await Promise.all([
        fetch(`/api/queries?clusterId=${clusterId}&type=stats`),
        fetch(`/api/queries?clusterId=${clusterId}&type=slow`),
        fetch(`/api/queries?clusterId=${clusterId}&type=recommendations`),
      ]);

      if (statsRes.ok) setStats(await statsRes.json());
      if (slowRes.ok) setSlowQueries(await slowRes.json());
      if (recRes.ok) setRecommendations(await recRes.json());
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const refreshStats = async () => {
    setRefreshing(true);
    try {
      await fetch('/api/queries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clusterId, action: 'refresh' }),
      });
      await fetchData();
    } catch (error) {
      console.error('Error refreshing stats:', error);
    } finally {
      setRefreshing(false);
    }
  };

  const analyzeQuery = async (query: SlowQuery) => {
    setSelectedQuery(query);
    setShowAnalysis(true);
    if (query.analyzed) return;

    setAnalyzing(true);
    try {
      const res = await fetch('/api/queries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clusterId, action: 'analyze', queryId: query.id }),
      });
      if (res.ok) {
        const updated = await res.json();
        setSelectedQuery(updated);
        setSlowQueries(slowQueries.map(q => q.id === updated.id ? updated : q));
      }
    } catch (error) {
      console.error('Error analyzing query:', error);
    } finally {
      setAnalyzing(false);
    }
  };

  const applyRecommendation = async (rec: IndexRecommendation) => {
    try {
      const res = await fetch('/api/queries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clusterId, action: 'apply_recommendation', recommendationId: rec.id }),
      });
      if (res.ok) {
        const updated = await res.json();
        setRecommendations(recommendations.map(r => r.id === rec.id ? updated : r));
      }
    } catch (error) {
      console.error('Error applying recommendation:', error);
    }
  };

  const formatDuration = (ms: number) => {
    if (ms < 1) return `${(ms * 1000).toFixed(2)} µs`;
    if (ms < 1000) return `${ms.toFixed(2)} ms`;
    return `${(ms / 1000).toFixed(2)} s`;
  };

  const formatNumber = (n: number | string) => {
    const num = typeof n === 'string' ? parseInt(n) : n;
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  const sortedStats = [...stats]
    .filter(s => searchTerm === '' || s.queryText.toLowerCase().includes(searchTerm.toLowerCase()))
    .sort((a, b) => {
      switch (sortBy) {
        case 'calls': return b.calls - a.calls;
        case 'totalTime': return b.totalTime - a.totalTime;
        case 'meanTime': return b.meanTime - a.meanTime;
        default: return b.meanTime - a.meanTime;
      }
    });

  const totalStats = {
    totalQueries: stats.length,
    totalCalls: stats.reduce((acc, s) => acc + s.calls, 0),
    totalTime: stats.reduce((acc, s) => acc + s.totalTime, 0),
    avgMeanTime: stats.length > 0 ? stats.reduce((acc, s) => acc + s.meanTime, 0) / stats.length : 0,
  };

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
              <Database className="h-6 w-6 text-purple-400" />
              Query Performance
            </h1>
            <p className="text-slate-400">Analyze query patterns, slow queries, and index recommendations</p>
          </div>
        </div>
        <Button onClick={refreshStats} disabled={refreshing}>
          <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh Stats
        </Button>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-400 text-sm">Unique Queries</p>
                <p className="text-2xl font-bold text-white">{totalStats.totalQueries}</p>
              </div>
              <Database className="h-8 w-8 text-purple-400" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-400 text-sm">Total Calls</p>
                <p className="text-2xl font-bold text-blue-400">{formatNumber(totalStats.totalCalls)}</p>
              </div>
              <Zap className="h-8 w-8 text-blue-400" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-400 text-sm">Total Time</p>
                <p className="text-2xl font-bold text-yellow-400">{formatDuration(totalStats.totalTime)}</p>
              </div>
              <Clock className="h-8 w-8 text-yellow-400" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-400 text-sm">Slow Queries</p>
                <p className="text-2xl font-bold text-red-400">{slowQueries.length}</p>
              </div>
              <AlertCircle className="h-8 w-8 text-red-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="stats" className="space-y-4">
        <TabsList className="bg-slate-800">
          <TabsTrigger value="stats" className="data-[state=active]:bg-slate-700">
            <BarChart3 className="h-4 w-4 mr-2" />Query Statistics
          </TabsTrigger>
          <TabsTrigger value="slow" className="data-[state=active]:bg-slate-700">
            <Clock className="h-4 w-4 mr-2" />Slow Queries
          </TabsTrigger>
          <TabsTrigger value="recommendations" className="data-[state=active]:bg-slate-700">
            <TrendingUp className="h-4 w-4 mr-2" />Index Recommendations
          </TabsTrigger>
        </TabsList>

        <TabsContent value="stats" className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search queries..."
                className="pl-10 bg-slate-800 border-slate-700"
              />
            </div>
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-48 bg-slate-800 border-slate-700">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700">
                <SelectItem value="meanTime">Avg Duration</SelectItem>
                <SelectItem value="calls">Total Calls</SelectItem>
                <SelectItem value="totalTime">Total Time</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3">
            {sortedStats.map((stat, idx) => (
              <motion.div
                key={stat.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
              >
                <Card className="bg-slate-800/50 border-slate-700">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <code className="text-sm text-slate-300 font-mono block truncate">
                          {stat.queryText}
                        </code>
                        <div className="flex items-center gap-4 mt-2 text-sm text-slate-400">
                          <span>Hash: {stat.queryHash.slice(0, 8)}</span>
                          <span>Rows: {formatNumber(stat.rows)}</span>
                          <span>Buffer Hit: {formatNumber(stat.sharedBlksHit)}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-6 text-right">
                        <div>
                          <p className="text-xs text-slate-500">Calls</p>
                          <p className="text-lg font-semibold text-blue-400">{formatNumber(stat.calls)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500">Avg Time</p>
                          <p className="text-lg font-semibold text-yellow-400">{formatDuration(stat.meanTime)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500">Total Time</p>
                          <p className="text-lg font-semibold text-purple-400">{formatDuration(stat.totalTime)}</p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="slow" className="space-y-4">
          {slowQueries.length === 0 ? (
            <Card className="bg-slate-800/50 border-slate-700">
              <CardContent className="py-12 text-center">
                <CheckCircle2 className="h-12 w-12 mx-auto text-green-400 mb-4" />
                <p className="text-slate-400">No slow queries detected</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {slowQueries.map((query) => (
                <Card key={query.id} className="bg-slate-800/50 border-slate-700">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <code className="text-sm text-red-300 font-mono block">
                          {query.queryText}
                        </code>
                        <div className="flex items-center gap-4 mt-2 text-sm">
                          <Badge className="text-red-400 border border-red-500/50 bg-transparent">
                            {formatDuration(query.duration)}
                          </Badge>
                          {query.database && <span className="text-slate-400">DB: {query.database}</span>}
                          {query.username && <span className="text-slate-400">User: {query.username}</span>}
                          {query.waitEvent && (
                            <Badge className="bg-yellow-500/20 text-yellow-400">
                              Wait: {query.waitEvent}
                            </Badge>
                          )}
                          {query.analyzed && (
                            <Badge className="bg-green-500/20 text-green-400">Analyzed</Badge>
                          )}
                        </div>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => analyzeQuery(query)}>
                        <Sparkles className="h-4 w-4 mr-2" />
                        {query.analyzed ? 'View Analysis' : 'Analyze'}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="recommendations" className="space-y-4">
          {recommendations.length === 0 ? (
            <Card className="bg-slate-800/50 border-slate-700">
              <CardContent className="py-12 text-center">
                <CheckCircle2 className="h-12 w-12 mx-auto text-green-400 mb-4" />
                <p className="text-slate-400">No index recommendations at this time</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {recommendations.map((rec) => (
                <Card key={rec.id} className="bg-slate-800/50 border-slate-700">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge className="bg-purple-500/20 text-purple-400">
                            {rec.tableName}
                          </Badge>
                          <Badge className="border border-slate-500 bg-transparent">
                            {rec.indexType.toUpperCase()}
                          </Badge>
                          <span className="text-slate-400 text-sm">Columns: {rec.columnNames}</span>
                        </div>
                        <p className="text-slate-300 text-sm mb-2">{rec.reason}</p>
                        <code className="text-xs text-green-400 font-mono bg-slate-900 p-2 rounded block">
                          {rec.ddlStatement}
                        </code>
                        <div className="flex items-center gap-2 mt-2">
                          <span className="text-sm text-slate-400">Estimated improvement:</span>
                          <Progress value={rec.estimatedGain} className="w-32 h-2" />
                          <span className="text-sm text-green-400">{rec.estimatedGain.toFixed(1)}%</span>
                        </div>
                      </div>
                      <div>
                        {rec.status === 'PENDING' ? (
                          <Button size="sm" onClick={() => applyRecommendation(rec)}>
                            <Play className="h-4 w-4 mr-2" />Apply
                          </Button>
                        ) : (
                          <Badge className="bg-green-500/20 text-green-400">Applied</Badge>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={showAnalysis} onOpenChange={setShowAnalysis}>
        <DialogContent className="bg-slate-800 border-slate-700 max-w-3xl">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-purple-400" />
              Query Analysis
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              AI-powered analysis of the slow query
            </DialogDescription>
          </DialogHeader>
          {selectedQuery && (
            <div className="space-y-4">
              <div>
                <Label className="text-slate-300 mb-2 block">Query</Label>
                <code className="text-sm text-red-300 font-mono bg-slate-900 p-3 rounded block">
                  {selectedQuery.queryText}
                </code>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-slate-700/50 p-3 rounded">
                  <p className="text-xs text-slate-500">Duration</p>
                  <p className="text-lg font-semibold text-red-400">{formatDuration(selectedQuery.duration)}</p>
                </div>
                <div className="bg-slate-700/50 p-3 rounded">
                  <p className="text-xs text-slate-500">Database</p>
                  <p className="text-lg font-semibold text-white">{selectedQuery.database || 'N/A'}</p>
                </div>
                <div className="bg-slate-700/50 p-3 rounded">
                  <p className="text-xs text-slate-500">Wait Event</p>
                  <p className="text-lg font-semibold text-yellow-400">{selectedQuery.waitEvent || 'None'}</p>
                </div>
              </div>
              {analyzing ? (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="h-6 w-6 animate-spin text-purple-400 mr-2" />
                  <span className="text-slate-400">Analyzing query...</span>
                </div>
              ) : selectedQuery.analyzed ? (
                <>
                  <div>
                    <Label className="text-slate-300 mb-2 block flex items-center gap-2">
                      <ListTree className="h-4 w-4" />Execution Plan
                    </Label>
                    <pre className="text-xs text-slate-300 font-mono bg-slate-900 p-3 rounded overflow-x-auto">
                      {selectedQuery.explainPlan}
                    </pre>
                  </div>
                  <div>
                    <Label className="text-slate-300 mb-2 block">Optimization Suggestions</Label>
                    <ul className="space-y-2">
                      {selectedQuery.suggestions && JSON.parse(selectedQuery.suggestions).map((s: string, i: number) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                          <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5" />
                          {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                </>
              ) : (
                <p className="text-slate-400 text-center py-4">Click Analyze to get insights</p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAnalysis(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
