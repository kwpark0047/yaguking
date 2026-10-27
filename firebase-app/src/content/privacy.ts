import { GUEST_DAILY_GAMES } from '@/lib/game/guestLimit';
import { GUEST_RETENTION_DAYS, ROOM_RETENTION_HOURS, SEEN_QUESTIONS_KEPT } from '@/lib/privacy/retention';

/**
 * 개인정보처리방침 — **Firebase판 시행본**(2026-10-27 시행, 16 문서 §4 "15" 줄).
 *
 * 기존 앱의 시행본(src/content/privacy.ts, Supabase·Vercel 기준)을 바탕으로, 사실 관계를 이
 * 앱의 코드에서 다시 가져왔다:
 *   - 항목: Firebase Authentication(이메일·구글·익명), Firestore 문서(docs/data-model.md), 기기 저장소 키
 *   - 보관: retention.ts(지우는 것은 ops/cleanup.mjs), 탈퇴·만 14세 미만 삭제는 src/lib/profile/save.ts
 *   - 권리: 설정 화면에 실제로 있는 기능만
 * 운영 주체·보호책임자는 운영자가 15 문서 §5에 적은 값이다.
 *
 * **확정(2026-10-26, 운영자)**: 운영자가 내용을 검토하고 확정했다. 시행일 2026-10-27. 확정 근거:
 *   - 저장 위치: 실제 Firestore가 asia-northeast3(서울) — docs/deploy-log.md
 *   - 보관 기간: 정리 작업(ops/cleanup.mjs)을 **운영자 PC의 예약 작업**으로 매일 돌린다. 운영자가 직접 하는
 *     처리라 위탁이 아니다. GitHub Actions 정리 워크플로는 꺼져 있다 — 켜면 GitHub(미국)를 위탁·국외 이전에 넣는다
 * 바꿀 때는 시행 7일 전(불리하면 30일 전) 알리고 시행일을 고친다.
 */
export const PRIVACY_DRAFT = false;
export const PRIVACY_EFFECTIVE_DATE: string | null = '2026-10-27';

/** 운영자가 15 문서 §5에 적은 값 */
export const PRIVACY_OPERATOR = '위마켓';
export const PRIVACY_OFFICER = { name: '박강원', phone: '010-3890-0047' } as const;

/** 이 앱이 기기 저장소(localStorage)에 쓰는 키 — 단위 테스트가 코드와 대조한다 */
export const DEVICE_STORAGE_KEYS = ['yk_seen_questions', 'yk_room_nickname'] as const;

export interface PolicyTable {
  head: readonly string[];
  rows: readonly (readonly string[])[];
}

export interface PolicySection {
  id: string;
  title: string;
  lead?: string;
  paragraphs?: readonly string[];
  items?: readonly string[];
  table?: PolicyTable;
}

export const PRIVACY_INTRO = `${PRIVACY_OPERATOR}(이하 "운영자")은 야구 상식 퀴즈 게임 "야구왕"(이하 "서비스")을 운영하며 「개인정보 보호법」에 따라 이용자의 개인정보를 보호합니다. 이 방침은 서비스가 어떤 개인정보를 왜 처리하고, 얼마나 보관하며, 이용자가 무엇을 할 수 있는지 알려 드립니다.`;

