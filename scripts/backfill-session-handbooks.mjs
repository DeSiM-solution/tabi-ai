#!/usr/bin/env node
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

function asNonEmptyString(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required for backfill.');
  }

  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
    log: ['error', 'warn'],
  });

  let createdCount = 0;
  let activeSetCount = 0;
  let skippedCount = 0;

  try {
    const sessions = await db.session.findMany({
      select: {
        id: true,
        title: true,
        activeHandbookId: true,
        state: {
          select: {
            context: true,
            blocks: true,
            spotBlocks: true,
            toolOutputs: true,
            handbookHtml: true,
            handbookGeneratedAt: true,
            previewPath: true,
          },
        },
        handbooks: {
          select: {
            id: true,
            updatedAt: true,
          },
          orderBy: { updatedAt: 'desc' },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    for (const session of sessions) {
      const existingHandbooks = session.handbooks ?? [];
      let activeHandbookId = session.activeHandbookId;
      let selectedId = existingHandbooks[0]?.id ?? null;

      const handbookHtml = asNonEmptyString(session.state?.handbookHtml);
      const hasExisting = existingHandbooks.length > 0;

      if (!hasExisting && handbookHtml) {
        const created = await db.handbook.create({
          data: {
            sessionId: session.id,
            title: asNonEmptyString(session.title) ?? 'Untitled Handbook',
            html: handbookHtml,
            lifecycle: 'DRAFT',
            publishedAt: null,
            archivedAt: null,
            generatedAt: session.state?.handbookGeneratedAt ?? null,
            sourceContext: session.state?.context ?? undefined,
            sourceBlocks: session.state?.blocks ?? undefined,
            sourceSpotBlocks: session.state?.spotBlocks ?? undefined,
            sourceToolOutputs: session.state?.toolOutputs ?? undefined,
            previewPath: session.state?.previewPath ?? null,
          },
          select: { id: true },
        });
        createdCount += 1;
        selectedId = created.id;
      }

      if (!selectedId) {
        skippedCount += 1;
        continue;
      }

      if (!activeHandbookId || activeHandbookId !== selectedId) {
        await db.session.update({
          where: { id: session.id },
          data: { activeHandbookId: selectedId },
        });
        activeSetCount += 1;
      }
    }

    console.log(
      JSON.stringify(
        {
          status: 'ok',
          createdCount,
          activeSetCount,
          skippedCount,
          total: createdCount + activeSetCount + skippedCount,
        },
        null,
        2,
      ),
    );
  } finally {
    await db.$disconnect();
  }
}

main().catch(error => {
  console.error('[backfill:handbooks] failed', error);
  process.exit(1);
});
