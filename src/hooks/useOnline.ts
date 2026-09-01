import { useEffect, useState } from "react";

/**
 * Whether the phone currently has a network.
 *
 * navigator.onLine is trusted in one direction only, and that asymmetry is
 * the whole design. A false is reliable: browsers report it when there is no
 * usable interface at all. A true is not: a phone still associated with a
 * WiFi network it has walked out of range of reports online while every
 * request stalls, which is the exact failure help.tips already warns about.
 *
 * So this drives a notice that appears on false and disappears on true, and
 * nothing anywhere claims a connection is working on the strength of it.
 */
export function useOnline(): boolean {
    const [online, setOnline] = useState(() =>
        typeof navigator === "undefined" ? true : navigator.onLine !== false
    );

    useEffect(() => {
        const goOnline = () => setOnline(true);
        const goOffline = () => setOnline(false);

        // Re-read on mount: the connection can drop between the initial
        // useState and this effect running, the same way the reduced-motion
        // media query can.
        setOnline(navigator.onLine !== false);
        window.addEventListener("online", goOnline);
        window.addEventListener("offline", goOffline);

        return () => {
            window.removeEventListener("online", goOnline);
            window.removeEventListener("offline", goOffline);
        };
    }, []);

    return online;
}
