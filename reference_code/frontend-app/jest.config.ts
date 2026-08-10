import type { Config } from 'jest';
import nextJest from 'next/jest';

const createJestConfig = nextJest({
  dir: './',
});

const config: Config = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    // 시각화 라이브러리는 스텁(ESM 변환 회피 + 차트 내부는 테스트 대상 아님)
    '^recharts$': '<rootDir>/__mocks__/chart-stub.tsx',
    '^@nivo/heatmap$': '<rootDir>/__mocks__/chart-stub.tsx',
    '^@nivo/sunburst$': '<rootDir>/__mocks__/chart-stub.tsx',
    '^@nivo/bar$': '<rootDir>/__mocks__/chart-stub.tsx',
    '^@xyflow/react$': '<rootDir>/__mocks__/chart-stub.tsx',
    '^@xyflow/react/dist/style.css$': '<rootDir>/__mocks__/style-stub.ts',
    '^@/(.*)$': '<rootDir>/$1',
  },
  testPathIgnorePatterns: ['<rootDir>/.next/', '<rootDir>/node_modules/', '<rootDir>/e2e/'],
};

const ESM_PATTERNS = [
  'react-markdown',
  'remark-.*',
  'unified',
  'bail',
  'trough',
  'vfile.*',
  'devlop',
  'unist-.*',
  'hast-.*',
  'estree-.*',
  'property-information',
  'space-separated-tokens',
  'comma-separated-tokens',
  'mdast-.*',
  'micromark.*',
  'trim-lines',
  'ccount',
  'escape-string-regexp',
  'markdown-table',
  'longest-streak',
  'zwitch',
  'decode-named-character-reference',
  'character-entities.*',
  'character-reference-invalid',
  'is-plain-obj',
  'is-alphabetical',
  'is-alphanumerical',
  'is-decimal',
  'is-hexadecimal',
  'html-url-attributes',
  'parse-entities',
  'stringify-entities',
].join('|');

const jestConfigFn = createJestConfig(config);

export default async function () {
  const resolved = await jestConfigFn();
  resolved.transformIgnorePatterns = [
    `node_modules/(?!(${ESM_PATTERNS})/)`,
  ];
  return resolved;
}
