import React from 'react';
import { RControl } from "rlayers";
import HelpMenu from "../modals/HelpModal";

interface MapControlsProps {
    helpIsOpen: boolean;
    setHelpIsOpen: (isOpen: boolean) => void;
}

export function MapControls({ helpIsOpen, setHelpIsOpen }: MapControlsProps) {
    return (
        <>
            <RControl.RCustom className="example-control">
                <button onClick={() => setHelpIsOpen(true)}>
                    ?
                </button>
            </RControl.RCustom>
            {helpIsOpen && <HelpMenu isOpen={helpIsOpen} setIsOpen={setHelpIsOpen} />}
        </>
    );
}