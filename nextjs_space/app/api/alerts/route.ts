import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { createAuditLog } from '@/lib/audit';

// GET - List alerts and rules
export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const clusterId = searchParams.get('clusterId');
    const status = searchParams.get('status');
    const severity = searchParams.get('severity');
    const getRules = searchParams.get('rules') === 'true';

    if (getRules) {
      // Get alert rules
      const rules = await prisma.alertRule.findMany({
        where: clusterId ? { OR: [{ clusterId }, { clusterId: null }] } : {},
        orderBy: { createdAt: 'desc' },
      });
      return NextResponse.json({ rules });
    }

    if (!clusterId) {
      return NextResponse.json({ error: 'clusterId is required' }, { status: 400 });
    }

    // Get alerts
    const whereClause: Record<string, unknown> = { clusterId };
    if (status) whereClause.status = status;
    if (severity) whereClause.severity = severity;

    const alerts = await prisma.alert.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    // Get alert stats
    const activeCount = await prisma.alert.count({ where: { clusterId, status: 'ACTIVE' } });
    const criticalCount = await prisma.alert.count({ where: { clusterId, status: 'ACTIVE', severity: 'CRITICAL' } });
    const acknowledgedCount = await prisma.alert.count({ where: { clusterId, status: 'ACKNOWLEDGED' } });

    // Get rules for this cluster
    const rules = await prisma.alertRule.findMany({
      where: { OR: [{ clusterId }, { clusterId: null }] },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({
      alerts,
      rules,
      stats: {
        active: activeCount,
        critical: criticalCount,
        acknowledged: acknowledgedCount,
        total: alerts.length,
      },
    });
  } catch (error) {
    console.error('Alerts GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch alerts' }, { status: 500 });
  }
}

// POST - Create alert or alert rule, or generate test alerts
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { action, clusterId } = body;

    if (action === 'create_rule') {
      // Create alert rule
      const { name, description, metric, operator, threshold, duration, severity, cooldownMinutes, notifyEmail, notifyWebhook, webhookUrl } = body;

      if (!name || !metric || !operator || threshold === undefined) {
        return NextResponse.json({ error: 'name, metric, operator, and threshold are required' }, { status: 400 });
      }

      const rule = await prisma.alertRule.create({
        data: {
          clusterId: clusterId || null,
          name,
          description,
          metric,
          operator,
          threshold,
          duration: duration || 60,
          severity: severity || 'WARNING',
          cooldownMinutes: cooldownMinutes || 5,
          notifyEmail: notifyEmail ?? true,
          notifyWebhook: notifyWebhook ?? false,
          webhookUrl,
        },
      });

      await createAuditLog({
        userId: session.user?.id,
        entityType: 'AlertRule',
        entityId: rule.id,
        action: 'CREATE_ALERT_RULE',
        afterState: rule,
      });

      return NextResponse.json({ rule });
    }

    if (action === 'generate_test') {
      // Generate test alerts for demo
      if (!clusterId) {
        return NextResponse.json({ error: 'clusterId is required' }, { status: 400 });
      }

      const testAlerts = [
        { severity: 'CRITICAL', title: 'High Replication Lag Detected', message: 'Replication lag exceeded 100ms threshold on replica node. Current lag: 250ms. This may impact read consistency.', metricName: 'replication_lag', metricValue: 250, threshold: 100 },
        { severity: 'WARNING', title: 'Connection Pool Near Capacity', message: 'Connection pool utilization at 85%. Consider increasing pool size or optimizing connection usage.', metricName: 'pool_utilization', metricValue: 85, threshold: 80 },
        { severity: 'ERROR', title: 'Disk Space Low', message: 'Available disk space is below 15%. Current: 12%. Immediate action required to prevent service disruption.', metricName: 'disk_free_percent', metricValue: 12, threshold: 15 },
        { severity: 'INFO', title: 'Scheduled Maintenance Window', message: 'Automated maintenance window starts in 2 hours. Minor latency spikes may occur during VACUUM operations.', metricName: 'maintenance', metricValue: 0, threshold: 0 },
      ];

      const createdAlerts = await Promise.all(
        testAlerts.map(alert =>
          prisma.alert.create({
            data: {
              clusterId,
              severity: alert.severity as 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL',
              status: 'ACTIVE',
              title: alert.title,
              message: alert.message,
              metricName: alert.metricName,
              metricValue: alert.metricValue,
              threshold: alert.threshold,
            },
          })
        )
      );

      return NextResponse.json({ alerts: createdAlerts });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Alerts POST error:', error);
    return NextResponse.json({ error: 'Failed to create alert/rule' }, { status: 500 });
  }
}

