/** 이렇게 놀아요 — 처음 앱 메인의 세 단계를 이 앱의 규칙(1이닝·15초·찬스 이벤트)에 맞게 옮겼다 */
const STEPS = [
  { emoji: '⚾', title: '문제가 날아와요', body: '야구 상식 문제 하나가 공 하나예요. 15초 안에 보기를 골라요.' },
  { emoji: '💥', title: '빨리 맞히면 홈런!', body: '빠르고 정확할수록 타구가 멀리 날아가요. 틀리거나 시간이 지나면 아웃.' },
  { emoji: '🏆', title: '3아웃이면 경기 끝', body: '1이닝이 끝나면 박스스코어가 남아요. 중간에 찬스 이벤트로 보너스도!' },
] as const;

export function HowToPlay() {
  return (
    <section aria-labelledby="how-title" className="flex flex-col gap-4">
      <h2 id="how-title" className="font-cute text-2xl">
        이렇게 놀아요
      </h2>
      <ol className="grid gap-4 sm:grid-cols-3">
        {STEPS.map((step, index) => (
          <li key={step.title} className="sticker flex gap-3 p-4">
            <span className="step-dot font-cute text-lg">{index + 1}</span>
            <div className="flex flex-col gap-1">
              <h3 className="font-cute text-lg">
                <span aria-hidden="true">{step.emoji} </span>
                {step.title}
              </h3>
              <p className="text-sm text-ink-2 break-keep">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
