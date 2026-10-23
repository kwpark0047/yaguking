import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ApiError } from '@/lib/api/errors';
import { handle, ok } from '@/lib/api/respond';
import { getAuthUserId } from '@/lib/supabase/server';
import { assertAdmin, createQuestion, listQuestions } from '@/server/admin/questions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const createSchema = z.object({
  categorySlug: z.string().min(1),
  stem: z.string().min(5),
  explanation: z.string().optional(),
  difficulty: z.enum(['easy', 'normal', 'hard']),
  recordAsOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD 형식이어야 합니다.'),
  eraYear: z.number().int().min(1982).max(2100).optional(),
  options: z
    .array(
      z.object({
        label: z.enum(['A', 'B', 'C', 'D']),
        text: z.string().min(1),
        isCorrect: z.boolean(),
      }),
    )
    .length(4),
  source: z.object({
    name: z.string().min(1),
    url: z.string().url().optional(),
    verifiedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }),
});

export async function GET(request: NextRequest) {
  return handle(async () => {
    const userId = await getAuthUserId();
    if (!userId) throw new ApiError('UNAUTHORIZED');
    await assertAdmin(userId);

    const status = request.nextUrl.searchParams.get('status');
    return ok(await listQuestions(status));
  });
}

export async function POST(request: NextRequest) {
  return handle(async () => {
    const userId = await getAuthUserId();
    if (!userId) throw new ApiError('UNAUTHORIZED');
    await assertAdmin(userId);

    const body = await request.json().catch(() => ({}));
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(
        'VALIDATION_ERROR',
        parsed.error.issues[0]?.message ?? '문항 값을 확인해 주세요.',
      );
    }

    return ok(await createQuestion(parsed.data, userId), 201);
  });
}