export const PRIVACY_SECTIONS: readonly PolicySection[] = [
  {
    id: 'purpose',
    title: '1. 처리 목적',
    items: [
      '회원 식별과 로그인',
      '경기 진행과 기록 저장 — 개인 퀴즈 기록, 누적 성적(비공식), 레벨 테스트 결과, 오답노트',
      '친구 대결 진행 — 같은 방 참가자에게 이름과 점수 보여 주기',
      `비회원 경기 횟수 제한(하루 ${GUEST_DAILY_GAMES}판)`,
      '비회원으로 쌓은 기록을 가입한 계정으로 이어 가기',
    ],
  },
  {
    id: 'items',
    title: '2. 처리하는 개인정보 항목',
    table: {
      head: ['구분', '항목', '수집 방법'],
      rows: [
        ['회원', '이메일, 닉네임, 최애 구단(최대 3개), 최애 선수(직접 입력, 선택·최대 3명)', '가입·프로필 설정·설정 화면에서 입력'],
        ['회원', '만 14세 이상임을 확인한 시각(생년월일은 받지 않음)', '가입 직후 확인 화면에서 답함'],
        [
          '회원(구글 로그인)',
          '구글 계정 식별자, 이메일 — 구글이 함께 보내는 이름·프로필 사진 주소는 인증 서비스에 저장될 수 있음',
          '구글 로그인 시 구글로부터 받음',
        ],
        [
          '회원·비회원 활동',
          '경기 기록(타석별 문항·선택·정답 여부·응답 시간·판정), 누적 성적, 레벨 테스트 결과, 오답노트(틀린 문항·횟수·복습 시각)',
          '경기·복습을 하면 자동 생성',
        ],
        ['비회원', '익명 계정 식별자(인증 서비스가 발급), 그날 한 경기 수', '처음 경기를 시작할 때 자동 발급·기록'],
        ['친구 대결', '방에서 쓰는 이름(비회원은 직접 입력), 답·점수', '방을 만들거나 들어갈 때 입력, 풀면 자동 생성'],
        [
          '자동 수집',
          '접속 주소(IP), 브라우저 정보, 로그인 일시',
          '로그인과 서비스 전송 과정에서 인증·호스팅 서비스(Google)가 처리',
        ],
      ],
    },
    paragraphs: ['서비스는 이름, 생년월일, 전화번호, 성별, 결제 정보를 받지 않습니다. 광고나 방문 분석 도구도 쓰지 않습니다.'],
  },
  {
    id: 'retention',
    title: '3. 보유 기간과 파기',
    table: {
      head: ['항목', '보유 기간'],
      rows: [
        ['회원 정보와 회원 활동 기록', '회원 탈퇴 시까지. 탈퇴하면 즉시 파기'],
        ['비회원 계정과 그 활동 기록', `마지막 이용 후 ${GUEST_RETENTION_DAYS}일. 그 전에 가입하면 회원 기록으로 이어짐`],
        ['친구 대결 방과 참가 기록(이름·답·점수)', `방을 만든 뒤 ${ROOM_RETENTION_HOURS}시간`],
      ],
    },
    paragraphs: [
      '보유 기간이 지난 정보는 매일 정리 작업으로 삭제합니다. 정해진 시각에 실행되지 못한 날의 몫은 다음 실행 때 함께 삭제합니다. 삭제한 정보는 복구할 수 없습니다.',
      '회원 탈퇴(설정 › 계정 삭제) 시 이메일·닉네임·경기 기록·누적 성적·레벨 테스트 결과·오답노트가 함께 삭제됩니다. 비회원 시절에 쌓은 기록도 같은 계정이라 함께 삭제됩니다.',
      '다른 법령에 따라 보관해야 하는 정보가 생기면 그 근거와 기간을 이 방침에 추가합니다.',
    ],
  },
  {
    id: 'public',
    title: '4. 다른 사람에게 보이는 정보',
    items: [
      `친구 대결: 같은 방 참가자에게 방에서 쓰는 이름, 푼 문항 수, 점수, 순위가 보입니다. 방 코드(초대 링크)를 아는 로그인 이용자는 참가하지 않아도 그 방 참가자의 이름·답·점수를 볼 수 있습니다. 방은 ${ROOM_RETENTION_HOURS}시간 뒤 삭제됩니다.`,
      '닉네임은 다른 회원과 겹치지 않게 하려고 사용 여부를 확인할 수 있습니다. 닉네임으로 이메일이나 기록을 찾아볼 수는 없습니다.',
    ],
  },
  {
    id: 'third-party',
    title: '5. 제3자 제공',
    paragraphs: ['운영자는 이용자의 개인정보를 제3자에게 제공하지 않습니다. 법령에 특별한 규정이 있는 경우는 예외입니다.'],
  },
  {
    id: 'outsourcing',
    title: '6. 처리 위탁',
    table: {
      head: ['수탁자', '위탁 업무'],
      rows: [
        ['Google LLC (Firebase)', '회원 인증(Firebase Authentication), 데이터 보관(Cloud Firestore, 서울 리전), 서비스 전송(Firebase Hosting)'],
      ],
    },
    paragraphs: [
      '구글 로그인을 쓰는 경우 로그인 과정은 구글의 개인정보처리방침을 따릅니다.',
      '보유 기간이 지난 정보를 지우는 정리 작업은 운영자가 직접 실행합니다.',
    ],
  },
  {
    id: 'overseas',
    title: '7. 국외 이전',
    lead: '경기 기록 등 서비스 데이터는 국내(서울 리전)에 저장합니다. 다만 회원 인증과 서비스 전송은 아래와 같이 국외에서 처리될 수 있어 알립니다.',
    table: {
      head: ['구분', '내용'],
      rows: [
        ['이전받는 자', 'Google LLC (firebase.google.com)'],
        ['이전 국가', '미국 등 Google이 서비스를 운영하는 국가'],
        ['이전 시기와 방법', '가입·로그인·서비스 이용 때마다 네트워크를 통해 전송'],
        ['이전 항목', '이메일, 계정 식별자, 로그인 일시, 접속 주소(IP), 브라우저 정보, (구글 로그인 시) 이름·프로필 사진 주소'],
        ['이전 목적', '회원 인증, 서비스 전송'],
        ['보유·이용 기간', `회원 탈퇴 시까지(비회원은 마지막 이용 후 ${GUEST_RETENTION_DAYS}일)`],
        ['거부 방법과 그 결과', '서비스 이용을 멈추면 이전되지 않습니다. 서비스 제공에 꼭 필요하므로 거부하면 서비스를 이용할 수 없습니다.'],
      ],
    },
  },
  {
    id: 'rights',
    title: '8. 이용자의 권리와 행사 방법',
    items: [
      '열람: 경기 결과·오답노트·설정 화면에서 볼 수 있습니다. 그 밖의 정보는 아래 개인정보 보호책임자에게 요청하세요.',
      '정정: 설정에서 닉네임·최애 구단·최애 선수 변경',
      '삭제(탈퇴): 설정 › 계정 삭제 — 닉네임을 입력해 확인하면 즉시 삭제',
      '비회원 기록 삭제, 처리 정지 등 그 밖의 요청: 아래 개인정보 보호책임자에게 연락',
    ],
  },
  {
    id: 'children',
    title: '9. 만 14세 미만 아동',
    paragraphs: [
      '서비스는 법정대리인 동의 절차를 두고 있지 않아 만 14세 미만 아동의 회원 가입을 받지 않습니다.',
      '가입하면 만 14세 이상인지 묻습니다. 확인하기 전에는 회원 기록이 쌓이지 않습니다. 만 14세 미만이라고 답하면 그 계정과, 비회원으로 쌓은 기록까지 즉시 삭제합니다.',
    ],
  },
  {
    id: 'device',
    title: '10. 기기에 저장하는 정보',
    lead: '서비스는 쿠키를 쓰지 않고, 이용자의 브라우저 저장소에 아래 정보를 둡니다.',
    table: {
      head: ['이름', '용도', '보관'],
      rows: [
        ['yk_seen_questions', `최근 본 문항 ${SEEN_QUESTIONS_KEPT}개 — 다음 경기에서 같은 문항을 뒤로 미룸`, '브라우저 저장소를 지울 때까지'],
        ['yk_room_nickname', '비회원이 친구 대결에서 쓴 이름 — 다음에 미리 채움', '브라우저 저장소를 지울 때까지'],
        ['firebase로 시작하는 저장소', '로그인 상태 유지(인증 서비스)', '로그아웃할 때까지'],
        ['firestore로 시작하는 저장소', '받은 기록을 기기에 남겨 다시 읽지 않기(데이터 서비스의 오프라인 저장)', '브라우저 저장소를 지울 때까지 — 로그아웃해도 남습니다. 여러 사람이 쓰는 기기라면 사이트 데이터를 지워 주세요'],
      ],
    },
    paragraphs: ['브라우저 설정에서 사이트 데이터를 지울 수 있습니다. 지우면 로그인이 풀리고, 비회원이면 그동안의 기록을 이어 갈 수 없습니다.'],
  },
  {
    id: 'security',
    title: '11. 안전성 확보 조치',
    items: [
      '데이터베이스 보안 규칙으로 다른 이용자의 기록을 읽거나 쓸 수 없게 합니다.',
      '서비스와 이용자 사이의 모든 통신은 HTTPS로 암호화합니다.',
      '관리 작업은 키 파일 없이 짧게 유효한 인증으로만 실행하고, 필요한 최소 권한만 줍니다.',
      '배포 전마다 결과물에 비밀 키·관리용 정보가 섞이지 않았는지 자동 점검합니다.',
      '개인정보에 접근할 수 있는 관리 권한은 최소 인원에게만 주고 정기적으로 점검합니다.',
    ],
  },
  {
    id: 'officer',
    title: '12. 개인정보 보호책임자',
    items: [`성명: ${PRIVACY_OFFICER.name}`, `연락처: ${PRIVACY_OFFICER.phone}`],
  },
  {
    id: 'remedy',
    title: '13. 권익 침해 구제',
    paragraphs: ['개인정보 침해에 대한 신고나 상담이 필요하면 아래 기관에 문의할 수 있습니다.'],
    items: [
      '개인정보침해신고센터: (국번 없이) 118',
      '개인정보 분쟁조정위원회: 1833-6972',
      '대검찰청: (국번 없이) 1301',
      '경찰청: (국번 없이) 182',
    ],
  },
  {
    id: 'changes',
    title: '14. 방침의 변경',
    paragraphs: [
      '이 방침을 바꾸면 시행 7일 전부터 서비스 안에 알립니다. 이용자에게 불리한 변경은 30일 전부터 알립니다.',
      `시행일: ${PRIVACY_EFFECTIVE_DATE ?? '확정 전(공개일에 정함)'}`,
    ],
  },
];

