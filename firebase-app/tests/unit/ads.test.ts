import { describe, expect, it } from 'vitest';
import { ADS_PARAGRAPH, ENGAGEMENT_PRIVACY_EFFECTIVE, PRIVACY_SECTIONS, PRIVACY_VERSIONS } from '@/content/privacy';
import { AD_LIMITS, AD_SLOTS, adProblem, adStatus, buildPublicAds, linkKind, liveImageCount, pickAd, type Ad } from '@/lib/ads/ads';
import { parsePublicHome } from '@/lib/public/home';

/** 광고(docs/ads-plan.md) — 칸 검사·주소 안전·게시 중 거르기·가중치·공개 묶음·처리방침 문구 */
const now = Date.UTC(2026, 10, 10);
const HOUR = 3_600_000;
const ad = (patch: Partial<Ad> = {}): Ad => ({
  id: 'a1',
  slot: 'home-top',
  title: '야구왕 공식전',
  text: '하루 5문제',
  cta: '하러 가기',
  link: '/official',
  advertiser: '야구왕',
  startsAt: now - HOUR,
  endsAt: now + HOUR,
  weight: 1,
  alt: '',
  hidden: false,
  image: null,
  ...patch,
});

describe('이동 주소', () => {
  it('앱 안(/…)과 https만 — javascript:·//·http·빈칸은 거절', () => {
    expect(linkKind('/ranking')).toBe('internal');
    expect(linkKind('https://example.com/a?b=1')).toBe('external');
    for (const bad of ['javascript:alert(1)', '//evil.example', 'http://example.com', 'https://', '/a b', ''])
      expect(linkKind(bad), bad).toBeNull();
  });
});

describe('광고 칸', () => {
  it('위치·제목·단추·주소·광고주·기간·가중치, 이미지가 있으면 대체 글 필수', () => {
    expect(adProblem(ad())).toBeNull();
    expect(adProblem(ad({ slot: 'side' as never }))).toContain('위치');
    expect(adProblem(ad({ title: 'x'.repeat(AD_LIMITS.title + 1) }))).toContain('제목');
    expect(adProblem(ad({ cta: '' }))).toContain('단추');
    expect(adProblem(ad({ link: 'javascript:alert(1)' }))).toContain('주소');
    expect(adProblem(ad({ advertiser: ' ' }))).toContain('광고주');
    expect(adProblem(ad({ endsAt: now - 2 * HOUR }))).toContain('끝');
    expect(adProblem(ad({ weight: 0 }))).toContain('가중치');
    expect(adProblem(ad({ image: { w: 1200, h: 300, v: 1 }, alt: '' }))).toContain('대체 글');
    expect(adProblem(ad({ image: { w: 1200, h: 300, v: 1 }, alt: '공식전 배너' }))).toBeNull();
  });

  it('상태: 게시 중·예약·끝남·숨김', () => {
    expect(adStatus(ad(), now)).toBe('live');
    expect(adStatus(ad({ startsAt: now + HOUR, endsAt: now + 2 * HOUR }), now)).toBe('scheduled');
    expect(adStatus(ad({ startsAt: now - 2 * HOUR, endsAt: now }), now)).toBe('ended');
    expect(adStatus(ad({ hidden: true }), now)).toBe('hidden');
    expect(liveImageCount([ad({ image: { w: 1, h: 1, v: 1 } }), ad({ id: 'a2' })], now)).toBe(1);
  });
});

describe('공개 묶음·고르기', () => {
  it('숨김·끝남은 빼고(예약은 넣어 두어 시각이 되면 앱이 연다), 숨김 칸은 빠진다', () => {
    const list = buildPublicAds([ad(), ad({ id: 'h', hidden: true }), ad({ id: 'e', endsAt: now - 1 }), ad({ id: 's', startsAt: now + HOUR, endsAt: now + 2 * HOUR })], now);
    expect(list.map((item) => item.id)).toEqual(['a1', 's']);
    expect(list[0]).not.toHaveProperty('hidden');
    expect(buildPublicAds(Array.from({ length: 15 }, (_, i) => ad({ id: `x${i}` })), now)).toHaveLength(AD_LIMITS.publicMax);
  });

  it('지금 그 자리의 광고를 가중치대로 — 다른 자리·예약·끝난 광고는 고르지 않는다', () => {
    const ads = [ad({ id: 'light', weight: 1 }), ad({ id: 'heavy', weight: 3 }), ad({ id: 'play', slot: 'play-bottom' }), ad({ id: 'later', startsAt: now + HOUR, endsAt: now + 2 * HOUR })];
    expect(pickAd(ads, 'home-top', now, () => 0)?.id).toBe('light');
    expect(pickAd(ads, 'home-top', now, () => 0.3)?.id).toBe('heavy');
    expect(pickAd(ads, 'play-bottom', now, () => 0.99)?.id).toBe('play');
    expect(pickAd([], 'home-top', now)).toBeNull();
    let heavy = 0;
    let seed = 3;
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 4000; i += 1) if (pickAd(ads, 'home-top', now, random)?.id === 'heavy') heavy += 1;
    expect(heavy / 4000).toBeGreaterThan(0.7);
    expect(heavy / 4000).toBeLessThan(0.8);
  });

  it('앱이 읽는 공개 묶음에서 모양이 틀린 광고(위치·주소)는 버린다', () => {
    const value = (fields: Record<string, unknown>) => ({
      mapValue: {
        fields: Object.fromEntries(
          Object.entries(fields).map(([key, item]) => [key, typeof item === 'number' ? { integerValue: String(item) } : { stringValue: String(item) }]),
        ),
      },
    });
    const good = { id: 'a1', slot: 'home-top', title: 't', text: '', cta: 'c', link: '/x', advertiser: 'y', startsAt: 1, endsAt: 2, weight: 1, alt: '' };
    const home = parsePublicHome({
      fields: { ads: { arrayValue: { values: [value(good), value({ ...good, id: 'b', link: 'javascript:x' }), value({ ...good, id: 'c', slot: 'popup' })] } } },
    });
    expect(home.ads.map((item) => item.id)).toEqual(['a1']);
    expect(home.notices).toEqual([]);
  });

  it('자리 크기 — 메인 4:1, 게임 6:1', () => {
    expect(AD_SLOTS['home-top'].width / AD_SLOTS['home-top'].height).toBe(4);
    expect(AD_SLOTS['play-bottom'].width / AD_SLOTS['play-bottom'].height).toBe(6);
  });
});

describe('처리방침', () => {
  it('지금 판은 "광고 쓰지 않음", 11-05 판에서 "운영자가 직접 올리는 광고"로 바뀐다(수집 항목은 그대로)', () => {
    expect(JSON.stringify(PRIVACY_SECTIONS)).toContain('광고나 방문 분석 도구도 쓰지 않습니다');
    const next = PRIVACY_VERSIONS.find((version) => version.effective === ENGAGEMENT_PRIVACY_EFFECTIVE)!;
    const items = next.sections.find((section) => section.id === 'items')!;
    expect(items.paragraphs).toEqual([ADS_PARAGRAPH]);
    expect(ADS_PARAGRAPH).toContain('외부 광고 네트워크나 방문 분석 도구는 쓰지 않습니다');
    expect(next.changes.join(' ')).toContain('운영자가 직접 올리는 광고');
  });
});
