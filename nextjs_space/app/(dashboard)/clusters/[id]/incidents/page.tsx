'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  Clock,
  CheckCircle2,
  Search,
  Eye,
  FileText,
  Plus,
  RefreshCw,
  Activity,
  Target,
  ListChecks,
  ChevronRight,
  ArrowLeft,
  Sparkles,
  Timer,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface Incident {
  id: string;
  clusterId: string;
  severity: 'SEV1' | 'SEV2' | 'SEV3' | 'SEV4';
  status: 'OPEN' | 'INVESTIGATING' | 'IDENTIFIED' | 'MONITORING' | 'RESOLVED';
  title: string;
  description: string;
  rootCause: string | null;
  timeline: string | null;
  actionItems: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface TimelineEntry {
  time: string;
  event: string;
  user?: string;
}

interface ActionItem {
  id: string;
  task: string;
  assignee?: string;
  done: boolean;
}

const severityColors: Record<string, string> = {
  SEV1: 'bg-red-500/20 text-red-400 border-red-500/50',
  SEV2: 'bg-orange-500/20 text-orange-400 border-orange-500/50',
  SEV3: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50',
  SEV4: 'bg-blue-500/20 text-blue-400 border-blue-500/50',
};

const statusColors: Record<string, string> = {
  OPEN: 'bg-red-500/20 text-red-400',
  INVESTIGATING: 'bg-purple-500/20 text-purple-400',
  IDENTIFIED: 'bg-yellow-500/20 text-yellow-400',
  MONITORING: 'bg-blue-500/20 text-blue-400',
  RESOLVED: 'bg-green-500/20 text-green-400',
};

const statusIcons: Record<string, React.ReactNode> = {
  OPEN: <AlertTriangle className="h-4 w-4" />,
  INVESTIGATING: <Search className="h-4 w-4" />,
  IDENTIFIED: <Target className="h-4 w-4" />,
  MONITORING: <Eye className="h-4 w-4" />,
  RESOLVED: <CheckCircle2 className="h-4 w-4" />,
};

export default function IncidentsPage() {
  const params = useParams();
  const router = useRouter();
  const clusterId = params.id as string;

  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterSeverity, setFilterSeverity] = useState<string>('all');
  const [generating, setGenerating] = useState(false);

  const [newIncident, setNewIncident] = useState({
    severity: 'SEV3',
    title: '',
    description: '',
  });

  const [editRootCause, setEditRootCause] = useState('');
  const [editTimeline, setEditTimeline] = useState<TimelineEntry[]>([]);
  const [editActionItems, setEditActionItems] = useState<ActionItem[]>([]);
  const [newTimelineEvent, setNewTimelineEvent] = useState('');
  const [newActionTask, setNewActionTask] = useState('');

  useEffect(() => {
    fetchIncidents();
  }, [clusterId]);

  const fetchIncidents = async () => {
    try {
      const res = await fetch(`/api/incidents?clusterId=${clusterId}`);
      if (res.ok) {
        const data = await res.json();
        setIncidents(data);
      }
    } catch (error) {
      console.error('Error fetching incidents:', error);
    } finally {
      setLoading(false);
    }
  };

  const createIncident = async () => {
    try {
      const res = await fetch('/api/incidents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clusterId, ...newIncident }),
      });
      if (res.ok) {
        setShowNewDialog(false);
        setNewIncident({ severity: 'SEV3', title: '', description: '' });
        fetchIncidents();
      }
    } catch (error) {
      console.error('Error creating incident:', error);
    }
  };

  const updateIncidentStatus = async (id: string, status: string) => {
    try {
      const res = await fetch('/api/incidents', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      });
      if (res.ok) {
        fetchIncidents();
        if (selectedIncident?.id === id) {
          const updated = await res.json();
          setSelectedIncident(updated);
        }
      }
    } catch (error) {
      console.error('Error updating incident:', error);
    }
  };

  const saveIncidentDetails = async () => {
    if (!selectedIncident) return;
    try {
      const res = await fetch('/api/incidents', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedIncident.id,
          rootCause: editRootCause,
          timeline: JSON.stringify(editTimeline),
          actionItems: JSON.stringify(editActionItems),
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        setSelectedIncident(updated);
        fetchIncidents();
      }
    } catch (error) {
      console.error('Error saving incident details:', error);
    }
  };

  const openIncidentDetail = (incident: Incident) => {
    setSelectedIncident(incident);
    setEditRootCause(incident.rootCause || '');
    try {
      setEditTimeline(incident.timeline ? JSON.parse(incident.timeline) : []);
    } catch {
      setEditTimeline([]);
    }
    try {
      setEditActionItems(incident.actionItems ? JSON.parse(incident.actionItems) : []);
    } catch {
      setEditActionItems([]);
    }
    setShowDetailDialog(true);
  };

  const addTimelineEntry = () => {
    if (!newTimelineEvent.trim()) return;
    setEditTimeline([
      ...editTimeline,
      { time: new Date().toISOString(), event: newTimelineEvent, user: 'Current User' },
    ]);
    setNewTimelineEvent('');
  };

  const addActionItem = () => {
    if (!newActionTask.trim()) return;
    setEditActionItems([
      ...editActionItems,
      { id: Date.now().toString(), task: newActionTask, done: false },
    ]);
    setNewActionTask('');
  };

  const toggleActionItem = (id: string) => {
    setEditActionItems(
      editActionItems.map((item) =>
        item.id === id ? { ...item, done: !item.done } : item
      )
    );
  };

  const generateRCA = async () => {
    if (!selectedIncident) return;
    setGenerating(true);
    try {
      const res = await fetch('/api/ai/rca', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          incidentId: selectedIncident.id,
          clusterId,
          title: selectedIncident.title,
          description: selectedIncident.description,
          timeline: editTimeline,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setEditRootCause(data.rootCause || editRootCause);
        if (data.suggestedActions) {
          const newActions = data.suggestedActions.map((action: string, idx: number) => ({
            id: `ai-${Date.now()}-${idx}`,
            task: action,
            done: false,
          }));
          setEditActionItems([...editActionItems, ...newActions]);
        }
      }
    } catch (error) {
      console.error('Error generating RCA:', error);
    } finally {
      setGenerating(false);
    }
  };

  const filteredIncidents = incidents.filter((incident) => {
    if (filterStatus !== 'all' && incident.status !== filterStatus) return false;
    if (filterSeverity !== 'all' && incident.severity !== filterSeverity) return false;
    return true;
  });

  const stats = {
    open: incidents.filter((i) => i.status !== 'RESOLVED').length,
    resolved: incidents.filter((i) => i.status === 'RESOLVED').length,
    sev1: incidents.filter((i) => i.severity === 'SEV1' && i.status !== 'RESOLVED').length,
    avgResolutionTime: incidents
      .filter((i) => i.resolvedAt)
      .reduce((acc, i) => {
        const created = new Date(i.createdAt).getTime();
        const resolved = new Date(i.resolvedAt!).getTime();
        return acc + (resolved - created);
      }, 0) /
      Math.max(incidents.filter((i) => i.resolvedAt).length, 1) /
      (1000 * 60),
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
              <AlertTriangle className="h-6 w-6 text-red-400" />
              Incident Management
            </h1>
            <p className="text-slate-400">Track, investigate, and resolve cluster incidents</p>
          </div>
        </div>
        <Button onClick={() => setShowNewDialog(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Report Incident
        </Button>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-400 text-sm">Active Incidents</p>
                <p className="text-2xl font-bold text-white">{stats.open}</p>
              </div>
              <Activity className="h-8 w-8 text-red-400" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-400 text-sm">SEV1 Active</p>
                <p className="text-2xl font-bold text-red-400">{stats.sev1}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-red-500" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-400 text-sm">Resolved (30d)</p>
                <p className="text-2xl font-bold text-green-400">{stats.resolved}</p>
              </div>
              <CheckCircle2 className="h-8 w-8 text-green-400" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-400 text-sm">Avg Resolution</p>
                <p className="text-2xl font-bold text-blue-400">
                  {stats.avgResolutionTime > 0 ? `${Math.round(stats.avgResolutionTime)}m` : 'N/A'}
                </p>
              </div>
              <Timer className="h-8 w-8 text-blue-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-4">
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-40 bg-slate-800 border-slate-700">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent className="bg-slate-800 border-slate-700">
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="OPEN">Open</SelectItem>
            <SelectItem value="INVESTIGATING">Investigating</SelectItem>
            <SelectItem value="IDENTIFIED">Identified</SelectItem>
            <SelectItem value="MONITORING">Monitoring</SelectItem>
            <SelectItem value="RESOLVED">Resolved</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterSeverity} onValueChange={setFilterSeverity}>
          <SelectTrigger className="w-40 bg-slate-800 border-slate-700">
            <SelectValue placeholder="Filter by severity" />
          </SelectTrigger>
          <SelectContent className="bg-slate-800 border-slate-700">
            <SelectItem value="all">All Severities</SelectItem>
            <SelectItem value="SEV1">SEV1</SelectItem>
            <SelectItem value="SEV2">SEV2</SelectItem>
            <SelectItem value="SEV3">SEV3</SelectItem>
            <SelectItem value="SEV4">SEV4</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={fetchIncidents}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      <div className="space-y-3">
        {filteredIncidents.length === 0 ? (
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="py-12 text-center">
              <CheckCircle2 className="h-12 w-12 mx-auto text-green-400 mb-4" />
              <p className="text-slate-400">No incidents match your filters</p>
            </CardContent>
          </Card>
        ) : (
          filteredIncidents.map((incident) => (
            <motion.div key={incident.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <Card
                className="bg-slate-800/50 border-slate-700 hover:border-slate-600 cursor-pointer transition-colors"
                onClick={() => openIncidentDetail(incident)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4">
                      <div className="mt-1">{statusIcons[incident.status]}</div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <Badge className={severityColors[incident.severity]}>{incident.severity}</Badge>
                          <Badge className={statusColors[incident.status]}>{incident.status}</Badge>
                          <span className="text-slate-500 text-sm">
                            {new Date(incident.createdAt).toLocaleString()}
                          </span>
                        </div>
                        <h3 className="text-white font-medium">{incident.title}</h3>
                        <p className="text-slate-400 text-sm line-clamp-2">{incident.description}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {incident.status !== 'RESOLVED' && (
                        <Select
                          value={incident.status}
                          onValueChange={(value) => updateIncidentStatus(incident.id, value)}
                        >
                          <SelectTrigger
                            className="w-36 bg-slate-700 border-slate-600 text-sm"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-slate-800 border-slate-700">
                            <SelectItem value="OPEN">Open</SelectItem>
                            <SelectItem value="INVESTIGATING">Investigating</SelectItem>
                            <SelectItem value="IDENTIFIED">Identified</SelectItem>
                            <SelectItem value="MONITORING">Monitoring</SelectItem>
                            <SelectItem value="RESOLVED">Resolved</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                      <ChevronRight className="h-5 w-5 text-slate-500" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))
        )}
      </div>

      <Dialog open={showNewDialog} onOpenChange={setShowNewDialog}>
        <DialogContent className="bg-slate-800 border-slate-700 max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-white">Report New Incident</DialogTitle>
            <DialogDescription className="text-slate-400">
              Create a new incident to track and investigate
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-slate-300">Severity</Label>
              <Select
                value={newIncident.severity}
                onValueChange={(value) => setNewIncident({ ...newIncident, severity: value })}
              >
                <SelectTrigger className="bg-slate-700 border-slate-600">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="SEV1">SEV1 - Critical</SelectItem>
                  <SelectItem value="SEV2">SEV2 - Major</SelectItem>
                  <SelectItem value="SEV3">SEV3 - Minor</SelectItem>
                  <SelectItem value="SEV4">SEV4 - Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-slate-300">Title</Label>
              <Input
                value={newIncident.title}
                onChange={(e) => setNewIncident({ ...newIncident, title: e.target.value })}
                placeholder="Brief description of the incident"
                className="bg-slate-700 border-slate-600"
              />
            </div>
            <div>
              <Label className="text-slate-300">Description</Label>
              <Textarea
                value={newIncident.description}
                onChange={(e) => setNewIncident({ ...newIncident, description: e.target.value })}
                placeholder="Detailed description of what happened..."
                className="bg-slate-700 border-slate-600 min-h-[100px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewDialog(false)}>Cancel</Button>
            <Button onClick={createIncident} disabled={!newIncident.title || !newIncident.description}>
              Create Incident
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
        <DialogContent className="bg-slate-800 border-slate-700 max-w-4xl max-h-[90vh] overflow-y-auto">
          {selectedIncident && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-2">
                  <Badge className={severityColors[selectedIncident.severity]}>{selectedIncident.severity}</Badge>
                  <Badge className={statusColors[selectedIncident.status]}>{selectedIncident.status}</Badge>
                </div>
                <DialogTitle className="text-white text-xl">{selectedIncident.title}</DialogTitle>
                <DialogDescription className="text-slate-400">
                  Created: {new Date(selectedIncident.createdAt).toLocaleString()}
                  {selectedIncident.resolvedAt && (
                    <> • Resolved: {new Date(selectedIncident.resolvedAt).toLocaleString()}</>
                  )}
                </DialogDescription>
              </DialogHeader>

              <Tabs defaultValue="details" className="mt-4">
                <TabsList className="bg-slate-700">
                  <TabsTrigger value="details" className="data-[state=active]:bg-slate-600">
                    <FileText className="h-4 w-4 mr-2" />Details
                  </TabsTrigger>
                  <TabsTrigger value="timeline" className="data-[state=active]:bg-slate-600">
                    <Clock className="h-4 w-4 mr-2" />Timeline
                  </TabsTrigger>
                  <TabsTrigger value="actions" className="data-[state=active]:bg-slate-600">
                    <ListChecks className="h-4 w-4 mr-2" />Action Items
                  </TabsTrigger>
                  <TabsTrigger value="rca" className="data-[state=active]:bg-slate-600">
                    <Target className="h-4 w-4 mr-2" />Root Cause
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="details" className="space-y-4 mt-4">
                  <div>
                    <Label className="text-slate-300 mb-2 block">Description</Label>
                    <div className="bg-slate-700/50 rounded-lg p-4 text-slate-300">
                      {selectedIncident.description}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => updateIncidentStatus(selectedIncident.id, 'INVESTIGATING')}
                      disabled={selectedIncident.status === 'RESOLVED'}
                    >
                      <Search className="h-4 w-4 mr-2" />Start Investigation
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => updateIncidentStatus(selectedIncident.id, 'RESOLVED')}
                      disabled={selectedIncident.status === 'RESOLVED'}
                    >
                      <CheckCircle2 className="h-4 w-4 mr-2" />Mark Resolved
                    </Button>
                  </div>
                </TabsContent>

                <TabsContent value="timeline" className="space-y-4 mt-4">
                  <div className="flex gap-2">
                    <Input
                      value={newTimelineEvent}
                      onChange={(e) => setNewTimelineEvent(e.target.value)}
                      placeholder="Add timeline entry..."
                      className="bg-slate-700 border-slate-600 flex-1"
                      onKeyDown={(e) => e.key === 'Enter' && addTimelineEntry()}
                    />
                    <Button onClick={addTimelineEntry}><Plus className="h-4 w-4" /></Button>
                  </div>
                  <div className="space-y-3">
                    {editTimeline.length === 0 ? (
                      <p className="text-slate-500 text-center py-4">No timeline entries yet</p>
                    ) : (
                      editTimeline.map((entry, idx) => (
                        <div key={idx} className="flex gap-3">
                          <div className="w-2 h-2 rounded-full bg-blue-400 mt-2" />
                          <div className="flex-1">
                            <p className="text-sm text-slate-500">
                              {new Date(entry.time).toLocaleString()}{entry.user && ` • ${entry.user}`}
                            </p>
                            <p className="text-slate-300">{entry.event}</p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="actions" className="space-y-4 mt-4">
                  <div className="flex gap-2">
                    <Input
                      value={newActionTask}
                      onChange={(e) => setNewActionTask(e.target.value)}
                      placeholder="Add action item..."
                      className="bg-slate-700 border-slate-600 flex-1"
                      onKeyDown={(e) => e.key === 'Enter' && addActionItem()}
                    />
                    <Button onClick={addActionItem}><Plus className="h-4 w-4" /></Button>
                  </div>
                  <div className="space-y-2">
                    {editActionItems.length === 0 ? (
                      <p className="text-slate-500 text-center py-4">No action items yet</p>
                    ) : (
                      editActionItems.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center gap-3 bg-slate-700/50 rounded-lg p-3 cursor-pointer"
                          onClick={() => toggleActionItem(item.id)}
                        >
                          <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${item.done ? 'bg-green-500 border-green-500' : 'border-slate-500'}`}>
                            {item.done && <CheckCircle2 className="h-3 w-3 text-white" />}
                          </div>
                          <span className={`flex-1 ${item.done ? 'text-slate-500 line-through' : 'text-slate-300'}`}>
                            {item.task}
                          </span>
                          {item.assignee && <Badge className="text-xs border border-slate-500">{item.assignee}</Badge>}
                        </div>
                      ))
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="rca" className="space-y-4 mt-4">
                  <div className="flex justify-end">
                    <Button variant="outline" size="sm" onClick={generateRCA} disabled={generating}>
                      <Sparkles className="h-4 w-4 mr-2" />
                      {generating ? 'Generating...' : 'AI Generate RCA'}
                    </Button>
                  </div>
                  <div>
                    <Label className="text-slate-300 mb-2 block">Root Cause Analysis</Label>
                    <Textarea
                      value={editRootCause}
                      onChange={(e) => setEditRootCause(e.target.value)}
                      placeholder="Document the root cause of the incident..."
                      className="bg-slate-700 border-slate-600 min-h-[200px]"
                    />
                  </div>
                </TabsContent>
              </Tabs>

              <DialogFooter className="mt-6">
                <Button variant="outline" onClick={() => setShowDetailDialog(false)}>Close</Button>
                <Button onClick={saveIncidentDetails}>Save Changes</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
