'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  TestTube2, Play, Code, AlertTriangle, CheckCircle, 
  Loader2, ClipboardList, Zap, RefreshCw, Database
} from 'lucide-react';

interface Cluster {
  id: string;
  name: string;
}

interface TestCase {
  id: string;
  category: string;
  name: string;
  description: string;
  sql?: string;
  expectedOutcome: string;
  priority: 'high' | 'medium' | 'low';
}

interface Scenario {
  id: string;
  name: string;
  category: string;
  steps: string[];
  expectedBehavior: string;
  rollbackPlan: string;
  riskLevel: 'low' | 'medium' | 'high';
}

export default function QACopilotPage() {
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [selectedCluster, setSelectedCluster] = useState<string>('none');
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('tests');
  
  const [tests, setTests] = useState<TestCase[]>([]);
  const [testContext, setTestContext] = useState('');
  
  const [queryInput, setQueryInput] = useState('');
  const [queryAnalysis, setQueryAnalysis] = useState<any>(null);
  
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [scenarioContext, setScenarioContext] = useState('');
  
  const [configValidation, setConfigValidation] = useState<any>(null);

  useEffect(() => {
    fetch('/api/clusters')
      .then(res => res.json())
      .then(data => setClusters(data))
      .catch(console.error);
  }, []);

  const runAction = async (action: string, extraData: any = {}) => {
    setLoading(true);
    try {
      const response = await fetch('/api/ai/qa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          clusterId: selectedCluster !== 'none' ? selectedCluster : undefined,
          ...extraData,
        }),
      });
      
      if (!response.ok) throw new Error('Request failed');
      return await response.json();
    } catch (error) {
      console.error('QA action error:', error);
      return null;
    } finally {
      setLoading(false);
    }
  };

  const generateTests = async () => {
    const result = await runAction('generate_tests', { context: testContext });
    if (result?.tests) setTests(result.tests);
  };

  const analyzeQuery = async () => {
    if (!queryInput.trim()) return;
    const result = await runAction('analyze_query', { query: queryInput });
    if (result) setQueryAnalysis(result);
  };

  const generateScenarios = async () => {
    const result = await runAction('suggest_scenarios', { context: scenarioContext });
    if (result?.scenarios) setScenarios(result.scenarios);
  };

  const validateConfig = async () => {
    const result = await runAction('validate_config');
    if (result) setConfigValidation(result);
  };

  const priorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'bg-red-500/20 text-red-400';
      case 'medium': return 'bg-yellow-500/20 text-yellow-400';
      case 'low': return 'bg-green-500/20 text-green-400';
      default: return 'bg-slate-500/20 text-slate-400';
    }
  };

  const riskColor = (risk: string) => {
    switch (risk) {
      case 'high': return 'bg-red-500/20 text-red-400 border-red-500/30';
      case 'medium': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      case 'low': return 'bg-green-500/20 text-green-400 border-green-500/30';
      default: return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <TestTube2 className="h-7 w-7 text-purple-400" />
            QA Copilot
          </h1>
          <p className="text-slate-400 mt-1">Generate tests, analyze queries, and validate configurations</p>
        </div>
        <Select value={selectedCluster} onValueChange={setSelectedCluster}>
          <SelectTrigger className="w-[200px]">
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

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-slate-800">
          <TabsTrigger value="tests" className="data-[state=active]:bg-purple-600">
            <ClipboardList className="h-4 w-4 mr-2" /> Test Cases
          </TabsTrigger>
          <TabsTrigger value="query" className="data-[state=active]:bg-purple-600">
            <Code className="h-4 w-4 mr-2" /> Query Analysis
          </TabsTrigger>
          <TabsTrigger value="scenarios" className="data-[state=active]:bg-purple-600">
            <Zap className="h-4 w-4 mr-2" /> Test Scenarios
          </TabsTrigger>
          <TabsTrigger value="validate" className="data-[state=active]:bg-purple-600">
            <CheckCircle className="h-4 w-4 mr-2" /> Config Validation
          </TabsTrigger>
        </TabsList>

        <TabsContent value="tests" className="space-y-4 mt-4">
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
              <CardTitle className="text-lg">Generate Test Cases</CardTitle>
              <CardDescription>AI-generated test cases for your PostgreSQL cluster</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                placeholder="Optional: Describe specific areas to focus on (e.g., replication, failover, performance)..."
                value={testContext}
                onChange={(e) => setTestContext(e.target.value)}
                className="bg-slate-900 border-slate-600"
              />
              <Button onClick={generateTests} disabled={loading} className="bg-purple-600 hover:bg-purple-700">
                {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
                Generate Tests
              </Button>
            </CardContent>
          </Card>

          {tests.length > 0 && (
            <div className="grid gap-4">
              {tests.map((test, idx) => (
                <Card key={test.id || idx} className="bg-slate-800 border-slate-700">
                  <CardContent className="pt-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge variant="secondary" className="text-purple-400 border-purple-500/30">
                            {test.category}
                          </Badge>
                          <Badge className={priorityColor(test.priority)}>
                            {test.priority}
                          </Badge>
                        </div>
                        <h4 className="font-semibold text-white">{test.name}</h4>
                        <p className="text-slate-400 text-sm mt-1">{test.description}</p>
                        {test.sql && (
                          <pre className="bg-slate-900 p-3 rounded mt-2 text-sm text-cyan-400 overflow-x-auto">
                            {test.sql}
                          </pre>
                        )}
                        <p className="text-sm text-slate-500 mt-2">
                          <span className="text-slate-400">Expected:</span> {test.expectedOutcome}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="query" className="space-y-4 mt-4">
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
              <CardTitle className="text-lg">Query Plan Analysis</CardTitle>
              <CardDescription>Analyze and optimize your SQL queries</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                placeholder="Paste your SQL query here for analysis..."
                value={queryInput}
                onChange={(e) => setQueryInput(e.target.value)}
                className="bg-slate-900 border-slate-600 font-mono min-h-[150px]"
              />
              <Button onClick={analyzeQuery} disabled={loading || !queryInput.trim()} className="bg-purple-600 hover:bg-purple-700">
                {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Database className="h-4 w-4 mr-2" />}
                Analyze Query
              </Button>
            </CardContent>
          </Card>

          {queryAnalysis && (
            <Card className="bg-slate-800 border-slate-700">
              <CardHeader>
                <CardTitle className="text-lg">Analysis Results</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {queryAnalysis.analysis && (
                  <div>
                    <h4 className="font-medium text-white mb-2">Analysis</h4>
                    <p className="text-slate-300">{queryAnalysis.analysis}</p>
                  </div>
                )}
                {queryAnalysis.issues?.length > 0 && (
                  <div>
                    <h4 className="font-medium text-white mb-2 flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-yellow-400" /> Issues Found
                    </h4>
                    <ul className="space-y-2">
                      {queryAnalysis.issues.map((issue: string, idx: number) => (
                        <li key={idx} className="text-yellow-400 text-sm flex items-start gap-2">
                          <span className="text-yellow-500">•</span> {issue}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {queryAnalysis.recommendations?.length > 0 && (
                  <div>
                    <h4 className="font-medium text-white mb-2 flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-400" /> Recommendations
                    </h4>
                    <ul className="space-y-2">
                      {queryAnalysis.recommendations.map((rec: string, idx: number) => (
                        <li key={idx} className="text-green-400 text-sm flex items-start gap-2">
                          <span className="text-green-500">•</span> {rec}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {queryAnalysis.optimizedQuery && (
                  <div>
                    <h4 className="font-medium text-white mb-2">Optimized Query</h4>
                    <pre className="bg-slate-900 p-3 rounded text-sm text-cyan-400 overflow-x-auto">
                      {queryAnalysis.optimizedQuery}
                    </pre>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="scenarios" className="space-y-4 mt-4">
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
              <CardTitle className="text-lg">Generate Test Scenarios</CardTitle>
              <CardDescription>AI-generated resilience and failover test scenarios</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                placeholder="Optional: Focus areas (e.g., network partition, disk failure, memory pressure)..."
                value={scenarioContext}
                onChange={(e) => setScenarioContext(e.target.value)}
                className="bg-slate-900 border-slate-600"
              />
              <Button onClick={generateScenarios} disabled={loading} className="bg-purple-600 hover:bg-purple-700">
                {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Zap className="h-4 w-4 mr-2" />}
                Generate Scenarios
              </Button>
            </CardContent>
          </Card>

          {scenarios.length > 0 && (
            <div className="grid gap-4">
              {scenarios.map((scenario, idx) => (
                <Card key={scenario.id || idx} className={`bg-slate-800 border ${riskColor(scenario.riskLevel)}`}>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="secondary" className="text-purple-400 border-purple-500/30">
                        {scenario.category}
                      </Badge>
                      <Badge className={riskColor(scenario.riskLevel)}>
                        {scenario.riskLevel} risk
                      </Badge>
                    </div>
                    <h4 className="font-semibold text-white text-lg">{scenario.name}</h4>
                    
                    <div className="mt-3">
                      <h5 className="text-sm font-medium text-slate-300 mb-1">Steps:</h5>
                      <ol className="list-decimal list-inside space-y-1">
                        {scenario.steps?.map((step, sIdx) => (
                          <li key={sIdx} className="text-slate-400 text-sm">{step}</li>
                        ))}
                      </ol>
                    </div>
                    
                    <div className="mt-3">
                      <h5 className="text-sm font-medium text-slate-300">Expected Behavior:</h5>
                      <p className="text-slate-400 text-sm">{scenario.expectedBehavior}</p>
                    </div>
                    
                    <div className="mt-3">
                      <h5 className="text-sm font-medium text-slate-300">Rollback Plan:</h5>
                      <p className="text-slate-400 text-sm">{scenario.rollbackPlan}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="validate" className="space-y-4 mt-4">
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
              <CardTitle className="text-lg">Configuration Validation</CardTitle>
              <CardDescription>Validate cluster configuration against best practices</CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={validateConfig} disabled={loading} className="bg-purple-600 hover:bg-purple-700">
                {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                Run Validation
              </Button>
            </CardContent>
          </Card>

          {configValidation && (
            <Card className="bg-slate-800 border-slate-700">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">Validation Results</CardTitle>
                  <div className="flex items-center gap-3">
                    {configValidation.valid !== undefined && (
                      <Badge className={configValidation.valid ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}>
                        {configValidation.valid ? 'Valid' : 'Issues Found'}
                      </Badge>
                    )}
                    {configValidation.score !== undefined && (
                      <div className="text-2xl font-bold text-white">
                        {configValidation.score}<span className="text-sm text-slate-400">/100</span>
                      </div>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {configValidation.summary && (
                  <p className="text-slate-300">{configValidation.summary}</p>
                )}
                {configValidation.issues?.length > 0 && (
                  <div className="space-y-3">
                    {configValidation.issues.map((issue: any, idx: number) => (
                      <div key={idx} className="bg-slate-900 p-3 rounded border border-slate-700">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge className={priorityColor(issue.severity || 'medium')}>
                            {issue.severity || 'medium'}
                          </Badge>
                        </div>
                        <p className="text-white font-medium">{issue.message}</p>
                        {issue.recommendation && (
                          <p className="text-slate-400 text-sm mt-1">
                            <span className="text-green-400">→</span> {issue.recommendation}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
