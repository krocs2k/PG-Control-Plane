'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  Shield, FileCheck, Users, ScrollText, DollarSign,
  Loader2, AlertTriangle, CheckCircle, XCircle, TrendingUp,
  ShieldOff, Key
} from 'lucide-react';

interface Cluster {
  id: string;
  name: string;
}

interface MFASecurityAlert {
  id: string;
  alertType: string;
  message: string;
  adminName: string | null;
  adminEmail: string | null;
  createdAt: string;
}

interface AdminWithoutMFA {
  id: string;
  name: string | null;
  email: string;
  role: string;
}

interface MFASettings {
  mfaRequiredForDBAdmin: boolean;
  dbAdminMfaDisabledBy: string | null;
  dbAdminMfaDisabledAt: string | null;
}

type ScanType = 'compliance' | 'access_review' | 'audit_analysis' | 'security_posture' | 'cost_analysis';

export default function GovernancePage() {
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [selectedCluster, setSelectedCluster] = useState<string>('none');
  const [loading, setLoading] = useState(false);
  const [activeScan, setActiveScan] = useState<ScanType | null>(null);
  const [scanResults, setScanResults] = useState<Record<string, any>>({});
  const [error, setError] = useState<string | null>(null);
  
  // MFA Security Alerts
  const [mfaSettings, setMfaSettings] = useState<MFASettings | null>(null);
  const [mfaSecurityAlerts, setMfaSecurityAlerts] = useState<MFASecurityAlert[]>([]);
  const [adminsWithoutMFA, setAdminsWithoutMFA] = useState<AdminWithoutMFA[]>([]);

  useEffect(() => {
    fetch('/api/clusters')
      .then(res => res.json())
      .then(data => setClusters(data))
      .catch(console.error);

    // Fetch MFA security alerts
    fetch('/api/admin/mfa-settings')
      .then(res => res.json())
      .then(data => {
        setMfaSettings(data.settings || null);
        setMfaSecurityAlerts(data.securityAlerts || []);
        setAdminsWithoutMFA(data.adminsWithoutMFA || []);
      })
      .catch(console.error);
  }, []);

  const runScan = async (scanType: ScanType) => {
    setLoading(true);
    setActiveScan(scanType);
    setError(null);
    try {
      const response = await fetch('/api/ai/governance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scanType,
          clusterId: selectedCluster !== 'none' ? selectedCluster : undefined,
        }),
      });
      
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Scan failed with status ${response.status}`);
      }
      const result = await response.json();
      if (result.error) {
        throw new Error(result.error);
      }
      setScanResults(prev => ({ ...prev, [scanType]: result }));
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An error occurred';
      console.error('Governance scan error:', err);
      setError(errorMessage);
    } finally {
      setLoading(false);
      setActiveScan(null);
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-400';
    if (score >= 60) return 'text-yellow-400';
    return 'text-red-400';
  };

  const getGradeColor = (grade: string) => {
    switch (grade) {
      case 'A': return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'B': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'C': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      case 'D': return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
      case 'F': return 'bg-red-500/20 text-red-400 border-red-500/30';
      default: return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
    }
  };

  const scanCards = [
    {
      type: 'compliance' as ScanType,
      title: 'Compliance Scan',
      description: 'Check against CIS, SOC2, GDPR, PCI-DSS standards',
      icon: FileCheck,
      color: 'text-blue-400',
    },
    {
      type: 'access_review' as ScanType,
      title: 'Access Review',
      description: 'Analyze user privileges and access patterns',
      icon: Users,
      color: 'text-purple-400',
    },
    {
      type: 'audit_analysis' as ScanType,
      title: 'Audit Analysis',
      description: 'Detect anomalies in audit log patterns',
      icon: ScrollText,
      color: 'text-orange-400',
    },
    {
      type: 'security_posture' as ScanType,
      title: 'Security Posture',
      description: 'Overall security assessment and scoring',
      icon: Shield,
      color: 'text-green-400',
    },
    {
      type: 'cost_analysis' as ScanType,
      title: 'FinOps Analysis',
      description: 'Resource utilization and cost optimization',
      icon: DollarSign,
      color: 'text-yellow-400',
    },
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Shield className="h-7 w-7 text-green-400" />
            Governance & FinOps
          </h1>
          <p className="text-slate-400 mt-1">Security compliance, access review, and cost analysis</p>
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

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-red-400 font-medium">Error</p>
            <p className="text-red-300 text-sm">{error}</p>
          </div>
        </div>
      )}

      {/* MFA Security Warnings */}
      {(mfaSecurityAlerts.filter(a => a.alertType === 'DB_ADMIN_MFA_DISABLED').length > 0 || adminsWithoutMFA.length > 0) && (
        <Card className="bg-amber-500/5 border-amber-500/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-amber-400 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Security Warnings
            </CardTitle>
            <CardDescription className="text-amber-300/70">
              These issues require attention to maintain security compliance
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* DB Admin MFA Disabled Alert */}
            {mfaSecurityAlerts.filter(a => a.alertType === 'DB_ADMIN_MFA_DISABLED').map(alert => (
              <div key={alert.id} className="flex items-start gap-3 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                <Key className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-red-300 font-medium">DB Admin MFA Disabled</p>
                  <p className="text-red-400/80 text-sm">{alert.message}</p>
                  <p className="text-red-400/60 text-xs mt-1">
                    {new Date(alert.createdAt).toLocaleString()}
                  </p>
                </div>
              </div>
            ))}

            {/* Admins Without MFA */}
            {adminsWithoutMFA.length > 0 && (
              <div className="flex items-start gap-3 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                <ShieldOff className="h-5 w-5 text-amber-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-amber-300 font-medium">
                    {adminsWithoutMFA.length} Admin{adminsWithoutMFA.length > 1 ? 's' : ''} Without MFA
                  </p>
                  <p className="text-amber-400/80 text-sm mb-2">
                    These administrators should enable MFA to improve security posture.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {adminsWithoutMFA.map(admin => (
                      <Badge
                        key={admin.id}
                        className="bg-amber-500/20 text-amber-300 border border-amber-500/30"
                      >
                        <ShieldOff className="h-3 w-3 mr-1" />
                        {admin.name || admin.email} ({admin.role})
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {scanCards.map(scan => {
          const Icon = scan.icon;
          const result = scanResults[scan.type];
          const isRunning = loading && activeScan === scan.type;
          
          return (
            <Card key={scan.type} className="bg-slate-800 border-slate-700 hover:border-slate-600 transition-colors">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <Icon className={`h-8 w-8 ${scan.color}`} />
                  {result && (
                    <div className="text-right">
                      {result.overallScore !== undefined && (
                        <span className={`text-2xl font-bold ${getScoreColor(result.overallScore)}`}>
                          {result.overallScore}
                        </span>
                      )}
                      {result.securityScore !== undefined && (
                        <span className={`text-2xl font-bold ${getScoreColor(result.securityScore)}`}>
                          {result.securityScore}
                        </span>
                      )}
                      {result.riskScore !== undefined && (
                        <span className={`text-2xl font-bold ${getScoreColor(100 - result.riskScore)}`}>
                          {result.riskScore}
                        </span>
                      )}
                      {result.utilizationScore !== undefined && (
                        <span className={`text-2xl font-bold ${getScoreColor(result.utilizationScore)}`}>
                          {result.utilizationScore}
                        </span>
                      )}
                      {result.grade && (
                        <Badge className={`ml-2 ${getGradeColor(result.grade)}`}>
                          Grade {result.grade}
                        </Badge>
                      )}
                    </div>
                  )}
                </div>
                <CardTitle className="text-lg mt-2">{scan.title}</CardTitle>
                <CardDescription>{scan.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <Button 
                  onClick={() => runScan(scan.type)} 
                  disabled={loading}
                  className="w-full bg-slate-700 hover:bg-slate-600"
                >
                  {isRunning ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Scanning...</>
                  ) : (
                    <><Shield className="h-4 w-4 mr-2" /> Run Scan</>
                  )}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {scanResults.compliance && (
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileCheck className="h-5 w-5 text-blue-400" />
              Compliance Scan Results
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <div className="flex justify-between mb-1">
                  <span className="text-slate-400">Compliance Score</span>
                  <span className={getScoreColor(scanResults.compliance.overallScore || 0)}>
                    {scanResults.compliance.overallScore || 0}%
                  </span>
                </div>
                <Progress 
                  value={scanResults.compliance.overallScore || 0} 
                  className="h-2 bg-slate-700"
                />
              </div>
              <Badge className={scanResults.compliance.complianceLevel === 'compliant' 
                ? 'bg-green-500/20 text-green-400' 
                : scanResults.compliance.complianceLevel === 'partial'
                ? 'bg-yellow-500/20 text-yellow-400'
                : 'bg-red-500/20 text-red-400'}>
                {scanResults.compliance.complianceLevel || 'Unknown'}
              </Badge>
            </div>
            {scanResults.compliance.summary && (
              <p className="text-slate-300">{scanResults.compliance.summary}</p>
            )}
            {scanResults.compliance.findings?.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-medium text-white">Findings</h4>
                {scanResults.compliance.findings.map((finding: any, idx: number) => (
                  <div key={idx} className="bg-slate-900 p-3 rounded border border-slate-700">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="secondary" className="text-slate-300">{finding.category}</Badge>
                      {finding.status === 'pass' ? (
                        <CheckCircle className="h-4 w-4 text-green-400" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-400" />
                      )}
                    </div>
                    <p className="text-slate-300 text-sm">{finding.finding}</p>
                    {finding.remediation && (
                      <p className="text-slate-500 text-sm mt-1">→ {finding.remediation}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {scanResults.security_posture && (
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-green-400" />
              Security Posture Assessment
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {scanResults.security_posture.categories?.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {scanResults.security_posture.categories.map((cat: any, idx: number) => (
                  <div key={idx} className="bg-slate-900 p-4 rounded border border-slate-700">
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-medium text-white">{cat.name}</span>
                      <span className={getScoreColor(cat.score)}>{cat.score}/100</span>
                    </div>
                    <Progress value={cat.score} className="h-2 bg-slate-700" />
                    <p className="text-slate-400 text-sm mt-2">{cat.status}</p>
                  </div>
                ))}
              </div>
            )}
            {scanResults.security_posture.criticalFindings?.length > 0 && (
              <div>
                <h4 className="font-medium text-red-400 flex items-center gap-2 mb-2">
                  <AlertTriangle className="h-4 w-4" /> Critical Findings
                </h4>
                <ul className="space-y-1">
                  {scanResults.security_posture.criticalFindings.map((finding: string, idx: number) => (
                    <li key={idx} className="text-red-300 text-sm">• {finding}</li>
                  ))}
                </ul>
              </div>
            )}
            {scanResults.security_posture.summary && (
              <p className="text-slate-300">{scanResults.security_posture.summary}</p>
            )}
          </CardContent>
        </Card>
      )}

      {scanResults.access_review && (
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-purple-400" />
              Access Review Results
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {scanResults.access_review.users?.length > 0 && (
              <div className="space-y-2">
                {scanResults.access_review.users.map((user: any, idx: number) => (
                  <div key={idx} className="bg-slate-900 p-3 rounded border border-slate-700 flex items-center justify-between">
                    <div>
                      <span className="text-white font-medium">{user.user}</span>
                      <span className="text-slate-400 ml-2">({user.role})</span>
                    </div>
                    <Badge className={user.riskLevel === 'high' 
                      ? 'bg-red-500/20 text-red-400'
                      : user.riskLevel === 'medium'
                      ? 'bg-yellow-500/20 text-yellow-400'
                      : 'bg-green-500/20 text-green-400'}>
                      {user.riskLevel} risk
                    </Badge>
                  </div>
                ))}
              </div>
            )}
            {scanResults.access_review.summary && (
              <p className="text-slate-300">{scanResults.access_review.summary}</p>
            )}
          </CardContent>
        </Card>
      )}

      {scanResults.audit_analysis && (
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ScrollText className="h-5 w-5 text-orange-400" />
              Audit Log Analysis
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Badge className={scanResults.audit_analysis.threatLevel === 'critical'
              ? 'bg-red-500/20 text-red-400'
              : scanResults.audit_analysis.threatLevel === 'high'
              ? 'bg-orange-500/20 text-orange-400'
              : scanResults.audit_analysis.threatLevel === 'medium'
              ? 'bg-yellow-500/20 text-yellow-400'
              : 'bg-green-500/20 text-green-400'}>
              Threat Level: {scanResults.audit_analysis.threatLevel || 'Unknown'}
            </Badge>
            {scanResults.audit_analysis.anomalies?.length > 0 && (
              <div>
                <h4 className="font-medium text-white mb-2">Detected Anomalies</h4>
                {scanResults.audit_analysis.anomalies.map((anomaly: any, idx: number) => (
                  <div key={idx} className="bg-slate-900 p-3 rounded border border-slate-700 mb-2">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-yellow-400" />
                      <span className="text-white">{anomaly.type}</span>
                    </div>
                    <p className="text-slate-400 text-sm mt-1">{anomaly.description}</p>
                  </div>
                ))}
              </div>
            )}
            {scanResults.audit_analysis.summary && (
              <p className="text-slate-300">{scanResults.audit_analysis.summary}</p>
            )}
          </CardContent>
        </Card>
      )}

      {scanResults.cost_analysis && (
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-yellow-400" />
              FinOps Analysis Results
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {scanResults.cost_analysis.estimatedMonthlyCost && (
              <div className="bg-slate-900 p-4 rounded border border-slate-700">
                <span className="text-slate-400">Estimated Monthly Cost</span>
                <div className="text-3xl font-bold text-yellow-400">
                  ${typeof scanResults.cost_analysis.estimatedMonthlyCost === 'number' 
                    ? scanResults.cost_analysis.estimatedMonthlyCost.toLocaleString()
                    : scanResults.cost_analysis.estimatedMonthlyCost}
                </div>
              </div>
            )}
            {scanResults.cost_analysis.optimizations?.length > 0 && (
              <div>
                <h4 className="font-medium text-white mb-2 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-green-400" /> Optimization Opportunities
                </h4>
                {scanResults.cost_analysis.optimizations.map((opt: any, idx: number) => (
                  <div key={idx} className="bg-slate-900 p-3 rounded border border-slate-700 mb-2">
                    <div className="flex justify-between items-start">
                      <span className="text-white font-medium">{opt.area}</span>
                      {opt.potentialSavings && (
                        <Badge className="bg-green-500/20 text-green-400">
                          Save ${opt.potentialSavings}
                        </Badge>
                      )}
                    </div>
                    <p className="text-slate-400 text-sm mt-1">{opt.recommendation}</p>
                  </div>
                ))}
              </div>
            )}
            {scanResults.cost_analysis.summary && (
              <p className="text-slate-300">{scanResults.cost_analysis.summary}</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
