import { describe, test, expect, beforeAll } from '@jest/globals';

describe('App', () => {
    beforeAll(async () => {
        await page.goto('http://localhost:5173');
    });

    test('should contain title text', async () => {
        const title = await page.title();
        expect(title).toBeTruthy();
    });

    test('should render without crashing', async () => {
        const element = await page.$('#root');
        expect(element).toBeTruthy();
    });

    test('should display the correct heading', async () => {
        await page.waitForSelector('h1');
        const heading = await page.$eval('h1', el => el.textContent);
        expect(heading).toBe('Welcome to Resonant Landscapes');
    });
});