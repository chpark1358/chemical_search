/** 입력 중인 요소(input/textarea/select/contentEditable)에서 발생한 이벤트인지 판별. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

const ACTIVATION_SELECTOR =
  "a, button, select, summary, [role='menu'], [role='menuitem']";

/**
 * Enter 키가 자체 활성화 동작을 갖는 컨트롤(링크/버튼/셀렉트/메뉴) 안에서
 * 발생했는지 판별. 전역 Enter 단축키가 이중 실행되지 않도록 거른다.
 */
export function isActivationTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.closest(ACTIVATION_SELECTOR) !== null;
}