// PATCH - Update alert or rule
export async function PATCH(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { id, action, type } = body;

    if (!id || !action) {
      return NextResponse.json({ error: 'id and action are required' }, { status: 400 });
    }

    if (type === 'rule') {
      // Update alert rule
      const rule = await prisma.alertRule.findUnique({ where: { id } });
      if (!rule) {
        return NextResponse.json({ error: 'Rule not found' }, { status: 404 });
      }

      if (action === 'toggle') {
        const updated = await prisma.alertRule.update({
          where: { id },
          data: { enabled: !rule.enabled },
        });

        await createAuditLog({
          userId: session.user?.id,
          entityType: 'AlertRule',
          entityId: id,
          action: 'TOGGLE_RULE',
          beforeState: rule,
          afterState: updated,
        });

        return NextResponse.json({ rule: updated });
      }

      if (action === 'update') {
        const { name, description, metric, operator, threshold, duration, severity, cooldownMinutes, notifyEmail, notifyWebhook, webhookUrl, enabled } = body;

        const updated = await prisma.alertRule.update({
          where: { id },
          data: {
            name: name ?? rule.name,
            description: description ?? rule.description,
            metric: metric ?? rule.metric,
            operator: operator ?? rule.operator,
            threshold: threshold ?? rule.threshold,
            duration: duration ?? rule.duration,
            severity: severity ?? rule.severity,
            cooldownMinutes: cooldownMinutes ?? rule.cooldownMinutes,
            notifyEmail: notifyEmail ?? rule.notifyEmail,
            notifyWebhook: notifyWebhook ?? rule.notifyWebhook,
            webhookUrl: webhookUrl ?? rule.webhookUrl,
            enabled: enabled ?? rule.enabled,
          },
        });

        await createAuditLog({
          userId: session.user?.id,
          entityType: 'AlertRule',
          entityId: id,
          action: 'UPDATE_RULE',
          beforeState: rule,
          afterState: updated,
        });

        return NextResponse.json({ rule: updated });
      }
    }

    // Update alert
    const alert = await prisma.alert.findUnique({ where: { id } });
    if (!alert) {
      return NextResponse.json({ error: 'Alert not found' }, { status: 404 });
    }

    if (action === 'acknowledge') {
      const updated = await prisma.alert.update({
        where: { id },
        data: {
          status: 'ACKNOWLEDGED',
          acknowledgedBy: session.user?.email || 'Unknown',
          acknowledgedAt: new Date(),
        },
      });

      await createAuditLog({
        userId: session.user?.id,
        entityType: 'Alert',
        entityId: id,
        action: 'ACKNOWLEDGE_ALERT',
        beforeState: alert,
        afterState: updated,
      });

      return NextResponse.json({ alert: updated });
    }

    if (action === 'resolve') {
      const updated = await prisma.alert.update({
        where: { id },
        data: {
          status: 'RESOLVED',
          resolvedBy: session.user?.email || 'Unknown',
          resolvedAt: new Date(),
        },
      });

      await createAuditLog({
        userId: session.user?.id,
        entityType: 'Alert',
        entityId: id,
        action: 'RESOLVE_ALERT',
        beforeState: alert,
        afterState: updated,
      });

      return NextResponse.json({ alert: updated });
    }

    if (action === 'suppress') {
      const { duration } = body; // duration in minutes
      const suppressedUntil = new Date(Date.now() + (duration || 60) * 60000);

      const updated = await prisma.alert.update({
        where: { id },
        data: {
          status: 'SUPPRESSED',
          suppressedUntil,
        },
      });

      await createAuditLog({
        userId: session.user?.id,
        entityType: 'Alert',
        entityId: id,
        action: 'SUPPRESS_ALERT',
        beforeState: alert,
        afterState: updated,
      });

      return NextResponse.json({ alert: updated });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Alerts PATCH error:', error);
    return NextResponse.json({ error: 'Failed to update alert/rule' }, { status: 500 });
  }
}

// DELETE - Delete alert or rule
export async function DELETE(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const type = searchParams.get('type');

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    if (type === 'rule') {
      const rule = await prisma.alertRule.findUnique({ where: { id } });
      if (!rule) {
        return NextResponse.json({ error: 'Rule not found' }, { status: 404 });
      }

      await prisma.alertRule.delete({ where: { id } });

      await createAuditLog({
        userId: session.user?.id,
        entityType: 'AlertRule',
        entityId: id,
        action: 'DELETE_RULE',
        beforeState: rule,
      });

      return NextResponse.json({ success: true });
    }

    const alert = await prisma.alert.findUnique({ where: { id } });
    if (!alert) {
      return NextResponse.json({ error: 'Alert not found' }, { status: 404 });
    }

    await prisma.alert.delete({ where: { id } });

    await createAuditLog({
      userId: session.user?.id,
      entityType: 'Alert',
      entityId: id,
      action: 'DELETE_ALERT',
      beforeState: alert,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Alerts DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete alert/rule' }, { status: 500 });
  }
}
