import { AlertTriangle, LogIn, RotateCw } from "lucide-react";

type BannerKind = "partial" | "failed" | "pollFailed" | "unauthorized";

interface StatusBannerProps {
  kind: BannerKind;
  message?: string | null;
  failedProviders?: string[];
  onRetry?: () => void;
  /** 세션 만료(unauthorized) 시 재로그인으로 보낼 경로(예: /login?next=...). */
  loginHref?: string;
}

function sanitizeMessage(message: string | null | undefined): string | null {
  if (!message) return null;
  const trimmed = message.replace(/\s+/g, " ").trim();
  if (!trimmed) return null;
  return trimmed.length > 280 ? `${trimmed.slice(0, 280)}…` : trimmed;
}

export default function StatusBanner({
  kind,
  message,
  failedProviders,
  onRetry,
  loginHref = "/login"
}: StatusBannerProps) {
  if (kind === "unauthorized") {
    return (
      <div
        className="panel-highlight rounded-xl border border-hairline bg-surface-1 px-4 py-4"
        data-testid="status-banner"
        role="alert"
      >
        <div className="flex items-start gap-2.5">
          <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-danger" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-ink">세션이 만료되었습니다.</p>
            <p className="mt-1 text-sm leading-5 text-ink-subtle">
              세션이 만료되었습니다. 다시 로그인해 주세요.
            </p>
          </div>
        </div>
        <a
          className="ml-[26px] mt-3 inline-flex h-8 items-center gap-1.5 rounded-lg border border-hairline bg-surface-2 px-3 text-sm text-ink transition-colors duration-150 hover:bg-surface-3"
          data-testid="status-banner-login"
          href={loginHref}
        >
          <LogIn aria-hidden="true" className="size-3.5" />
          다시 로그인
        </a>
      </div>
    );
  }

  if (kind === "partial") {
    return (
      <div
        className="flex items-start gap-2.5 rounded-xl border border-hairline bg-surface-1 px-4 py-3"
        role="alert"
      >
        <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-danger" />
        <div className="min-w-0 text-sm text-ink-muted">
          <p className="font-medium text-ink">일부 출처에서 결과를 가져오지 못했습니다.</p>
          {failedProviders?.length ? (
            <p className="mt-0.5 text-xs text-ink-subtle">
              문제가 발생한 출처: {failedProviders.join(", ")}
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  const isPollFailed = kind === "pollFailed";
  const title = isPollFailed ? "응답이 지연되고 있습니다." : "검색에 실패했습니다.";
  const detail = isPollFailed
    ? "서버 응답이 늦어지고 있습니다. 잠시 후 다시 확인해 주세요."
    : sanitizeMessage(message);
  const retryLabel = isPollFailed ? "재시도" : "다시 시도";

  return (
    <div
      className="panel-highlight rounded-xl border border-hairline bg-surface-1 px-4 py-4"
      data-testid="status-banner"
      role="alert"
    >
      <div className="flex items-start gap-2.5">
        <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-danger" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-ink">{title}</p>
          {detail ? (
            <p className="mt-1 text-sm leading-5 text-ink-subtle">{detail}</p>
          ) : null}
        </div>
      </div>
      {onRetry ? (
        <button
          className="ml-[26px] mt-3 flex h-8 items-center gap-1.5 rounded-lg border border-hairline bg-surface-2 px-3 text-sm text-ink transition-colors duration-150 hover:bg-surface-3"
          onClick={onRetry}
          type="button"
        >
          <RotateCw aria-hidden="true" className="size-3.5" />
          {retryLabel}
        </button>
      ) : null}
    </div>
  );
}
