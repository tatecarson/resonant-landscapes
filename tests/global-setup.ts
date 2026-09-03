/**
 * Confirm the server behind baseURL is actually this app before any test runs.
 *
 * playwright.config.ts reuses an already-running server, which is a real
 * convenience while iterating — but it reuses whatever answers on the port,
 * without checking what it is. On 2026-08-30 an unrelated project's static
 * file server (also defaulting to 4173) had held the port for a day, and the
 * whole suite would have run against it.
 *
 * That failure mode is the dangerous kind: the tests run to completion against
 * the wrong server, so the result is meaningless in either direction. A green
 * run proves nothing; a red one sends you debugging an app that was never
 * under test. It surfaced here only because an assertion happened to look at
 * the document head and found it empty.
 */
import type { FullConfig } from "@playwright/test";

const MARKERS = ["<div id=\"root\">", "Resonant Landscapes"];

export default async function globalSetup(config?: FullConfig) {
    const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:4173";

    let response: Response;
    let body: string;
    try {
        response = await fetch(baseURL, { redirect: "follow" });
        body = await response.text();
    } catch (error) {
        // Nothing is listening yet. If this config declares a webServer,
        // Playwright is about to start it, or report a clearer failure than
        // this could. If it does not — playwright.browserstack.config.ts
        // drives a deployed URL from real devices — then nothing will ever
        // answer, and staying quiet here spends the whole build discovering
        // that once per device.
        if (config?.webServer) {
            void error;
            return;
        }

        throw new Error(
            [
                `Nothing answered at ${baseURL}, and this config has no webServer`,
                "to start one, so every test would fail at its first navigation.",
                `  cause: ${error instanceof Error ? error.message : String(error)}`,
                "",
                "Check PLAYWRIGHT_BASE_URL — a typo here is the difference between",
                "one clear failure and a full run of them.",
            ].join("\n")
        );
    }

    if (MARKERS.some((marker) => body.includes(marker))) {
        return;
    }

    const preview = body.trim().slice(0, 120).replace(/\s+/g, " ") || "(empty response)";
    throw new Error(
        [
            `The server at ${baseURL} is not Resonant Landscapes.`,
            `  status: ${response.status}`,
            `  body:   ${preview}`,
            "",
            "playwright.config.ts reuses an already-running server, so another",
            "project holding this port silently replaces the app under test.",
            "",
            "Find it with:  lsof -nP -iTCP:4173 -sTCP:LISTEN",
            "Then stop that process, or run this suite against another port with",
            "PLAYWRIGHT_EXTERNAL_SERVER=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:<port>",
        ].join("\n")
    );
}
