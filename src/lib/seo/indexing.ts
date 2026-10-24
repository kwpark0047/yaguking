/**
 * 검색 노출 스위치 (11 문서 §3).
 *
 * P1은 **퍼널 수치를 얻기 위한 소규모 노출**이다. 이 단계에서 검색에 잡히면
 * 의도하지 않은 유입이 섞여 수치가 더러워지고, 아직 개인정보 처리방침도
 * 확정되지 않았다. 그래서 **기본값은 색인 차단**이다.
 *
 * 공개 시점에 `SEARCH_INDEXING=allow`를 켜면 열린다. 반대로 두면(차단이
 * 기본) 환경변수를 깜빡했을 때 안전한 쪽으로 틀린다.
 */
export function indexingAllowed(): boolean {
  return process.env.SEARCH_INDEXING === 'allow';
}
