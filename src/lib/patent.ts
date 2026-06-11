/**
 * 특허 공개번호(publication_number) 관련 헬퍼.
 *
 * 공개번호 앞 두 글자는 발행 관할(국가/기구) 코드인 경우가 많다(예: US123..., EP456...).
 * 단, KIPRIS는 코드 없이 숫자로 시작하는 한국 공개번호(예: 1020200012345)를 주기도 하므로
 * 영문 접두사가 없을 때를 별도로 처리한다.
 */

export type PatentCountry = "US" | "KR" | "EP" | "WO" | "CN" | "JP" | "기타";

const KNOWN_COUNTRIES: ReadonlyArray<Exclude<PatentCountry, "기타">> = [
  "US",
  "KR",
  "EP",
  "WO",
  "CN",
  "JP"
];

/**
 * 공개번호에서 관할 코드를 추정한다.
 * - 앞 두 글자가 알려진 국가/기구 코드면 그대로 반환.
 * - 숫자로 시작하면(코드 없는 한국형 공개번호) KR로 간주.
 * - 그 외에는 "기타".
 */
export function parsePatentCountry(publicationNumber: string | null | undefined): PatentCountry {
  const value = (publicationNumber ?? "").trim().toUpperCase();
  if (!value) return "기타";

  const prefix = value.slice(0, 2);
  if ((KNOWN_COUNTRIES as readonly string[]).includes(prefix)) {
    return prefix as PatentCountry;
  }

  // 숫자로 시작하는 공개번호는 KIPRIS(한국)에서 주로 온다.
  if (/^\d/.test(value)) return "KR";

  return "기타";
}

const COUNTRY_LABELS: Record<PatentCountry, string> = {
  US: "미국 (US)",
  KR: "한국 (KR)",
  EP: "유럽 (EP)",
  WO: "국제 (WO)",
  CN: "중국 (CN)",
  JP: "일본 (JP)",
  기타: "기타"
};

export function patentCountryLabel(country: PatentCountry): string {
  return COUNTRY_LABELS[country];
}
