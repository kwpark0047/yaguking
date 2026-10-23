/**
 * 오류 표시 (08 문서 §9).
 *
 * 사람이 읽을 문구를 먼저 보여 주고, `requestId`는 **접힌 영역**에 둔다.
 * 식별자를 숨기면 문의가 들어와도 서버 로그와 대조할 단서가 없고,
 * 앞에 내세우면 평범한 사용자에게 위협적으로 보인다.
 */
export function ErrorNotice({
  message,
  requestId,
  action,
}: {
  message: string;
  requestId?: string | undefined;
  action?: React.ReactNode;
}) {
  return (
    <div
      className="flex flex-col gap-2 rounded-option border p-3"
      style={{ borderColor: 'var(--out)' }}
      role="alert"
    >
      <p className="text-sm break-keep" style={{ color: 'var(--out)' }}>
        {message}
      </p>

      {action}

      {requestId && (
        <details className="text-xs text-ink-2">
          <summary className="min-h-11 cursor-pointer leading-[44px]">
            문의용 정보
          </summary>
          <p className="num-tabular break-all">
            요청 ID: {requestId}
          </p>
          <p className="mt-1">문의하실 때 이 값을 함께 알려 주시면 빠릅니다.</p>
        </details>
      )}
    </div>
  );
}
