'use server';

import { refresh } from 'next/cache';
import mongoose from 'mongoose';
import { action } from '@/lib/action';
import { writeAudit } from '@/lib/audit';
import { db, isDuplicateKey } from '@/lib/db';
import { validateScheme } from '@/lib/domain/structure';
import { AppError } from '@/lib/errors';
import { EvaluationScheme } from '@/lib/models/evaluation-scheme';
import { CreateSchemeVersion } from '@/lib/schemas/structure';

// A scheme is never edited: saving inserts version n+1 as active and retires the previous one (05 §3.7).
export const createSchemeVersion = action({ input: CreateSchemeVersion, roles: ['admin'] }, async (input, viewer) => {
  const problems = validateScheme(input);
  if (problems.length > 0) throw new AppError('VALIDATION', problems.join(' '));
  await db();
  try {
    await mongoose.connection.transaction(async (session) => {
      const latest = await EvaluationScheme.findOne({ componentKey: input.componentKey }, { version: 1 }, { session })
        .sort({ version: -1 })
        .lean();
      const version = (latest?.version ?? 0) + 1;
      await EvaluationScheme.updateMany(
        { componentKey: input.componentKey, status: 'active' },
        { $set: { status: 'retired' } },
        { session },
      );
      const [created] = await EvaluationScheme.create(
        [
          {
            componentKey: input.componentKey,
            version,
            name: input.name,
            internalMax: input.internalMax,
            externalMax: input.externalMax,
            components: input.components.map((c) => ({
              ...c,
              bestN: c.aggregation === 'best_n' ? c.bestN : undefined,
            })),
            rounding: { decimals: input.decimals, mode: input.roundingMode },
            status: 'active',
            createdBy: viewer.id,
          },
        ],
        { session },
      );
      await writeAudit(
        {
          actorId: viewer.id,
          action: 'scheme.versioned',
          entity: 'scheme',
          entityId: String(created._id),
          before: latest ? { version: latest.version } : null,
          after: { componentKey: input.componentKey, version, name: input.name },
        },
        session,
      );
    });
  } catch (error) {
    if (isDuplicateKey(error)) {
      throw new AppError('CONFLICT', 'Another version was saved at the same moment. Reload and try again.');
    }
    throw error;
  }
  refresh();
});