// ── 개정(2026-11-03 시행) — 관리자 1차(docs/admin-plan.md §8) ─────────────────────────────
// 2026-10-27에 공지(시행 7일 전). 운영자가 회원 정보를 보는 관리 화면과 그 접속기록을 알린다.
// 이용자에게 불리한 변경(수집 항목·제3자 제공·국외 이전 확대)이 아니라 운영 관리 목적·안전조치의 고지로 보고 7일 전 공지로 했다
// — 운영자 확인 사항(docs/deploy-log.md).

export interface PrivacyVersion {
  effective: string;
  sections: readonly PolicySection[];
  /** 이전 판에서 바뀐 점(개정 예고·안내에 보여 준다) */
  changes: readonly string[];
}

/** 운영자 열람·처리 기록(관리자 접속기록) 보관 기간 — 정리 작업(ops/cleanup.mjs)이 지난 것을 지운다 */
export const ADMIN_LOG_RETENTION_YEARS = 2;

/** 이 판부터 운영자가 회원 정보를 볼 수 있다(관리 화면·계정 사본) — 관리자 사이트와 ops/admin.mjs가 이 날짜를 지킨다 */
export const ADMIN_PRIVACY_EFFECTIVE = '2026-11-03';
const AMENDMENT_EFFECTIVE = ADMIN_PRIVACY_EFFECTIVE;

