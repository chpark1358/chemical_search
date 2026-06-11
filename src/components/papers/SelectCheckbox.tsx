"use client";

/**
 * 행 좌측 다중 선택 체크박스. 행 클릭/키보드 선택을 트리거하지 않도록
 * 클릭/변경 이벤트의 전파를 막는다.
 */
interface SelectCheckboxProps {
  checked: boolean;
  onChange: () => void;
  label: string;
}

export default function SelectCheckbox({ checked, onChange, label }: SelectCheckboxProps) {
  return (
    <input
      aria-label={label}
      checked={checked}
      className="mt-1 size-4 shrink-0 cursor-pointer accent-primary"
      data-testid="row-select"
      onChange={onChange}
      onClick={(event) => event.stopPropagation()}
      type="checkbox"
    />
  );
}
