export default function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <p className="text-xs font-medium uppercase tracking-[0.03em] text-primary">
        Chemical Papers
      </p>
      <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.03em] text-ink">
        화학물질 하나로 관련 논문을 찾습니다
      </h1>
      <p className="max-w-md text-sm leading-6 text-ink-subtle">
        물질명, SMILES, InChIKey, 분자식을 입력하면 PubChem으로 구조를 확인하고
        Semantic Scholar와 Crossref에서 관련 논문을 모아 보여 드립니다.
      </p>
    </div>
  );
}
