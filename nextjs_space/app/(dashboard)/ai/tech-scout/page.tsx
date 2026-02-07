'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Telescope, ArrowUpCircle, Puzzle, Settings, Route, Building2,
  Loader2, TrendingUp, AlertTriangle, CheckCircle, Clock, Zap
} from 'lucide-react';

interface Cluster {
  id: string;
  name: string;
}

export default function TechScoutPage() {
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [selectedCluster, setSelectedCluster] = useState<string>('none');
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('version');
  
  const [currentVersion, setCurrentVersion] = useState('14.x');
  const [workloadType, setWorkloadType] = useState('mixed');
  
  const [results, setResults] = useState<Record<string, any>>({});

  useEffect(() => {
    fetch('/api/clusters')
      .then(res => res.json())
      .then(data => setClusters(data))
      .catch(console.error);
  }, []);

  const runAction = async (action: string) => {
    setLoading(true);
    try {
      const response = await fetch('/api/ai/tech-scout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          clusterId: selectedCluster !== 'none' ? selectedCluster : undefined,
          currentVersion,
          workloadType,
        }),
      });
      
      if (!response.ok) throw new Error('Request failed');
      const result = await response.json();
      setResults(prev => ({ ...prev, [action]: result }));
    } catch (error) {
      console.error('Tech Scout error:', error);
    } finally {
      setLoading(false);
    }
  };

  const urgencyColor = (urgency: string) => {
    switch (urgency) {
      case 'critical': return 'bg-red-500/20 text-red-400 border-red-500/30';
      case 'high': return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
      case 'medium': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      case 'low': return 'bg-green-500/20 text-green-400 border-green-500/30';
      default: return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
    }
  };

  const maturityColor = (maturity: string) => {
    switch (maturity?.toLowerCase()) {
      case 'stable': return 'bg-green-500/20 text-green-400';
      case 'mature': return 'bg-blue-500/20 text-blue-400';
      case 'emerging': return 'bg-yellow-500/20 text-yellow-400';
      case 'experimental': return 'bg-orange-500/20 text-orange-400';
      default: return 'bg-slate-500/20 text-slate-400';
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Telescope className="h-7 w-7 text-indigo-400" />
            Tech Scout
          </h1>
          <p className="text-slate-400 mt-1">Version recommendations, extensions, and technology trends</p>
        </div>
        <div className="flex gap-2">
          <Select value={selectedCluster} onValueChange={setSelectedCluster}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select cluster" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">All clusters</SelectItem>
              {clusters.map(c => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex gap-4 items-center bg-slate-800 p-4 rounded-lg border border-slate-700">
        <div className="flex items-center gap-2">
          <span className="text-slate-400 text-sm">Current Version:</span>
          <Select value={currentVersion} onValueChange={setCurrentVersion}>
            <SelectTrigger className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="12.x">PG 12.x</SelectItem>
              <SelectItem value="13.x">PG 13.x</SelectItem>
              <SelectItem value="14.x">PG 14.x</SelectItem>
              <SelectItem value="15.x">PG 15.x</SelectItem>
              <SelectItem value="16.x">PG 16.x</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-slate-400 text-sm">Workload:</span>
          <Select value={workloadType} onValueChange={setWorkloadType}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="oltp">OLTP</SelectItem>
              <SelectItem value="olap">OLAP</SelectItem>
              <SelectItem value="mixed">Mixed</SelectItem>
              <SelectItem value="timeseries">Time Series</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-slate-800">
          <TabsTrigger value="version" className="data-[state=active]:bg-indigo-600">
            <ArrowUpCircle className="h-4 w-4 mr-2" /> Version
          </TabsTrigger>
          <TabsTrigger value="extensions" className="data-[state=active]:bg-indigo-600">
            <Puzzle className="h-4 w-4 mr-2" /> Extensions
          </TabsTrigger>
          <TabsTrigger value="config" className="data-[state=active]:bg-indigo-600">
            <Settings className="h-4 w-4 mr-2" /> Config
          </TabsTrigger>
          <TabsTrigger value="upgrade" className="data-[state=active]:bg-indigo-600">
            <Route className="h-4 w-4 mr-2" /> Upgrade Path
          </TabsTrigger>
          <TabsTrigger value="architecture" className="data-[state=active]:bg-indigo-600">
            <Building2 className="h-4 w-4 mr-2" /> Architecture
          </TabsTrigger>
          <TabsTrigger value="trends" className="data-[state=active]:bg-indigo-600">
            <TrendingUp className="h-4 w-4 mr-2" /> Trends
          </TabsTrigger>
        </TabsList>

        <TabsContent value="version" className="space-y-4 mt-4">
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
              <CardTitle className="text-lg">PostgreSQL Version Analysis</CardTitle>
              <CardDescription>Get upgrade recommendations based on your current setup</CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => runAction('version_recommendations')} disabled={loading} className="bg-indigo-600 hover:bg-indigo-700">
                {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ArrowUpCircle className="h-4 w-4 mr-2" />}
                Analyze Versions
              </Button>
            </CardContent>
          </Card>

          {results.version_recommendations && (
            <Card className="bg-slate-800 border-slate-700">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Version Recommendations</CardTitle>
                  {results.version_recommendations.upgradeUrgency && (
                    <Badge className={urgencyColor(results.version_recommendations.upgradeUrgency)}>
                      {results.version_recommendations.upgradeUrgency} urgency
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-900 p-4 rounded">
                    <span className="text-slate-400 text-sm">Current Version</span>
                    <div className="text-xl font-bold text-white">
                      {results.version_recommendations.currentVersion || currentVersion}
                    </div>
                  </div>
                  <div className="bg-slate-900 p-4 rounded">
                    <span className="text-slate-400 text-sm">Recommended Version</span>
                    <div className="text-xl font-bold text-green-400">
                      {results.version_recommendations.recommendedVersion || 'Latest'}
                    </div>
                  </div>
                </div>
                
                {results.version_recommendations.newFeatures?.length > 0 && (
                  <div>
                    <h4 className="font-medium text-white mb-2 flex items-center gap-2">
                      <Zap className="h-4 w-4 text-yellow-400" /> New Features
                    </h4>
                    <ul className="space-y-1">
                      {results.version_recommendations.newFeatures.map((f: string, idx: number) => (
                        <li key={idx} className="text-slate-300 text-sm">• {f}</li>
                      ))}
                    </ul>
                  </div>
                )}
                
                {results.version_recommendations.securityFixes?.length > 0 && (
                  <div>
                    <h4 className="font-medium text-white mb-2 flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-red-400" /> Security Fixes
                    </h4>
                    <ul className="space-y-1">
                      {results.version_recommendations.securityFixes.map((f: string, idx: number) => (
                        <li key={idx} className="text-red-300 text-sm">• {f}</li>
                      ))}
                    </ul>
                  </div>
                )}
                
                {results.version_recommendations.summary && (
                  <p className="text-slate-300">{results.version_recommendations.summary}</p>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="extensions" className="space-y-4 mt-4">
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
              <CardTitle className="text-lg">Extension Recommendations</CardTitle>
              <CardDescription>Discover useful PostgreSQL extensions for your workload</CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => runAction('extension_suggestions')} disabled={loading} className="bg-indigo-600 hover:bg-indigo-700">
                {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Puzzle className="h-4 w-4 mr-2" />}
                Suggest Extensions
              </Button>
            </CardContent>
          </Card>

          {results.extension_suggestions && (
            <Card className="bg-slate-800 border-slate-700">
              <CardHeader>
                <CardTitle>Recommended Extensions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {results.extension_suggestions.recommended?.length > 0 && (
                  <div className="grid gap-3">
                    {results.extension_suggestions.recommended.map((ext: any, idx: number) => (
                      <div key={idx} className="bg-slate-900 p-4 rounded border border-slate-700">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <Puzzle className="h-4 w-4 text-indigo-400" />
                            <span className="font-medium text-white">{ext.name}</span>
                            {ext.version && <span className="text-slate-500 text-sm">v{ext.version}</span>}
                          </div>
                          <Badge variant="secondary" className="text-slate-300">{ext.category}</Badge>
                        </div>
                        <p className="text-slate-400 text-sm">{ext.useCase}</p>
                        {ext.installCommand && (
                          <pre className="bg-slate-950 p-2 rounded mt-2 text-xs text-cyan-400 overflow-x-auto">
                            {ext.installCommand}
                          </pre>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {results.extension_suggestions.summary && (
                  <p className="text-slate-300">{results.extension_suggestions.summary}</p>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="config" className="space-y-4 mt-4">
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
              <CardTitle className="text-lg">Configuration Optimization</CardTitle>
              <CardDescription>Get tuning recommendations for your PostgreSQL setup</CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => runAction('config_optimization')} disabled={loading} className="bg-indigo-600 hover:bg-indigo-700">
                {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Settings className="h-4 w-4 mr-2" />}
                Optimize Config
              </Button>
            </CardContent>
          </Card>

          {results.config_optimization && (
            <Card className="bg-slate-800 border-slate-700">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Configuration Recommendations</CardTitle>
                  {results.config_optimization.estimatedImprovement && (
                    <Badge className="bg-green-500/20 text-green-400">
                      {results.config_optimization.estimatedImprovement} improvement
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {results.config_optimization.recommendations?.length > 0 && (
                  <div className="space-y-3">
                    {results.config_optimization.recommendations.map((rec: any, idx: number) => (
                      <div key={idx} className="bg-slate-900 p-4 rounded border border-slate-700">
                        <div className="flex items-center justify-between mb-2">
                          <code className="text-cyan-400 font-mono">{rec.parameter}</code>
                          <Badge className="bg-indigo-500/20 text-indigo-400">{rec.impact}</Badge>
                        </div>
                        <div className="grid grid-cols-2 gap-4 text-sm mb-2">
                          <div>
                            <span className="text-slate-500">Current: </span>
                            <span className="text-slate-300">{rec.currentValue || 'default'}</span>
                          </div>
                          <div>
                            <span className="text-slate-500">Recommended: </span>
                            <span className="text-green-400 font-medium">{rec.recommendedValue}</span>
                          </div>
                        </div>
                        <p className="text-slate-400 text-sm">{rec.explanation}</p>
                      </div>
                    ))}
                  </div>
                )}
                {results.config_optimization.warnings?.length > 0 && (
                  <div className="bg-yellow-500/10 p-3 rounded border border-yellow-500/30">
                    <h4 className="font-medium text-yellow-400 flex items-center gap-2 mb-2">
                      <AlertTriangle className="h-4 w-4" /> Warnings
                    </h4>
                    <ul className="space-y-1">
                      {results.config_optimization.warnings.map((w: string, idx: number) => (
                        <li key={idx} className="text-yellow-300 text-sm">• {w}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="upgrade" className="space-y-4 mt-4">
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
              <CardTitle className="text-lg">Upgrade Path Planning</CardTitle>
              <CardDescription>Get a detailed upgrade plan with minimal downtime</CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => runAction('upgrade_path')} disabled={loading} className="bg-indigo-600 hover:bg-indigo-700">
                {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Route className="h-4 w-4 mr-2" />}
                Plan Upgrade
              </Button>
            </CardContent>
          </Card>

          {results.upgrade_path && (
            <Card className="bg-slate-800 border-slate-700">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Upgrade Plan</CardTitle>
                  {results.upgrade_path.estimatedDowntime && (
                    <Badge className="bg-slate-600">
                      <Clock className="h-3 w-3 mr-1" />
                      {results.upgrade_path.estimatedDowntime} downtime
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-4 text-lg">
                  <span className="text-slate-400">{results.upgrade_path.fromVersion || currentVersion}</span>
                  <span className="text-slate-500">→</span>
                  <span className="text-green-400 font-bold">{results.upgrade_path.toVersion || 'Latest'}</span>
                </div>
                
                {results.upgrade_path.phases?.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="font-medium text-white">Upgrade Phases</h4>
                    {results.upgrade_path.phases.map((phase: any, idx: number) => (
                      <div key={idx} className="bg-slate-900 p-4 rounded border border-slate-700">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium text-white">
                            Phase {idx + 1}: {phase.phase}
                          </span>
                          {phase.duration && (
                            <span className="text-slate-400 text-sm">{phase.duration}</span>
                          )}
                        </div>
                        {phase.steps?.length > 0 && (
                          <ol className="list-decimal list-inside space-y-1">
                            {phase.steps.map((step: string, sIdx: number) => (
                              <li key={sIdx} className="text-slate-300 text-sm">{step}</li>
                            ))}
                          </ol>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                
                {results.upgrade_path.summary && (
                  <p className="text-slate-300">{results.upgrade_path.summary}</p>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="architecture" className="space-y-4 mt-4">
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
              <CardTitle className="text-lg">Architecture Review</CardTitle>
              <CardDescription>Analyze your cluster architecture and get improvement suggestions</CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => runAction('architecture_review')} disabled={loading} className="bg-indigo-600 hover:bg-indigo-700">
                {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Building2 className="h-4 w-4 mr-2" />}
                Review Architecture
              </Button>
            </CardContent>
          </Card>

          {results.architecture_review && (
            <Card className="bg-slate-800 border-slate-700">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Architecture Assessment</CardTitle>
                  {results.architecture_review.score !== undefined && (
                    <div className="text-2xl font-bold text-white">
                      {results.architecture_review.score}<span className="text-sm text-slate-400">/100</span>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  {results.architecture_review.strengths?.length > 0 && (
                    <div>
                      <h4 className="font-medium text-green-400 flex items-center gap-2 mb-2">
                        <CheckCircle className="h-4 w-4" /> Strengths
                      </h4>
                      <ul className="space-y-1">
                        {results.architecture_review.strengths.map((s: string, idx: number) => (
                          <li key={idx} className="text-slate-300 text-sm">• {s}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {results.architecture_review.weaknesses?.length > 0 && (
                    <div>
                      <h4 className="font-medium text-red-400 flex items-center gap-2 mb-2">
                        <AlertTriangle className="h-4 w-4" /> Weaknesses
                      </h4>
                      <ul className="space-y-1">
                        {results.architecture_review.weaknesses.map((w: string, idx: number) => (
                          <li key={idx} className="text-slate-300 text-sm">• {w}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
                
                {results.architecture_review.recommendations?.length > 0 && (
                  <div>
                    <h4 className="font-medium text-white mb-2">Recommendations</h4>
                    {results.architecture_review.recommendations.map((rec: any, idx: number) => (
                      <div key={idx} className="bg-slate-900 p-3 rounded border border-slate-700 mb-2">
                        <div className="flex justify-between items-start">
                          <span className="font-medium text-white">{rec.area}</span>
                          <div className="flex gap-2">
                            {rec.effort && <Badge variant="secondary">{rec.effort} effort</Badge>}
                            {rec.impact && <Badge className="bg-indigo-500/20 text-indigo-400">{rec.impact} impact</Badge>}
                          </div>
                        </div>
                        <p className="text-slate-400 text-sm mt-1">{rec.suggested}</p>
                      </div>
                    ))}
                  </div>
                )}
                
                {results.architecture_review.summary && (
                  <p className="text-slate-300">{results.architecture_review.summary}</p>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="trends" className="space-y-4 mt-4">
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
              <CardTitle className="text-lg">Technology Trends</CardTitle>
              <CardDescription>Stay updated with PostgreSQL ecosystem developments</CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => runAction('technology_trends')} disabled={loading} className="bg-indigo-600 hover:bg-indigo-700">
                {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <TrendingUp className="h-4 w-4 mr-2" />}
                Explore Trends
              </Button>
            </CardContent>
          </Card>

          {results.technology_trends && (
            <Card className="bg-slate-800 border-slate-700">
              <CardHeader>
                <CardTitle>Technology Trends & Insights</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {results.technology_trends.trends?.length > 0 && (
                  <div>
                    <h4 className="font-medium text-white mb-3">Industry Trends</h4>
                    <div className="grid gap-3">
                      {results.technology_trends.trends.map((trend: any, idx: number) => (
                        <div key={idx} className="bg-slate-900 p-4 rounded border border-slate-700">
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-medium text-white">{trend.name}</span>
                            <div className="flex gap-2">
                              {trend.adoptionLevel && (
                                <Badge variant="secondary" className="text-slate-300">
                                  {trend.adoptionLevel} adoption
                                </Badge>
                              )}
                              {trend.timeframe && (
                                <Badge className="bg-slate-600">{trend.timeframe}</Badge>
                              )}
                            </div>
                          </div>
                          <p className="text-slate-400 text-sm">{trend.description}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {results.technology_trends.emergingTools?.length > 0 && (
                  <div>
                    <h4 className="font-medium text-white mb-3">Emerging Tools</h4>
                    <div className="grid grid-cols-2 gap-3">
                      {results.technology_trends.emergingTools.map((tool: any, idx: number) => (
                        <div key={idx} className="bg-slate-900 p-3 rounded border border-slate-700">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-medium text-white">{tool.name}</span>
                            {tool.maturity && (
                              <Badge className={maturityColor(tool.maturity)}>{tool.maturity}</Badge>
                            )}
                          </div>
                          <Badge variant="secondary" className="text-slate-400 text-xs mb-1">{tool.category}</Badge>
                          <p className="text-slate-400 text-sm">{tool.description}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {results.technology_trends.actionItems?.length > 0 && (
                  <div className="bg-indigo-500/10 p-4 rounded border border-indigo-500/30">
                    <h4 className="font-medium text-indigo-400 mb-2">Recommended Actions</h4>
                    <ul className="space-y-1">
                      {results.technology_trends.actionItems.map((item: string, idx: number) => (
                        <li key={idx} className="text-slate-300 text-sm">• {item}</li>
                      ))}
                    </ul>
                  </div>
                )}
                
                {results.technology_trends.summary && (
                  <p className="text-slate-300">{results.technology_trends.summary}</p>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
