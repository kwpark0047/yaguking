/**
 * 만 14세 미만 자녀 가입 — 법정대리인(보호자) 메일 동의(운영자 결정 2026-11-23: 자녀 별도 계정 + 보호자 메일 동의).
 *
 * 1. 자녀가 가입하고 "만 14세 미만"이라고 답하면, 보호자 메일 주소만 받는다(동의를 받으려고 — 개인정보 보호법 제22조의2 ②).
 *    계정은 동의 전까지 기록을 남기지 못한다(규칙: 확인된 회원만 쓰기)
 * 2. 화면이 동의 코드와 동의 내용을 담은 메일 쓰기(mailto)를 보여 준다. **보호자가 그 주소에서** 야구왕 동의 메일 주소로 보낸다
 * 3. 운영자가 받은 메일의 보낸 주소가 자녀가 적은 주소와 같은지 보고 운영자 PC에서 승인한다
 *    (`admin-cli guardian-approve --code=… --email=…`) — 관리자 기록이 남고, 운영자가 보호자에게 확인 메일로 답한다
 * 4. 7일 안에 동의가 없으면 0시 작업이 계정과 보호자 메일 주소를 지운다(ops/guardian.mjs)
 *
 * 동의를 받은 자녀 계정: 가족팀에만 합류(감독·코치 불가), 월간 등수에는 이름 대신 '익명 선수', 친구 초대 코드 없음.
 * 이 파일은 Firebase를 불러오지 않는다.
 */
import { SQUAD_START, squadsOpen } from '@/lib/squad/squad';

/**
 * 보호자 동의 메일을 받는 야구왕 운영 메일 주소(운영자 결정 2026-11-24). 처리방침 9절(만 14세 미만 아동)과 12-15 개정 공지에 실린다.
 * null이면 자녀 가입 길을 보여 주지 않는다.
 */
export const GUARDIAN_CONSENT_EMAIL: string | null = 'kwpark0047@gmail.com';

/** 화면이 쓰는 동의 메일 주소 — 에뮬레이터 개발·E2E에서만 VITE_GUARDIAN_EMAIL로 시험 주소를 넣을 수 있다(squadStart와 같은 방식) */
export function guardianConsentEmail(): string | null {
  const env = import.meta.env as Record<string, string | undefined> | undefined;
  const override = env?.VITE_GUARDIAN_EMAIL;
  return env?.VITE_USE_EMULATORS !== 'false' && override ? override : GUARDIAN_CONSENT_EMAIL;
}

/** 동의를 기다리는 기간 — 지나면 0시 작업이 계정을 지운다. ops/guardian.mjs와 같아야 한다(단위 테스트) */
export const GUARDIAN_WAIT_DAYS = 7;
/** 동의 절차가 시작되는 날(처리방침 개정판 시행일) — 팀 시작일과 같다 */
export const GUARDIAN_START = SQUAD_START;

/** 동의 코드 — 초대·팀 코드와 같은 글자. firestore.rules의 정규식과 같아야 한다 */
export const GUARDIAN_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{6}$/;

/** 보호자 메일 주소 — 단순 형식 확인(실제 주소인지는 보호자가 보낸 메일로 확인한다). firestore.rules와 같은 길이 한도 */
export const GUARDIAN_EMAIL_MAX = 100;
export const isGuardianEmail = (value: string) => value.length <= GUARDIAN_EMAIL_MAX && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
export const normalizeEmail = (value: string) => value.trim().toLowerCase();

/** 자녀 가입 길을 보여 줄지 — 시행일이 지났고 동의 메일 주소가 정해졌을 때만 */
export const guardianSignupOpen = (now: number = Date.now(), email: string | null = guardianConsentEmail()) => !!email && squadsOpen(now);

/** 보호자가 보낼 메일의 제목·본문(동의 내용). 보호자는 이름과 관계를 적고 그대로 보낸다 */
export function guardianMail(code: string, nickname: string | null): { subject: string; body: string } {
  return {
    subject: `[야구왕] 보호자 동의 ${code}`,
    body: [
      '야구왕 보호자 동의서',
      '',
      `동의 코드: ${code}`,
      nickname ? `자녀 계정 닉네임: ${nickname}` : '자녀 계정: 동의 후 닉네임을 정합니다',
      '보호자 이름: ',
      '자녀와의 관계: ',
      '',
      '저는 위 자녀의 법정대리인으로서, 자녀가 야구왕(KBO 야구 상식 퀴즈 게임)에 회원으로 가입하고 아래 개인정보를 처리하는 데 동의합니다.',
      '- 처리하는 정보: 자녀의 로그인 메일 주소, 닉네임, 최애 구단·선수, 경기·출석·공식전 기록, 팀 소속(가족팀만)과 팀원에게 보이는 닉네임·기여 점수',
      '- 목적: 게임 기록 보관, 가족팀 운영. 자녀 이름은 월간 등수에 공개하지 않습니다(익명 선수)',
      '- 보관: 자녀 계정을 지울 때까지(보호자가 이 메일 주소로 삭제를 요청할 수 있습니다)',
      '- 이 메일 주소(보호자)는 동의 확인과 보호자 요청 처리에만 씁니다',
      '- 동의하지 않을 수 있으며, 그러면 자녀 계정은 7일 뒤 지워집니다',
      '',
      '자세한 내용: 야구왕 개인정보처리방침 9절',
    ].join('\n'),
  };
}

export function guardianMailto(email: string, code: string, nickname: string | null): string {
  const { subject, body } = guardianMail(code, nickname);
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export type { GuardianState } from './gate';
