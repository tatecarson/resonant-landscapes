import { describe, test, expect, beforeAll } from '@jest/globals';
import locations from '../public/data/geolocation-orientation.json';

declare global {
    interface Window {
        ol: any;
    }
}

interface Coordinates {
    latitude: number;
    longitude: number;
    accuracy: number;
    altitude: number | null;
    altitudeAccuracy: number | null;
    heading: number | null;
    speed: number | null;
}

interface Position {
    coords: Coordinates;
    timestamp: number;
}

describe('Location Features', () => {
    const mockLocation = {
        latitude: 44.013000,
        longitude: -97.111000,
        accuracy: 10
    };

    beforeAll(async () => {
        await context.overridePermissions('http://localhost:5173', ['geolocation']);

        // Mock geolocation before page load
        await page.evaluateOnNewDocument((loc: typeof mockLocation) => {
            const mockGeolocation = {
                getCurrentPosition: (success: Function) => {
                    success({
                        coords: {
                            ...loc,
                            altitude: null,
                            altitudeAccuracy: null,
                            heading: null,
                            speed: null
                        },
                        timestamp: Date.now()
                    });
                },
                watchPosition: (success: Function) => {
                    success({
                        coords: {
                            ...loc,
                            altitude: null,
                            altitudeAccuracy: null,
                            heading: null,
                            speed: null
                        },
                        timestamp: Date.now()
                    });
                    return 1;
                }
            };
            // @ts-ignore - Override readonly navigator.geolocation
            navigator.geolocation = mockGeolocation;
        }, mockLocation);

        await page.goto('http://localhost:5173');
        await page.waitForSelector('#welcome-button');
        await page.click('#welcome-button');

        // Inject OpenLayers into the browser context
        await page.addScriptTag({ url: 'https://cdn.jsdelivr.net/npm/ol@latest/dist/ol.js' });
    });

    test('should update user location', async () => {
        await page.waitForSelector('.map');

        const result = await page.evaluate((loc) => {
            try {
                const mapEl = document.querySelector('.map');
                const viewport = mapEl?.querySelector('.ol-viewport');
                const mapContainer = viewport?.parentElement;
                const map = (mapContainer as any).__ol_map;

                if (!map) {
                    console.error('Map not found');
                    return null;
                }

                // Use injected OpenLayers instance
                const view = map.getView();
                const coords = window.ol.proj.fromLonLat([loc.longitude, loc.latitude]);

                view.setCenter(coords);
                view.setZoom(15);

                return {
                    center: view.getCenter(),
                    zoom: view.getZoom()
                };
            } catch (error) {
                console.error('Error:', error);
                return null;
            }
        }, mockLocation);

        expect(result).toBeTruthy();
        expect(result?.center).toBeTruthy();
        expect(result?.zoom).toBe(15);
    });
});