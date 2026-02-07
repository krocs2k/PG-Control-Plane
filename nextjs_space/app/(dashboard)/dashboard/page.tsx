'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Database,
  Server,
  Plus,
  ArrowRight,
  Building2,
  FolderKanban,
  Loader2,
  Activity,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/status-badge';

interface ClusterData {
  id: string;
  name: string;
  status: string;
  replicationMode: string;
  _count?: { nodes: number };
  project?: { name: string; organization?: { name: string } };
}

interface DashboardData {
  organization: { id: string; name: string; _count?: { projects: number; users: number } } | null;
  projects: Array<{ id: string; name: string; environment: string; _count?: { clusters: number } }>;
  clusters: ClusterData[];
}

export default function DashboardPage() {
  const { data: session } = useSession() || {};
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const [orgRes, projectsRes, clustersRes] = await Promise.all([
          fetch('/api/organizations'),
          fetch('/api/projects'),
          fetch('/api/clusters'),
        ]);

        const orgs = await orgRes.json();
        const projects = await projectsRes.json();
        const clusters = await clustersRes.json();

        setData({
          organization: orgs?.[0] ?? null,
          projects: projects ?? [],
          clusters: clusters ?? [],
        });
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-cyan-500" />
      </div>
    );
  }

  const stats = [
    {
      name: 'Organization',
      value: data?.organization?.name ?? 'N/A',
      icon: Building2,
      color: 'text-purple-400',
      bgColor: 'bg-purple-500/10',
    },
    {
      name: 'Projects',
      value: data?.projects?.length ?? 0,
      icon: FolderKanban,
      color: 'text-blue-400',
      bgColor: 'bg-blue-500/10',
    },
    {
      name: 'Clusters',
      value: data?.clusters?.length ?? 0,
      icon: Database,
      color: 'text-cyan-400',
      bgColor: 'bg-cyan-500/10',
    },
    {
      name: 'Total Nodes',
      value: (data?.clusters ?? []).reduce((acc, c) => acc + (c?._count?.nodes ?? 0), 0),
      icon: Server,
      color: 'text-emerald-400',
      bgColor: 'bg-emerald-500/10',
    },
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-100">Dashboard</h1>
          <p className="mt-1 text-slate-400">
            Welcome back, {session?.user?.name ?? session?.user?.email ?? 'User'}
          </p>
        </div>
        <Link href="/clusters/new">
          <Button className="gap-2">
            <Plus className="h-4 w-4" />
            New Cluster
          </Button>
        </Link>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat, index) => (
          <motion.div
            key={stat.name}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <Card className="hover:shadow-xl transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className={`rounded-lg p-3 ${stat.bgColor}`}>
                    <stat.icon className={`h-6 w-6 ${stat.color}`} />
                  </div>
                  <div>
                    <p className="text-sm text-slate-400">{stat.name}</p>
                    <p className="text-2xl font-bold text-slate-100">{stat.value}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Clusters Section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-slate-100">Recent Clusters</h2>
          <Link href="/clusters">
            <Button variant="ghost" className="gap-1">
              View all
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>

        {(data?.clusters?.length ?? 0) === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Database className="h-16 w-16 text-slate-600 mb-4" />
              <h3 className="text-lg font-medium text-slate-300 mb-2">No clusters yet</h3>
              <p className="text-slate-400 mb-4">Create your first PostgreSQL cluster to get started</p>
              <Link href="/clusters/new">
                <Button className="gap-2">
                  <Plus className="h-4 w-4" />
                  Create Cluster
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {(data?.clusters ?? []).slice(0, 6).map((cluster, index) => (
              <motion.div
                key={cluster?.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 + index * 0.1 }}
              >
                <Link href={`/clusters/${cluster?.id}`}>
                  <Card className="hover:shadow-xl hover:border-cyan-500/30 transition-all cursor-pointer group">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className="rounded-lg p-2 bg-cyan-500/10">
                            <Database className="h-5 w-5 text-cyan-400" />
                          </div>
                          <div>
                            <CardTitle className="text-lg group-hover:text-cyan-400 transition-colors">
                              {cluster?.name}
                            </CardTitle>
                            <CardDescription>{cluster?.project?.name ?? 'Unknown Project'}</CardDescription>
                          </div>
                        </div>
                        <StatusBadge status={cluster?.status ?? 'UNKNOWN'} />
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2 text-slate-400">
                          <Server className="h-4 w-4" />
                          <span>{cluster?._count?.nodes ?? 0} nodes</span>
                        </div>
                        <div className="flex items-center gap-2 text-slate-400">
                          <Activity className="h-4 w-4" />
                          <span>{cluster?.replicationMode ?? 'N/A'}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