function amend(sections: readonly PolicySection[]): PolicySection[] {
  return sections.map((section) => {
    switch (section.id) {
      case 'purpose':
        return { ...section, items: [...(section.items ?? []), '서비스 운영 관리 — 가입 상태 점검, 이용자 문의·요청 처리, 공지사항 게시'] };
      case 'items':
        return {
          ...section,
          table: {
            ...section.table!,
            rows: [
              ...section.table!.rows,
              ['운영 관리', '운영자가 회원 정보를 열람·처리한 기록(대상 계정 식별자, 한 일, 일시)', '운영자가 관리 화면을 쓸 때 자동 생성'],
            ],
          },
        };
      case 'retention':
        return {
          ...section,
          table: {
            ...section.table!,
            rows: [
              ...section.table!.rows,
              ['운영자의 열람·처리 기록(접속기록)', `${ADMIN_LOG_RETENTION_YEARS}년. 그 뒤 정리 작업으로 삭제`],
            ],
          },
          paragraphs: [
            ...(section.paragraphs ?? []),
            '운영 관리를 위해 로그인 계정 정보(이메일·로그인 수단·가입 일시)의 사본을 관리 화면에 두며, 계정이 삭제되면 다음 날 정리 작업 때 함께 삭제합니다.',
          ],
        };
      case 'security':
        return {
          ...section,
          items: [
            ...(section.items ?? []),
            '회원 정보를 볼 수 있는 관리 화면은 별도 주소에 두고, 지정된 운영자의 구글 계정으로만 들어갈 수 있으며, 30분 동안 쓰지 않으면 로그아웃됩니다.',
            `운영자가 회원 정보를 열람·처리한 기록을 남기고 ${ADMIN_LOG_RETENTION_YEARS}년간 보관하며, 이 기록은 고치거나 지울 수 없게 합니다.`,
            '관리 화면에서 이메일은 가려서 보여 주고, 필요할 때만 열람하며 그 열람도 기록합니다.',
          ],
        };
      case 'changes':
        return { ...section, paragraphs: [section.paragraphs![0]!, `시행일: ${AMENDMENT_EFFECTIVE}`] };
      default:
        return section;
    }
  });
}

