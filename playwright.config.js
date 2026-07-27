const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
    testDir: './tests/frontend',
    timeout: 45000,
    expect: { timeout: 12000 },
    fullyParallel: false,
    retries: 0,
    workers: 1,
    reporter: [['list']],
    use: {
        baseURL: process.env.MEMORIZ_BASE_URL || 'http://127.0.0.1:4173',
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
        video: 'off'
    },
    webServer: {
        command: 'python -m http.server 4173 --bind 127.0.0.1',
        url: 'http://127.0.0.1:4173/index.html',
        reuseExistingServer: !process.env.CI,
        timeout: 15000
    },
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] }
        }
    ]
});
