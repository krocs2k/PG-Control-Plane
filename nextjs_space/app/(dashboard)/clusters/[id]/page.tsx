'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Database,
  Server,
  ArrowLeft,
  Activity,
  Loader2,
  Trash2,
  Clock,
  Cpu,
  HardDrive,
  Network,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/status-badge';
import { Badge } from '@/components/ui/badge';

interface Node {
  id: string;
  name: string;
  host: string;
  port: number;
  role: string;
  status: string;
  createdAt: string;
}

interface ClusterDetail {
  id: string;
  name: string;
  status: string;
  replicationMode: string;
  topology: string;
  createdAt: string;
  nodes: Node[];
  project?: { name: string; environment: string; organization?: { name: string } };
}

export default function ClusterDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [cluster, setCluster] = useState<ClusterDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleteNodeId, setDeleteNodeId] = useState<string | null>(null);

  const clusterId = params?.id as string;

  useEffect(() => {
    async function fetchCluster() {
      try {
        const res = await fetch(`/api/clusters/${clusterId}`);
        if (!res.ok) {
          router.push('/clusters');
          return;
        }
        const data = await res.json();
        setCluster(data);
      } catch (error) {
        console.error('Error fetching cluster:', error);
      } finally {
        setLoading(false);
      }
    }

    if (clusterId) {
      fetchCluster();
    }
  }, [clusterId, router]);

  async function handleDeleteNode(nodeId: string) {
    if (!confirm('Are you sure you want to remove this node?')) return;

    setDeleteNodeId(nodeId);
    try {
      const res = await fetch(`/api/nodes/${nodeId}`, { method: 'DELETE' });
      if (res.ok) {
        setCluster((prev) =>
          prev
            ? { ...prev, nodes: (prev.nodes ?? []).filter((n) => n?.id !== nodeId) }
            : null
        );
      }
    } catch (error) {
      console.error('Error deleting node:', error);
    } finally {
      setDeleteNodeId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-cyan-500" />
      </div>
    );
  }

  if (!cluster) {
    return (
      <div className="text-center py-16">
        <Database className="h-16 w-16 text-slate-600 mx-auto mb-4" />
        <h2 className="text-xl font-medium text-slate-300">Cluster not found</h2>
        <Link href="/clusters">
          <Button variant="outline" className="mt-4">
            Back to Clusters
          </Button>
        </Link>
      </div>
    );
  }

  const primaryNode = (cluster.nodes ?? []).find((n) => n?.role === 'PRIMARY');
  const replicaNodes = (cluster.nodes ?? []).filter((n) => n?.role === 'REPLICA');

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Link href="/clusters">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold text-slate-100">{cluster.name}</h1>
              <StatusBadge status={cluster.status} />
            </div>
            <p className="mt-1 text-slate-400">
              {cluster.project?.organization?.name} / {cluster.project?.name}
            </p>
          </div>
        </div>
{/* Settings button reserved for future implementation */}
      </div>

      {/* Cluster Info Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="rounded-lg p-3 bg-purple-500/10">
                  <Activity className="h-6 w-6 text-purple-400" />
                </div>
                <div>
                  <p className="text-sm text-slate-400">Replication</p>
                  <p className="text-xl font-bold text-slate-100">{cluster.replicationMode}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="rounded-lg p-3 bg-cyan-500/10">
                  <Server className="h-6 w-6 text-cyan-400" />
                </div>
                <div>
                  <p className="text-sm text-slate-400">Total Nodes</p>
                  <p className="text-xl font-bold text-slate-100">{cluster.nodes?.length ?? 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="rounded-lg p-3 bg-emerald-500/10">
                  <Network className="h-6 w-6 text-emerald-400" />
                </div>
                <div>
                  <p className="text-sm text-slate-400">Topology</p>
                  <p className="text-xl font-bold text-slate-100 capitalize">{cluster.topology}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="rounded-lg p-3 bg-blue-500/10">
                  <Clock className="h-6 w-6 text-blue-400" />
                </div>
                <div>
                  <p className="text-sm text-slate-400">Created</p>
                  <p className="text-lg font-bold text-slate-100">
                    {new Date(cluster.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Nodes Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Nodes</CardTitle>
              <CardDescription>Database nodes in this cluster</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {(cluster.nodes?.length ?? 0) === 0 ? (
            <div className="text-center py-12">
              <Server className="h-12 w-12 text-slate-600 mx-auto mb-4" />
              <p className="text-slate-400">No nodes in this cluster</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Primary Node */}
              {primaryNode && (
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="p-4 rounded-lg border border-cyan-500/30 bg-cyan-500/5"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="rounded-lg p-3 bg-cyan-500/20">
                        <Database className="h-6 w-6 text-cyan-400" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-100">{primaryNode.name}</span>
                          <Badge variant="info">PRIMARY</Badge>
                          <StatusBadge status={primaryNode.status} />
                        </div>
                        <p className="text-sm text-slate-400">
                          {primaryNode.host}:{primaryNode.port}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-400 hover:text-red-300"
                      onClick={() => handleDeleteNode(primaryNode.id)}
                      disabled={deleteNodeId === primaryNode.id}
                    >
                      {deleteNodeId === primaryNode.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </motion.div>
              )}

              {/* Replica Nodes */}
              {replicaNodes.map((node, index) => (
                <motion.div
                  key={node?.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 + index * 0.05 }}
                  className="p-4 rounded-lg border border-slate-700 bg-slate-800/30 hover:border-slate-600 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="rounded-lg p-3 bg-slate-700/50">
                        <Server className="h-6 w-6 text-slate-400" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-100">{node?.name}</span>
                          <Badge>REPLICA</Badge>
                          <StatusBadge status={node?.status ?? 'UNKNOWN'} />
                        </div>
                        <p className="text-sm text-slate-400">
                          {node?.host}:{node?.port}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-400 hover:text-red-300"
                      onClick={() => handleDeleteNode(node?.id)}
                      disabled={deleteNodeId === node?.id}
                    >
                      {deleteNodeId === node?.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Health Metrics Placeholder */}
      <Card>
        <CardHeader>
          <CardTitle>Health Metrics</CardTitle>
          <CardDescription>Real-time cluster health monitoring</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700">
              <div className="flex items-center gap-3">
                <Cpu className="h-5 w-5 text-cyan-400" />
                <span className="text-sm text-slate-400">CPU Usage</span>
              </div>
              <p className="mt-2 text-2xl font-bold text-slate-100">--</p>
              <p className="text-xs text-slate-500">Monitoring coming soon</p>
            </div>
            <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700">
              <div className="flex items-center gap-3">
                <HardDrive className="h-5 w-5 text-emerald-400" />
                <span className="text-sm text-slate-400">Disk Usage</span>
              </div>
              <p className="mt-2 text-2xl font-bold text-slate-100">--</p>
              <p className="text-xs text-slate-500">Monitoring coming soon</p>
            </div>
            <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700">
              <div className="flex items-center gap-3">
                <Activity className="h-5 w-5 text-purple-400" />
                <span className="text-sm text-slate-400">Replication Lag</span>
              </div>
              <p className="mt-2 text-2xl font-bold text-slate-100">--</p>
              <p className="text-xs text-slate-500">Monitoring coming soon</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