/** 판 목록(시행일 순). 화면은 오늘(한국 날짜) 시행 중인 판을 보여 주고, 다음 판이 있으면 개정 예고를 띄운다 */
export const PRIVACY_VERSIONS: readonly PrivacyVersion[] = [
  { effective: PRIVACY_EFFECTIVE_DATE ?? '', sections: PRIVACY_SECTIONS, changes: [] },
  {
    effective: AMENDMENT_EFFECTIVE,
    sections: amend(PRIVACY_SECTIONS),
    changes: [
      '처리 목적에 "서비스 운영 관리(가입 상태 점검, 문의·요청 처리, 공지사항 게시)"를 더했습니다.',
      `운영자가 회원 정보를 열람·처리한 기록(접속기록)을 남기고 ${ADMIN_LOG_RETENTION_YEARS}년간 보관합니다.`,
      '관리 화면의 보호 조치(별도 주소, 지정 운영자의 구글 계정만, 30분 자동 로그아웃, 이메일 가림)를 안전성 확보 조치에 적었습니다.',
      '수집하는 항목, 제3자 제공, 처리 위탁, 국외 이전은 바뀌지 않았습니다.',
    ],
  },
];

/** 한국 날짜 "YYYY-MM-DD" */
export function kstDateKey(now: number = Date.now()): string {
  return new Date(now + 9 * 3_600_000).toISOString().slice(0, 10);
}

export function versionInForce(today: string = kstDateKey()): PrivacyVersion {
  return [...PRIVACY_VERSIONS].reverse().find((version) => version.effective <= today) ?? PRIVACY_VERSIONS[0]!;
}

export function upcomingVersion(today: string = kstDateKey()): PrivacyVersion | null {
  return PRIVACY_VERSIONS.find((version) => version.effective > today) ?? null;
}
