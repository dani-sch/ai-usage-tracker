import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir:'./test/e2e', timeout:60000, workers:1, fullyParallel:false, reporter:'list', use:{ trace:'retain-on-failure' } });
