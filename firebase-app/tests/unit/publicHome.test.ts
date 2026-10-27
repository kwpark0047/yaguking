import { describe, expect, it } from 'vitest';
import { parsePublicHome } from '@/lib/public/home';

/** 공개 묶음 REST 응답 읽기 — Firestore SDK 없이(첫 방문 전송량) */
describe('공개 묶음(public/home) 읽기', () => {
  const notice = (fields: Record<string, unknown>) => ({ mapValue: { fields } });

  it('공지의 글자·시각·고정·끝 없음(null)을 읽는다', () => {
    const home = parsePublicHome({
      fields: {
        notices: {
          arrayValue: {
            values: [
              notice({
                id: { stringValue: 'n1' },
                title: { stringValue: '점검 안내' },
                body: { stringValue: '새벽 점검' },
                startsAt: { timestampValue: '2026-10-27T00:00:00Z' },
                endsAt: { nullValue: null },
                pinned: { booleanValue: true },
              }),
            ],
          },
        },
        updatedAt: { timestampValue: '2026-10-27T01:00:00Z' },
      },
    } as never);
    expect(home.notices).toEqual([
      { id: 'n1', title: '점검 안내', body: '새벽 점검', startsAt: Date.parse('2026-10-27T00:00:00Z'), endsAt: null, pinned: true },
    ]);
  });

  it('문서가 없거나 비었거나 모양이 틀린 공지는 버리고 빈 목록', () => {
    expect(parsePublicHome(null).notices).toEqual([]);
    expect(parsePublicHome({ fields: {} }).notices).toEqual([]);
    const broken = parsePublicHome({
      fields: { notices: { arrayValue: { values: [notice({ title: { stringValue: 'id 없음' } }), notice({ id: { stringValue: 'x' } })] } } },
    } as never);
    expect(broken.notices).toEqual([]);
  });
});
