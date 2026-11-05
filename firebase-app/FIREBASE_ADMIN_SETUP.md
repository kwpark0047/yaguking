# Firebase 관리자 접근 설정 가이드

이 문서는 야구왕 Firebase 프로젝트(`yaguking-bc25c`)의 Firestore에
관리자(Admin SDK) 접근 권한을 확보하는 방법을 설명합니다.

## 1. Firebase 콘솔에서 서비스 계정 키 생성

1. [Firebase 콘솔](https://console.firebase.google.com/)에 접속
2. 프로젝트 `yaguking-bc25c` 선택
3. **프로젝트 설정(톱니바퀴) > 서비스 계정** 탭으로 이동
4. **새 비공개 키 생성** 버튼 클릭
5. JSON 파일을 다운로드하여 안전한 곳에 보관(커밋 금지)

## 2. 관리자 SDK 초기화 스크립트 생성

`firebase-app/ops/admin-sdk.mjs` 파일을 생성합니다:

```javascript
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

let adminDb;

export function getAdminDb() {
  if (adminDb) return adminDb;
  if (getApps().length === 0) {
    const serviceAccount = JSON.parse(
      readFileSync(process.env.FIREBASE_SERVICE_ACCOUNT_PATH, 'utf8'),
    );
    initializeApp({ credential: cert(serviceAccount) });
  }
  adminDb = getFirestore();
  return adminDb;
}
```

## 3. 환경 변수 설정

`.env.local` (로컬) 또는 배포 환경의 환경 변수에 추가:

```env
FIREBASE_SERVICE_ACCOUNT_PATH=/path/to/yaguking-bc25c-firebase-adminsdk.json
```

## 4. Firestore 보안 규칙 — analytics 컬렉션 추가

`firestore.rules`에 다음 규칙을 추가하여 이벤트 쓰기를 허용합니다:

```
    // ── 마케팅 이벤트 추적 ──
    // 인증된 사용자(비회원 익명 포함)가 자신의 이벤트만 씀
    match /analytics/events/{eventId} {
      allow create: if signedIn()
        && request.resource.data.uid == request.auth.uid
        && request.resource.data.keys().hasOnly([
          'name', 'uid', 'isMember', 'sessionId', 'at', 'path', 'utm', 'data'
        ]);
      // 읽기는 관리자만
      allow read: if isAdmin();
    }
```

보안 규칙 배포:
```bash
cd firebase-app
npx firebase deploy --only firestore:rules --project yaguking-bc25c
```

## 5. 관리자 권한 부여

관리자 이메일에 `admin` 커스텀 클레임을 부여해야 합니다.
`firebase-app/ops/set-admin.mjs`를 참조하여 Admin SDK로 설정:

```javascript
import { getAuth } from 'firebase-admin/auth';
import { getAdminDb } from './admin-sdk';

async function setAdmin(uid: string, email: string) {
  await getAuth().setCustomUserClaims(uid, { admin: true, email_verified: true });
  console.log(`${email}(${uid}) 관리자 권한 부여 완료`);
}
```

사용법:
```bash
FIREBASE_SERVICE_ACCOUNT_PATH=... node ops/set-admin.mjs <uid> <email>
```

## 6. 이벤트 추적 연동 예시

회원 가입 완료 시점:

```typescript
import { analytics } from '@/lib/analytics';

// 가입 완료 후
await analytics.signupComplete(uid, isMember, 'email', ageConfirmed);
```

경기 완료 시점:

```typescript
await analytics.gameComplete(uid, isMember, mode, runs, pa, correct, homeRuns);
```

UTM 캡처는 앱 최초 로드 시 한 번 호출:

```typescript
import { persistUtm } from '@/lib/utm';
persistUtm();
```

## 7. 배포 체크리스트

- [ ] Firebase 서비스 계정 키 JSON 파일을 배포 서버에 배치
- [ ] `FIREBASE_SERVICE_ACCOUNT_PATH` 환경 변수 설정
- [ ] Firestore 보안 규칙에 `analytics` 컬렉션 규칙 추가 및 배포
- [ ] 관리자 커스텀 클레임(`admin: true`) 부여
- [ ] 이벤트 추적 코드를 주요 전환 지점에 연동
- [ ] UTM 캡처를 앱 진입점에 연동

## 참고

- Firebase 프로젝트 ID: `yaguking-bc25c`
- 웹 앱 설정: `.env.production.local` 참조
- 보안 규칙 파일: `firestore.rules`
- 기존 관리자 로그: `adminLogs` 컬렉션(2년 보관, 법정 1년 이상)