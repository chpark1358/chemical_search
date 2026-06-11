import next from "eslint-config-next";

const eslintConfig = [
  // 빌드 산출물은 린트 대상에서 제외한다 (dev: .next, Playwright: .next-playwright).
  // WSL/Windows 경로 혼합으로 경로 접두사가 어긋날 수 있어 ** 로 감싸 어느 위치에서도 매칭한다.
  {
    ignores: [
      "**/.next/**",
      "**/.next-playwright/**",
      "**/out/**",
      "**/node_modules/**"
    ]
  },
  ...next
];

export default eslintConfig;
