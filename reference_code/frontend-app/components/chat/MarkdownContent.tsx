'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';

interface MarkdownContentProps {
  content: string;
  onCitationClick?: (ref: string) => void;
  className?: string;
  // U16 2번: 온톨로지 라벨(closure/categories) — 본문에 등장하면 자동 cite pill화(F1 불변, 에이전트 태그 불필요).
  ontologyLabels?: string[];
}

// 정규식 특수문자 이스케이프(라벨을 안전히 패턴화).
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Convert <<CITE:label>> tags into markdown links that the custom `a` renderer
 * intercepts as inline pill buttons. Also auto-pill ontology labels (U16 2번)
 * so the FR-1 "'생활' 분류" sentence links to the asset-map subsumption bridge.
 */
function preprocessCitations(content: string, ontologyLabels: string[] = []): string {
  // Strip fenced JSON citations block — `{` 와 `"citations"` 사이 줄바꿈/들여쓰기 허용
  // (LLM이 `{\n  "citations"` 로 예쁘게 출력하는 경우가 다수 — 기존 `\{"citations"` 는 놓쳤음).
  // U40d: 게이트 교정 마커 — 마커가 있으면 그 이전(LLM 원본)을 폐기하고 교정본만 렌더
  const corrIdx = content.lastIndexOf('\u200b[CORRECTED]\u200b');
  if (corrIdx >= 0) content = content.slice(corrIdx + '\u200b[CORRECTED]\u200b'.length);
  let cleaned = content.replace(/```json\s*\{\s*"citations"[\s\S]*?```/g, '');
  // 코드펜스 없는 bare JSON citations 도(끝부분 greedy)
  cleaned = cleaned.replace(/\s*:?\s*\{\s*"citations"\s*:\s*\[[\s\S]*\]\s*\}\s*$/g, '');
  // 안전망: 위로도 남으면 코드펜스 안 citations JSON 전체 제거
  cleaned = cleaned.replace(/```json\s*\{[\s\S]*?"citations"[\s\S]*?```/g, '');
  cleaned = cleaned.replace(
    /<<CITE:([^>]+)>>/g,
    (_match, label: string) => {
      const trimmed = label.trim();
      return `[${trimmed}](#cite:${encodeURIComponent(trimmed)})`;
    },
  );
  // U16 2번: 온톨로지 라벨 자동 pill화 — 각 라벨의 '첫 등장 1회'만(과다 pill 방지).
  // 표(|) 안·이미 링크([..]) 안은 건드리지 않도록 단순 경계 매칭 + 1회 치환.
  const seen = new Set<string>();
  for (const raw of ontologyLabels) {
    const label = (raw || '').trim();
    if (!label || label.length < 2 || seen.has(label)) continue;
    seen.add(label);
    // 이미 링크로 감싸지지 않은 첫 등장만 치환(대괄호/파이프 직후 제외는 과설계 — 1회 치환으로 충분).
    const re = new RegExp(`(?<!\\[)(?<!#cite:)${escapeRe(label)}`);
    cleaned = cleaned.replace(re, `[${label}](#cite:${encodeURIComponent(label)})`);
  }
  return cleaned;
}

export function MarkdownContent({
  content,
  onCitationClick,
  className,
  ontologyLabels,
}: MarkdownContentProps) {
  const processed = preprocessCitations(content, ontologyLabels);

  const components: Components = {
    a: ({ href, children }) => {
      if (href?.startsWith('#cite:')) {
        const ref = decodeURIComponent(href.slice(6));
        return (
          <button
            type="button"
            className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[13px] font-medium transition-colors cursor-pointer align-baseline mx-0.5"
            style={{ background: 'color-mix(in srgb, var(--jade) 15%, transparent)', color: 'var(--jade)' }}
            onClick={(e) => {
              e.preventDefault();
              onCitationClick?.(ref);
            }}
            title={ref}
          >
            {children}
          </button>
        );
      }
      return (
        <a href={href} target="_blank" rel="noopener noreferrer">
          {children}
        </a>
      );
    },
    table: ({ children }) => (
      <div className="overflow-x-auto my-2">
        <table>{children}</table>
      </div>
    ),
  };

  return (
    <div className={className}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {processed}
      </ReactMarkdown>
    </div>
  );
}
