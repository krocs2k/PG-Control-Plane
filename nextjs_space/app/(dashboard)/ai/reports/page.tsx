'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  FileText,
  Plus,
  RefreshCw,
  Loader2,
  Download,
  Eye,
  Calendar,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
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

interface Report {
  id: string;
  clusterId?: string;
  title: string;
  type: string;
  prompt?: string;
  content: string;
  createdAt: string;
}

interface Cluster {
  id: string;
  name: string;
}

const REPORT_TYPES = [
  { value: 'sla', label: 'SLA Compliance Report', description: 'Uptime, incidents, MTTR metrics' },
  { value: 'capacity', label: 'Capacity Planning Report', description: 'Resource utilization and forecasts' },
  { value: 'incident', label: 'Incident Summary Report', description: 'Incident analysis and trends' },
  { value: 'security', label: 'Security Posture Report', description: 'Access control and compliance' },
  { value: 'custom', label: 'Custom Report', description: 'Generate with natural language prompt' },
];

export default function ReportsPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [selectedCluster, setSelectedCluster] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isViewOpen, setIsViewOpen] = useState(false);
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [newReport, setNewReport] = useState({
    type: 'sla',
    prompt: '',
  });

  useEffect(() => {
    fetchClusters();
    fetchReports();
  }, []);

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
    }
  }

  async function fetchReports() {
    setLoading(true);
    try {
      const res = await fetch('/api/ai/reports');
      const data = await res.json();
      setReports(data || []);
    } catch (error) {
      console.error('Error fetching reports:', error);
    } finally {
      setLoading(false);
    }
  }

  async function generateReport() {
    if (!selectedCluster) return;
    setGenerating(true);
    try {
      // First ensure metrics exist
      await fetch(`/api/metrics?clusterId=${selectedCluster}`);
      
      const res = await fetch('/api/ai/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clusterId: selectedCluster,
          type: newReport.type,
          prompt: newReport.type === 'custom' ? newReport.prompt : undefined,
        }),
      });
      
      if (res.ok) {
        const report = await res.json();
        setReports(prev => [report, ...prev]);
        setIsCreateOpen(false);
        setNewReport({ type: 'sla', prompt: '' });
        // Open the new report
        setSelectedReport(report);
        setIsViewOpen(true);
      }
    } catch (error) {
      console.error('Error generating report:', error);
    } finally {
      setGenerating(false);
    }
  }

  function downloadReport(report: Report) {
    const blob = new Blob([report.content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${report.title.replace(/\s+/g, '-').toLowerCase()}-${new Date(report.createdAt).toISOString().split('T')[0]}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function deleteReport(reportId: string) {
    if (!confirm('Are you sure you want to delete this report?')) return;
    try {
      const res = await fetch(`/api/ai/reports?id=${reportId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setReports(prev => prev.filter(r => r.id !== reportId));
        if (selectedReport?.id === reportId) {
          setIsViewOpen(false);
          setSelectedReport(null);
        }
      }
    } catch (error) {
      console.error('Error deleting report:', error);
    }
  }

  const typeColors: Record<string, string> = {
    sla: 'bg-green-500/20 text-green-400',
    capacity: 'bg-blue-500/20 text-blue-400',
    incident: 'bg-orange-500/20 text-orange-400',
    security: 'bg-purple-500/20 text-purple-400',
    custom: 'bg-cyan-500/20 text-cyan-400',
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-100">AI Reports</h1>
          <p className="mt-1 text-slate-400">Generate intelligent reports with natural language</p>
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={() => setIsCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Generate Report
          </Button>
          <Button variant="outline" onClick={fetchReports} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Reports List */}
      <Card>
        <CardHeader>
          <CardTitle>Generated Reports</CardTitle>
          <CardDescription>AI-generated analysis and reports</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-cyan-500" />
            </div>
          ) : reports.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="h-12 w-12 text-slate-600 mx-auto mb-3" />
              <p className="text-slate-400">No reports generated yet</p>
              <p className="text-sm text-slate-500 mt-1">Generate your first AI-powered report</p>
              <Button className="mt-4" onClick={() => setIsCreateOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Generate Report
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {reports.map((report, index) => (
                <motion.div
                  key={report.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.03 }}
                  className="flex items-center justify-between p-4 border border-slate-700 rounded-lg hover:border-slate-600 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="rounded-lg p-2 bg-slate-800">
                      <FileText className="h-5 w-5 text-slate-400" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-200">{report.title}</span>
                        <Badge className={typeColors[report.type]}>
                          {report.type.toUpperCase()}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-slate-400 mt-1">
                        <Calendar className="h-3 w-3" />
                        {new Date(report.createdAt).toLocaleString()}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSelectedReport(report);
                        setIsViewOpen(true);
                      }}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => downloadReport(report)}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteReport(report.id)}
                      className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Report Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Generate Report</DialogTitle>
            <DialogDescription>Select a report type or create a custom report</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Cluster</Label>
              <Select value={selectedCluster} onValueChange={setSelectedCluster}>
                <SelectTrigger>
                  <SelectValue placeholder="Select cluster" />
                </SelectTrigger>
                <SelectContent>
                  {clusters.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Report Type</Label>
              <div className="grid gap-2">
                {REPORT_TYPES.map(type => (
                  <label
                    key={type.value}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                      newReport.type === type.value
                        ? 'border-cyan-500 bg-cyan-500/10'
                        : 'border-slate-700 hover:border-slate-600'
                    }`}
                  >
                    <input
                      type="radio"
                      name="reportType"
                      value={type.value}
                      checked={newReport.type === type.value}
                      onChange={() => setNewReport({ ...newReport, type: type.value })}
                      className="sr-only"
                    />
                    <div>
                      <p className="font-medium text-slate-200">{type.label}</p>
                      <p className="text-sm text-slate-400">{type.description}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {newReport.type === 'custom' && (
              <div className="space-y-2">
                <Label>Custom Prompt</Label>
                <Textarea
                  value={newReport.prompt}
                  onChange={(e) => setNewReport({ ...newReport, prompt: e.target.value })}
                  placeholder="Describe what you want in the report..."
                  rows={4}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={generateReport}
              disabled={generating || !selectedCluster || (newReport.type === 'custom' && !newReport.prompt.trim())}
            >
              {generating ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Sparkles className="h-4 w-4 mr-2" />
              )}
              Generate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Report Dialog */}
      <Dialog open={isViewOpen} onOpenChange={setIsViewOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>{selectedReport?.title}</DialogTitle>
            <DialogDescription>
              Generated on {selectedReport && new Date(selectedReport.createdAt).toLocaleString()}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto py-4">
            <div className="prose prose-invert prose-slate max-w-none">
              <pre className="whitespace-pre-wrap text-sm text-slate-300 bg-slate-800/50 p-4 rounded-lg">
                {selectedReport?.content}
              </pre>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsViewOpen(false)}>
              Close
            </Button>
            {selectedReport && (
              <Button onClick={() => downloadReport(selectedReport)}>
                <Download className="h-4 w-4 mr-2" />
                Download
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
