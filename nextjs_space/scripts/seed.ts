import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting seed...');

  // Create demo organization
  const org = await prisma.organization.upsert({
    where: { id: 'acme-corp-org' },
    update: {},
    create: {
      id: 'acme-corp-org',
      name: 'Acme Corp',
    },
  });
  console.log('✅ Created organization:', org.name);

  // Create demo admin user (admin@acme.com / password123)
  const passwordHash = await bcrypt.hash('password123', 10);
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@acme.com' },
    update: {},
    create: {
      email: 'admin@acme.com',
      passwordHash,
      name: 'Admin User',
      role: 'ADMIN',
      orgId: org.id,
    },
  });
  console.log('✅ Created admin user:', adminUser.email);

  // Create test user (john@doe.com / johndoe123)
  const testPasswordHash = await bcrypt.hash('johndoe123', 10);
  const testUser = await prisma.user.upsert({
    where: { email: 'john@doe.com' },
    update: {},
    create: {
      email: 'john@doe.com',
      passwordHash: testPasswordHash,
      name: 'John Doe',
      role: 'OWNER',
      orgId: org.id,
    },
  });
  console.log('✅ Created test user:', testUser.email);

  // Create demo project
  const project = await prisma.project.upsert({
    where: { id: 'production-project' },
    update: {},
    create: {
      id: 'production-project',
      name: 'Production',
      environment: 'PROD',
      orgId: org.id,
    },
  });
  console.log('✅ Created project:', project.name);

  // Create demo cluster
  const cluster = await prisma.cluster.upsert({
    where: { id: 'main-cluster' },
    update: {},
    create: {
      id: 'main-cluster',
      name: 'main-cluster',
      topology: 'standard',
      status: 'HEALTHY',
      replicationMode: 'ASYNC',
      projectId: project.id,
    },
  });
  console.log('✅ Created cluster:', cluster.name);

  // Create nodes
  const primaryNode = await prisma.node.upsert({
    where: { id: 'pg-primary-node' },
    update: {},
    create: {
      id: 'pg-primary-node',
      name: 'pg-primary',
      host: 'pg-primary.cluster.local',
      port: 5432,
      role: 'PRIMARY',
      status: 'ONLINE',
      clusterId: cluster.id,
    },
  });
  console.log('✅ Created primary node:', primaryNode.name);

  const replica1 = await prisma.node.upsert({
    where: { id: 'pg-replica-1-node' },
    update: {},
    create: {
      id: 'pg-replica-1-node',
      name: 'pg-replica-1',
      host: 'pg-replica-1.cluster.local',
      port: 5433,
      role: 'REPLICA',
      status: 'ONLINE',
      clusterId: cluster.id,
    },
  });
  console.log('✅ Created replica node:', replica1.name);

  const replica2 = await prisma.node.upsert({
    where: { id: 'pg-replica-2-node' },
    update: {},
    create: {
      id: 'pg-replica-2-node',
      name: 'pg-replica-2',
      host: 'pg-replica-2.cluster.local',
      port: 5434,
      role: 'REPLICA',
      status: 'ONLINE',
      clusterId: cluster.id,
    },
  });
  console.log('✅ Created replica node:', replica2.name);

  // Create audit log entry
  await prisma.auditLog.create({
    data: {
      userId: adminUser.id,
      entityType: 'Cluster',
      entityId: cluster.id,
      action: 'CREATE',
      afterState: JSON.stringify(cluster),
    },
  });
  console.log('✅ Created audit log entry');

  console.log('\n🎉 Seed completed successfully!');
  console.log('\n📋 Demo credentials:');
  console.log('   Email: admin@acme.com');
  console.log('   Password: password123');
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
