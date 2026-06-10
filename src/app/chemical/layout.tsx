import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Chemical Search",
  description: "공개 화학·논문 데이터 기반 구조 검색 작업공간"
};

export default function ChemicalLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
