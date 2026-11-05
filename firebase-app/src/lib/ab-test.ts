/**
 * A/B 테스트 프레임워크.
 *
 * 회원 가입 페이지, 랜딩 페이지 등의 Variants를 사용자에게 할당하고,
 * 전환율을 측정한다. 할당은 사용자 ID 기반 해시로 deterministic하게
 * 수행하므로 같은 사용자는 항상 같은 Variant를 본다.
 *
 * 사용 예:
 *   const test = abTest('signup-page', ['control', 'variant-a'], uid);
 *   if (test.variant === 'variant-a') renderVariantA();
 *   else renderControl();
 *   trackEvent('ab_test_assign', { test: 'signup-page', variant: test.variant });
 */

export type Variant = string;

/** A/B 테스트 정의 */
export interface AbTestDef {
  /** 테스트 ID(Firestore에서 이벤트 필터링에 사용) */
  id: string;
  /** 테스트할 Variant 목록(첫 번째는 control) */
  variants: Variant[];
  /** 트래픽 비율(0~1, 합계는 1이어야 함). 지정하지 않으면 균등 할당 */
  weights?: number[];
  /** 테스트 활성화 여부 */
  active: boolean;
}

/** 할당 결과 */
export interface AbTestAssignment {
  testId: string;
  variant: Variant;
  variantIndex: number;
  isControl: boolean;
}

/** 간단한 문자열 해시(FNV-1a, deterministic) */
function hashString(str: string): number {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash += hash << 1 + hash << 4 + hash << 7 + hash << 8 + hash << 24;
    hash >>>= 0;
  }
  return hash;
}

/** 사용자 ID + 테스트 ID 기반으로 Variant 할당 */
export function assignVariant(
  testId: string,
  userId: string,
  variants: Variant[],
  weights?: number[],
): { variant: Variant; variantIndex: number } {
  const combined = `${testId}:${userId}`;
  const hash = hashString(combined);
  const normalized = hash / 0xffffffff; // 0 ~ 1

  let cumulative = 0;
  if (weights) {
    for (let i = 0; i < variants.length; i++) {
      cumulative += weights[i]!;
      if (normalized < cumulative) {
        return { variant: variants[i]!, variantIndex: i };
      }
    }
  } else {
    const step = 1 / variants.length;
    for (let i = 0; i < variants.length; i++) {
      if (normalized < step * (i + 1)) {
        return { variant: variants[i]!, variantIndex: i };
      }
    }
  }
  // fallback(부동소수점 오차 방지)
  return { variant: variants[variants.length - 1]!, variantIndex: variants.length - 1 };
}

/** A/B 테스트 할당(활성화되지 않은 테스트는 첫 번째 Variant 반환) */
export function abTest(
  testId: string,
  userId: string,
  def: AbTestDef,
): AbTestAssignment {
  if (!def.active || def.variants.length === 0) {
    const first = def.variants[0];
    return {
      testId,
      variant: first ?? 'control',
      variantIndex: 0,
      isControl: true,
    };
  }

  const { variant, variantIndex } = assignVariant(testId, userId, def.variants, def.weights);
  return {
    testId,
    variant,
    variantIndex,
    isControl: variantIndex === 0,
  };
}

/** 등록된 A/B 테스트 목록 */
export const AB_TESTS: Record<string, AbTestDef> = {
  'signup-page': {
    id: 'signup-page',
    variants: ['control', 'variant-a', 'variant-b'],
    active: false, // 운영자 설정으로 활성화
  },
  'landing-page': {
    id: 'landing-page',
    variants: ['control', 'variant-a'],
    active: false,
  },
};

/** 테스트 ID로 정의 조회 */
export function getAbTest(testId: string): AbTestDef | undefined {
  return AB_TESTS[testId];
}

/** 모든 활성 테스트 반환 */
export function getActiveAbTests(): AbTestDef[] {
  return Object.values(AB_TESTS).filter((t) => t.active);
}
