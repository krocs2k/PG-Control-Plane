'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Database,
  Plus,
  Search,
  Server,
  Activity,
  Trash2,
  Loader2,
  Eye,
  Pencil,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { StatusBadge } from '@/components/status-badge';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface Cluster {
  id: string;
  name: string;
  status: string;
  replicationMode: string;
  topology: string;
  createdAt: string;
  _count?: { nodes: number };
  project?: { name: string; environment: string };
}

export default function ClustersPage() {
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  
  // Edit dialog state
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingCluster, setEditingCluster] = useState<Cluster | null>(null);
  const [editForm, setEditForm] = useState({
    name: '',
    status: '',
    replicationMode: '',
    topology: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchClusters();
  }, []);

  async function fetchClusters() {
    try {
      const res = await fetch('/api/clusters');
      const data = await res.json();
      setClusters(data ?? []);
    } catch (error) {
      console.error('Error fetching clusters:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Are you sure you want to delete this cluster?')) return;

    setDeleteId(id);
    try {
      const res = await fetch(`/api/clusters/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setClusters((prev) => (prev ?? []).filter((c) => c?.id !== id));
      }
    } catch (error) {
      console.error('Error deleting cluster:', error);
    } finally {
      setDeleteId(null);
    }
  }

  function openEdit(cluster: Cluster) {
    setEditingCluster(cluster);
    setEditForm({
      name: cluster.name,
      status: cluster.status,
      replicationMode: cluster.replicationMode,
      topology: cluster.topology,
    });
    setIsEditOpen(true);
  }

  async function handleUpdate() {
    if (!editingCluster) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/clusters/${editingCluster.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });
      if (res.ok) {
        const updated = await res.json();
        setClusters((prev) =>
          prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c))
        );
        setIsEditOpen(false);
        setEditingCluster(null);
      }
    } catch (error) {
      console.error('Error updating cluster:', error);
    } finally {
      setSaving(false);
    }
  }

  const filteredClusters = (clusters ?? []).filter(
    (c) =>
      c?.name?.toLowerCase()?.includes(search?.toLowerCase() ?? '') ||
      c?.project?.name?.toLowerCase()?.includes(search?.toLowerCase() ?? '')
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-cyan-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-100">Clusters</h1>
          <p className="mt-1 text-slate-400">Manage your PostgreSQL clusters</p>
        </div>
        <Link href="/clusters/new">
          <Button className="gap-2">
            <Plus className="h-4 w-4" />
            New Cluster
          </Button>
        </Link>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          placeholder="Search clusters..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Clusters Table */}
      {(filteredClusters?.length ?? 0) === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Database className="h-16 w-16 text-slate-600 mb-4" />
            <h3 className="text-lg font-medium text-slate-300 mb-2">
              {search ? 'No matching clusters' : 'No clusters yet'}
            </h3>
            <p className="text-slate-400 mb-4">
              {search ? 'Try a different search term' : 'Create your first PostgreSQL cluster'}
            </p>
            {!search && (
              <Link href="/clusters/new">
                <Button className="gap-2">
                  <Plus className="h-4 w-4" />
                  Create Cluster
                </Button>
              </Link>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left p-4 text-sm font-medium text-slate-400">Name</th>
                  <th className="text-left p-4 text-sm font-medium text-slate-400">Project</th>
                  <th className="text-left p-4 text-sm font-medium text-slate-400">Status</th>
                  <th className="text-left p-4 text-sm font-medium text-slate-400">Nodes</th>
                  <th className="text-left p-4 text-sm font-medium text-slate-400">Replication</th>
                  <th className="text-left p-4 text-sm font-medium text-slate-400">Topology</th>
                  <th className="text-right p-4 text-sm font-medium text-slate-400">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(filteredClusters ?? []).map((cluster, index) => (
                  <motion.tr
                    key={cluster?.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="border-b border-slate-700/50 hover:bg-slate-800/50 transition-colors"
                  >
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="rounded-lg p-2 bg-cyan-500/10">
                          <Database className="h-4 w-4 text-cyan-400" />
                        </div>
                        <span className="font-medium text-slate-200">{cluster?.name}</span>
                      </div>
                    </td>
                    <td className="p-4">
                      <span className="text-slate-300">{cluster?.project?.name ?? 'N/A'}</span>
                      <span className="ml-2 text-xs px-2 py-0.5 rounded bg-slate-700 text-slate-400">
                        {cluster?.project?.environment ?? 'N/A'}
                      </span>
                    </td>
                    <td className="p-4">
                      <StatusBadge status={cluster?.status ?? 'UNKNOWN'} />
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2 text-slate-300">
                        <Server className="h-4 w-4 text-slate-400" />
                        {cluster?._count?.nodes ?? 0}
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2 text-slate-300">
                        <Activity className="h-4 w-4 text-slate-400" />
                        {cluster?.replicationMode ?? 'N/A'}
                      </div>
                    </td>
                    <td className="p-4 text-slate-300">{cluster?.topology ?? 'standard'}</td>
                    <td className="p-4">
                      <div className="flex items-center justify-end gap-2">
                        <Link href={`/clusters/${cluster?.id}`}>
                          <Button variant="ghost" size="sm">
                            <Eye className="h-4 w-4" />
                          </Button>
                        </Link>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEdit(cluster)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                          onClick={() => handleDelete(cluster?.id)}
                          disabled={deleteId === cluster?.id}
                        >
                          {deleteId === cluster?.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Edit Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Cluster</DialogTitle>
            <DialogDescription>Update cluster configuration</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Cluster Name</Label>
              <Input
                id="edit-name"
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-status">Status</Label>
              <Select
                value={editForm.status}
                onValueChange={(val) => setEditForm({ ...editForm, status: val })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PROVISIONING">Provisioning</SelectItem>
                  <SelectItem value="HEALTHY">Healthy</SelectItem>
                  <SelectItem value="DEGRADED">Degraded</SelectItem>
                  <SelectItem value="FAILING">Failing</SelectItem>
                  <SelectItem value="RECOVERING">Recovering</SelectItem>
                  <SelectItem value="MAINTENANCE">Maintenance</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-replication">Replication Mode</Label>
              <Select
                value={editForm.replicationMode}
                onValueChange={(val) => setEditForm({ ...editForm, replicationMode: val })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SYNC">Synchronous</SelectItem>
                  <SelectItem value="ASYNC">Asynchronous</SelectItem>
                  <SelectItem value="QUORUM">Quorum</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-topology">Topology</Label>
              <Select
                value={editForm.topology}
                onValueChange={(val) => setEditForm({ ...editForm, topology: val })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="standard">Standard</SelectItem>
                  <SelectItem value="ha">High Availability</SelectItem>
                  <SelectItem value="multi-region">Multi-Region</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdate} disabled={saving || !editForm.name.trim()}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
