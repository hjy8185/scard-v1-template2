/** U63 P1 — 채팅 소실 진단 계측.
 *
 * 배경: 사용자 신고 "말풍선이 잠깐 보였다가 사라져". **예외·boundary 로그가 전혀 없다**고
 * 확인됐다(사용자 응답 3번). 예외가 없다면 React 관점에서는 정상적인 언마운트 또는 상태
 * 초기화다. 남는 경로는 셋뿐이고, 이 모듈이 그것을 구분한다:
 *
 *   A. ChatPanel 재마운트      → mount 카운터가 2 이상으로 증가
 *   B. messages가 빈 값 교체    → mount 1 고정 + 길이 N→0 전이 기록
 *   C. useChat 인스턴스 교체    → sid(인스턴스 id) 변경
 *
 * 추측 패치를 반복하지 않기 위해, 증상 발생 시 **화면의 값 하나로 원인이 확정**되게 한다.
 * 기록은 sessionStorage에 누적(새로고침 전까지 보존)하고 footer에 요약을 상시 표시한다.
 * 원인 확정 후 제거한다.
 */

const KEY = 'cg-chat-diag';

export interface DiagState {
  mounts: number;            // ChatPanel 마운트 횟수(2+ = 재마운트 발생)
  sid: string;               // 현재 useChat 인스턴스 식별자
  sids: string[];            // 인스턴스 변경 이력
  maxMsgs: number;           // 관측된 최대 messages 길이
  drops: string[];           // 길이 감소 전이 기록 "12.3s 4→0 (sid ab12, mount 1)"
  lastLen: number;
  startedAt: number;
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function read(): DiagState {
  if (typeof sessionStorage === 'undefined') {
    return { mounts: 0, sid: '', sids: [], maxMsgs: 0, drops: [], lastLen: 0, startedAt: 0 };
  }
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as DiagState;
  } catch {
    /* 무시 — 진단이 앱을 막지 않는다 */
  }
  return { mounts: 0, sid: '', sids: [], maxMsgs: 0, drops: [], lastLen: 0, startedAt: now() };
}

function write(s: DiagState): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* 무시 */
  }
}

/** ChatPanel 마운트 시 1회. 반환 = 이번 인스턴스의 sid. */
export function recordMount(): string {
  const s = read();
  s.mounts += 1;
  const sid = Math.random().toString(36).slice(2, 6);
  s.sid = sid;
  s.sids = [...(s.sids ?? []), sid].slice(-6);
  if (!s.startedAt) s.startedAt = now();
  // 재마운트는 그 자체가 원인 후보 A → 기록에 남긴다
  if (s.mounts > 1) {
    s.drops = [...(s.drops ?? []),
      `${((now() - s.startedAt) / 1000).toFixed(1)}s REMOUNT#${s.mounts} sid:${sid}`].slice(-8);
  }
  write(s);
  return sid;
}

/** messages 길이가 바뀔 때마다 호출. 감소(소실)를 포착한다. */
export function recordLen(len: number, sid: string): void {
  const s = read();
  if (len === s.lastLen) return;
  if (len < s.lastLen) {
    s.drops = [...(s.drops ?? []),
      `${((now() - (s.startedAt || now())) / 1000).toFixed(1)}s ${s.lastLen}→${len} sid:${sid} mount:${s.mounts}`,
    ].slice(-8);
  }
  s.lastLen = len;
  s.maxMsgs = Math.max(s.maxMsgs ?? 0, len);
  write(s);
}

export function readDiag(): DiagState {
  return read();
}

/** footer 표시용 한 줄. 소실이 있었다면 그것을 우선 노출한다. */
export function diagLine(): string {
  const s = read();
  const base = `mount:${s.mounts} msgs:${s.lastLen}/${s.maxMsgs} sid:${s.sid}`;
  if (s.drops?.length) return `${base} ⚠ ${s.drops[s.drops.length - 1]}`;
  return base;
}
