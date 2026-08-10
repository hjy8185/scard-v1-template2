'use client';

/** U63c — 상세 탭이 항상 같은 항목을 보이되, 근거가 없으면 **왜 없는지**를 말한다.
 *
 * 왜: 탭 구성이 답변마다 달라지면 발표 중 "있던 탭이 없어졌다"가 되고(사용자 신고
 * "연결 해부탭이 없어진거 같은데?"), 없는 이유도 알 수 없다. 빈 화면 대신 이 안내를
 * 두면 "이 답변은 그 근거를 쓰지 않았다"가 그 자체로 정직한 정보가 된다.
 */
export function EmptyDetail({ label, reason, pending }: {
  label: string; reason: string; pending?: boolean;
}) {
  // U63c: 답변 도착 **전**에는 "없음"이라 단정할 수 없다(근거가 아직 안 왔을 뿐).
  // 그대로 두면 질문 직후 우측이 "이 답변에는 없음"으로 오해를 준다(캡처로 확인).
  if (pending) {
    return (
      <div className="flex h-full items-center justify-center p-6" data-testid="detail-pending">
        <div className="text-sm" style={{ color: 'var(--mist)' }}>
          {label} — 근거 도착 대기 중…
        </div>
      </div>
    );
  }
  return (
    <div className="flex h-full items-center justify-center p-6"
      data-testid={`empty-detail-${label}`}>
      <div className="max-w-md rounded-[var(--r-md)] p-5 text-center"
        style={{ border: '1px dashed var(--ink-600)', background: 'var(--ink-800)' }}>
        <div className="text-sm font-semibold" style={{ color: 'var(--mist)' }}>
          {label} — 이 답변에는 없음
        </div>
        <p className="mt-2 text-[13px]" style={{ color: 'var(--mist)' }}>{reason}</p>
        <p className="mt-2 text-[13px]" style={{ color: 'var(--flow-solid)' }}>
          다른 항목은 [상세 ▾]에서 그대로 볼 수 있습니다.
        </p>
      </div>
    </div>
  );
}
