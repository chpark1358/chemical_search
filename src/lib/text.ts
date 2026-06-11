/**
 * 텍스트 정제/강조 헬퍼.
 *
 * 외부(논문 API)에서 받은 초록에는 JATS/HTML 태그(<jats:p>, <i> 등)와
 * HTML 엔티티가 섞여 들어온다. 이를 안전하게 평문으로 바꾸고, 화합물명을
 * 강조할 수 있도록 React 노드용 토큰 배열을 만든다.
 *
 * 보안: dangerouslySetInnerHTML은 절대 사용하지 않는다. 태그는 파싱이 아니라
 * 제거하고, 결과는 항상 평문 문자열 또는 평문 토큰으로만 반환한다.
 */

/** 가장 흔한 명명 엔티티 + 수치 엔티티(10진/16진)를 디코드한다. */
const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  deg: "°",
  plusmn: "±",
  times: "×",
  middot: "·",
  alpha: "α",
  beta: "β",
  gamma: "γ",
  mu: "µ"
};

function decodeEntities(input: string): string {
  return input.replace(/&(#x?[0-9a-f]+|[a-z][a-z0-9]*);/gi, (match, body: string) => {
    if (body[0] === "#") {
      const isHex = body[1] === "x" || body[1] === "X";
      const codePoint = Number.parseInt(body.slice(isHex ? 2 : 1), isHex ? 16 : 10);
      if (Number.isFinite(codePoint) && codePoint > 0) {
        try {
          return String.fromCodePoint(codePoint);
        } catch {
          return match;
        }
      }
      return match;
    }
    const named = NAMED_ENTITIES[body.toLowerCase()];
    return named ?? match;
  });
}

/**
 * JATS/HTML 태그 제거 + 엔티티 디코드 + 공백 정리.
 * 반환값은 렌더에 그대로 쓸 수 있는 평문이다.
 */
export function sanitizeAbstract(raw: string | null | undefined): string {
  if (!raw) return "";
  // 1) 태그 제거: <jats:p>, </i>, <sub>, <xref ref-type="bibr"> 등 모든 꺾쇠 토큰.
  const withoutTags = raw.replace(/<[^>]*>/g, " ");
  // 2) 엔티티 디코드(태그 제거 후 수행해야 디코드된 '<'가 태그로 오인되지 않는다).
  const decoded = decodeEntities(withoutTags);
  // 3) 공백 정리: 모든 연속 공백/개행을 단일 스페이스로 접고 양끝을 자른다.
  return decoded.replace(/\s+/g, " ").trim();
}

/** 강조 토큰: hit=true면 일치 구간(<mark> 대상), false면 일반 텍스트. */
export interface HighlightToken {
  text: string;
  hit: boolean;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * text를 query 기준(대소문자 무시)으로 분할해 강조 토큰 배열로 반환한다.
 * 컴포넌트는 hit 토큰만 <mark>로 감싸 안전하게 렌더한다(HTML 주입 없음).
 * query가 비어 있거나 일치가 없으면 단일 일반 토큰을 반환한다.
 */
export function highlightTerm(text: string, query: string): HighlightToken[] {
  if (!text) return [];
  const term = query.trim();
  if (!term) return [{ text, hit: false }];

  const pattern = new RegExp(`(${escapeRegExp(term)})`, "gi");
  const parts = text.split(pattern);
  const tokens: HighlightToken[] = [];
  for (const part of parts) {
    if (!part) continue;
    tokens.push({ text: part, hit: part.toLowerCase() === term.toLowerCase() });
  }
  return tokens.length ? tokens : [{ text, hit: false }];
}
