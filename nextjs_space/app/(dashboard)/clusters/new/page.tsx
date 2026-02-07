'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Database, ArrowLeft, Loader2, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface Project {
  id: string;
  name: string;
  environment: string;
}

export default function NewClusterPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    projectId: '',
    topology: 'standard',
    replicationMode: 'ASYNC',
  });
  const [error, setError] = useState('');

  useEffect(() => {
    async function fetchProjects() {
      try {
        const res = await fetch('/api/projects');
        const data = await res.json();
        setProjects(data ?? []);
        if ((data ?? []).length > 0) {
          setFormData((prev) => ({ ...prev, projectId: data[0]?.id ?? '' }));
        }
      } catch (err) {
        console.error('Error fetching projects:', err);
      }
    }
    fetchProjects();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/clusters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data?.error || 'Failed to create cluster');
        return;
      }

      router.push(`/clusters/${data?.id}`);
    } catch (err) {
      setError('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const topologies = [
    { value: 'standard', label: 'Standard', description: 'Single primary with replicas' },
    { value: 'ha', label: 'High Availability', description: 'Primary with sync replica and async replicas' },
    { value: 'multi-region', label: 'Multi-Region', description: 'Distributed across multiple regions' },
  ];

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/clusters">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-slate-100">Create Cluster</h1>
          <p className="mt-1 text-slate-400">Configure a new PostgreSQL cluster</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="rounded-lg p-3 bg-cyan-500/10">
              <Database className="h-6 w-6 text-cyan-400" />
            </div>
            <div>
              <CardTitle>Cluster Configuration</CardTitle>
              <CardDescription>Define the basic settings for your cluster</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="rounded-md bg-red-500/10 border border-red-500/30 p-3 text-sm text-red-400">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300">Cluster Name</label>
              <div className="relative">
                <Database className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  placeholder="my-cluster"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="pl-10"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300">Project</label>
              <Select
                value={formData.projectId}
                onChange={(e) => setFormData({ ...formData, projectId: e.target.value })}
                required
              >
                <option value="" disabled>
                  Select a project
                </option>
                {(projects ?? []).map((project) => (
                  <option key={project?.id} value={project?.id}>
                    {project?.name} ({project?.environment})
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-3">
              <label className="text-sm font-medium text-slate-300">Topology</label>
              <div className="grid gap-3">
                {topologies.map((topo) => (
                  <label
                    key={topo.value}
                    className={`flex items-center gap-4 p-4 rounded-lg border cursor-pointer transition-all ${
                      formData.topology === topo.value
                        ? 'border-cyan-500 bg-cyan-500/10'
                        : 'border-slate-700 hover:border-slate-600'
                    }`}
                  >
                    <input
                      type="radio"
                      name="topology"
                      value={topo.value}
                      checked={formData.topology === topo.value}
                      onChange={(e) => setFormData({ ...formData, topology: e.target.value })}
                      className="sr-only"
                    />
                    <div className="rounded-lg p-2 bg-slate-700/50">
                      <Layers className="h-5 w-5 text-slate-300" />
                    </div>
                    <div>
                      <p className="font-medium text-slate-200">{topo.label}</p>
                      <p className="text-sm text-slate-400">{topo.description}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300">Replication Mode</label>
              <Select
                value={formData.replicationMode}
                onChange={(e) => setFormData({ ...formData, replicationMode: e.target.value })}
              >
                <option value="ASYNC">Asynchronous</option>
                <option value="SYNC">Synchronous</option>
              </Select>
              <p className="text-xs text-slate-400">
                {formData.replicationMode === 'SYNC'
                  ? 'Data is replicated synchronously for zero data loss'
                  : 'Data is replicated asynchronously for better performance'}
              </p>
            </div>

            <div className="flex gap-3 pt-4">
              <Link href="/clusters" className="flex-1">
                <Button type="button" variant="outline" className="w-full">
                  Cancel
                </Button>
              </Link>
              <Button type="submit" className="flex-1" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Create Cluster'
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
