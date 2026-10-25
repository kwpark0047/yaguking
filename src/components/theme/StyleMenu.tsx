'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { readStylePreference, type StylePreference } from '@/lib/theme/style';
import { StylePicker } from './StylePicker';

/**
 * "화면" 메뉴 — 비회원도 화면 스타일을 고를 수 있는 진입점.
 *
 * 설정 화면은 회원 전용이라, 체험 사용자가 대부분인 비회원은 고를 곳이 없었다.
 * 비회원에게는 랜딩이 곧 첫 타석이므로 경기 화면 헤더와 결과 화면에 둔다.
 *
 * 설계 판단
 *   - 패널을 **본문 위에 띄운다.** 본문 사이에 끼우면 문제와 보기가 밀려
 *     밀린 자리를 잘못 누를 수 있다
 *   - 모달이 아니다. 열어 둔 채로 화면 변화를 바로 볼 수 있어야 한다
 *   - Esc·바깥 누르기·닫기 버튼으로 닫히고, 닫히면 초점이 버튼으로 돌아온다
 *   - Esc는 여기서 소비한다. 경기 화면에서 Esc는 "나가기" 확인을 여는데,
 *     메뉴를 닫으려다 경기를 나가려는 창이 뜨면 안 된다
 *
 * 현재 선택값은 쿠키에서 읽는다(서버에 남기지 않는다). 렌더 중에 document를
 * 읽으면 하이드레이션이 깨지므로 마운트 뒤에 읽는다.
 */
export function StyleMenu({
  warning,
  onOpenChange,
  align = 'right',
}: {
  /** 열었을 때 맨 위에 보일 경고. 예: 타석 시간이 흐르는 중 */
  warning?: string | null;
  onOpenChange?: (open: boolean) => void;
  align?: 'left' | 'right';
}) {
  const [open, setOpen] = useState(false);
  const [preference, setPreference] = useState<StylePreference | null>(null);
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setPreference(readStylePreference(document.cookie));
  }, []);

  const change = useCallback(
    (next: boolean, { restoreFocus = false } = {}) => {
      setOpen(next);
      onOpenChange?.(next);
      if (!next && restoreFocus) buttonRef.current?.focus();
    },
    [onOpenChange],
  );

  // 열려 있는 동안만: Esc로 닫기(가로채기), 바깥을 누르면 닫기
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      // 캡처 단계에서 멈춰 경기 화면의 Esc(나가기 확인)까지 가지 않게 한다.
      event.stopPropagation();
      event.preventDefault();
      change(false, { restoreFocus: true });
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) change(false);
    };

    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open, change]);

  // 열리면 패널 안 선택된 항목으로 초점을 옮긴다
  useEffect(() => {
    if (!open) return;
    const panel = document.getElementById(panelId);
    const target =
      panel?.querySelector<HTMLInputElement>('input[type="radio"]:checked') ??
      panel?.querySelector<HTMLInputElement>('input[type="radio"]');
    target?.focus();
  }, [open, panelId]);

  return (
    <div ref={wrapperRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => change(!open)}
        className="flex min-h-11 items-center gap-1 rounded-option px-2 text-sm text-ink-2"
      >
        <span aria-hidden="true">◐</span>
        화면
      </button>

      <div
        id={panelId}
        hidden={!open}
        // 경기 화면의 답 단축키(1~4, A·S·D·F)가 이 안에서 눌린 키를 가져가지 않게 표시한다
        data-shortcuts="off"
        className={[
          'absolute top-full z-30 mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-card border p-3 shadow-lg',
          align === 'right' ? 'right-0' : 'left-0',
        ].join(' ')}
        // 카드 배경: 경고 글자(--out)와 본문 글자의 대비가 테스트로 보장된 조합이다
        style={{ borderColor: 'var(--line)', backgroundColor: 'var(--bg-card)' }}
      >
        {warning && (
          <p className="mb-2 text-xs font-semibold break-keep" style={{ color: 'var(--out)' }}>
            {warning}
          </p>
        )}
        {preference && <StylePicker initial={preference} />}
        <button
          type="button"
          onClick={() => change(false, { restoreFocus: true })}
          className="mt-3 flex min-h-11 w-full items-center justify-center rounded-option border text-sm"
          style={{ borderColor: 'var(--line)' }}
        >
          닫기
        </button>
      </div>
    </div>
  );
}
