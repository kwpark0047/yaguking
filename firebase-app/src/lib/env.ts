/**
 * 빌드 시 정해지는 환경 값. Firebase SDK를 불러오지 않는다 — 첫 화면이 이 값만
 * 보려고 SDK 전체(수백 KB)를 내려받지 않게 한다(Hosting 무료 전송량 하루 360 MB).
 */
export const usingEmulators = import.meta.env.VITE_USE_EMULATORS !== 'false';
