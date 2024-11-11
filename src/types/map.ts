// src/types/map.ts
export interface MapProps {
    center: [number, number];
    zoom: number;
    children?: React.ReactNode;
}

export interface GeolocationProps {
    onPositionChange?: (coords: [number, number]) => void;
}