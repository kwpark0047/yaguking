# 야구왕(YaguKing) 배포 가이드

## 배포 전 확인사항 (차단 요인)

다음 세 가지가 해결되어야 프로덕션 배포가 가능합니다:

1. **이용약관 확정** — 법적 검토 완료 필요
2. **배포 환경 선정** — 호스팅 공급자 결정 (Vercel, AWS, 자체 서버 등)
3. **KBO 데이터 사용 허락** — 데이터 출처 및 사용 권한 문서 확보

## 환경 변수

`.env.local` 예시:

```env
# 사이트
NEXT_PUBLIC_SITE_URL=https://yaguking.example.com

# Supabase (프로덕션 값으로 교체 필요)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# 데이터베이스 (직접 연결, Supavisor 트랜잭션 모드)
DATABASE_URL=postgresql://postgres:password@db.supabase.co:5432/postgres

# 연결 풀 (프로덕션 트래픽에 맞게 튜닝)
DATABASE_POOL_MAX=20

# 게스트 토큰 시크릿 (32자 이상, 반드시 변경 필요)
GUEST_TOKEN_SECRET=your-32-char-or-longer-secret-key

# 레이트 리밋 (E2E 전용, 프로덕션에서는 설정하지 않음)
# RATE_LIMIT=off

# 신뢰 프록시 수 (프록시 구성에 따라 조정)
TRUSTED_PROXY_COUNT=1
```

### 환경 변수 설명

| 변수 | 필수 | 설명 |
|------|------|------|
| `DATABASE_URL` | 예 | PostgreSQL 연결 문자열 |
| `DATABASE_POOL_MAX` | 아니오 | 연결 풀 최대 개수 (기본값: 10) |
| `GUEST_TOKEN_SECRET` | 예 | 게스트 토큰 서명 키 (32자 이상) |
| `TRUSTED_PROXY_COUNT` | 아니오 | 신뢰 프록시 수 (기본값: 1) |
| `RATE_LIMIT` | 아니오 | `off`로 설정 시 레이트 리밋 비활성화 (E2E 전용) |

## 연결 풀 튜닝 가이드

성능 측정 결과에 따른 권장값:

| 동시 사용자 | 권장 풀 크기 | 예상 p95 |
|------------|-------------|----------|
| ~50명 | 10 | ~250ms |
| ~100명 | 20~30 | 측정 필요 |
| ~200명 이상 | 30+ | 측정 필요 |

`DATABASE_POOL_MAX` 환경변수로 조정하세요. 연결 풀을 너무 크게 잡으면 DB 연결 과부하가 발생할 수 있으니, 모니터링하며 점진적으로 상향하세요.

## 배포 체크리스트

- [ ] `.env.production` 파일 생성 및 모든 환경 변수 설정
- [ ] `GUEST_TOKEN_SECRET`을 32자 이상 안전한 값으로 변경
- [ ] `DATABASE_POOL_MAX`를 예상 트래픽에 맞게 설정
- [ ] TypeScript 타입 체크 통과 (`npm run typecheck`)
- [ ] ESLint 통과 (`npm run lint`)
- [ ] 단위 테스트 통과 (`npm run test:unit`)
- [ ] 통합 테스트 통과 (Docker/Supabase 환경 필요, `npm run test`)
- [ ] E2E 테스트 통과 (`npm run test:e2e`)
- [ ] 이용약관 및 개인정보처리방침 페이지 배포 확인
- [ ] KBO 데이터 사용 허락 문서 보관

## 로컬 개발 실행

```bash
# 의존성 설치
npm install

# 로컬 Supabase 시작 (Docker 필요)
npm run db:start

# DB 마이그레이션 적용
npm run db:reset

# 시드 데이터 추가
npm run seed:questions

# 개발 서버 실행
npm run dev
```

## 로그 및 모니터링

- API 오류는 `handle()` 래퍼에서 `requestId`와 오류 코드만 로그에 기록 (개인정보 미포함)
- 500 에러는 `console.error`로 출력
- 레이트 리밋 카운터 실패 시 경고 로그 출력 후 요청 통과 (가용성 우선)

## 보안 주의사항

프로덕션 배포 전 반드시 확인:

1. `GUEST_TOKEN_SECRET`을 기본값에서 변경
2. `NEXT_PUBLIC_SUPABASE_ANON_KEY`와 `SUPABASE_SERVICE_ROLE_KEY`를 프로덕션 값으로 교체
3. `RATE_LIMIT=off` 설정 제거 (E2E 전용)
4. HTTPS 강제 적용
5. 쿠키 `secure` 플래그 설정 (`process.env.NODE_ENV === 'production'`)
