import { useState } from 'react';
import { RControl } from 'rlayers';
import HelpMenu from '../HelpModal';

export function MapControls(): JSX.Element {
    const [helpIsOpen, setHelpIsOpen] = useState(false);

    return (
        <>
            <RControl.RCustom className="example-control">
                <button onClick={() => setHelpIsOpen(true)}>?</button>
            </RControl.RCustom>
            {helpIsOpen && <HelpMenu isOpen={helpIsOpen} setIsOpen={setHelpIsOpen} />}
        </>
    );
}