import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // .claude/worktrees/ holds nested checkouts for background agent tasks;
    // without this, their copies of this repo's own *.test.ts files get
    // picked up too, double-counting (and double-running) every test.
    // Spread Vitest's own defaults (node_modules, dist, .git, ...) rather
    // than replacing them outright.
    exclude: [...configDefaults.exclude, '**/.claude/worktrees/**'],
  },
});
