import { useState } from 'react';
import { RControl } from 'rlayers';
import HelpDialog from '../dialogs/HelpDialog';
import "ol/ol.css";
import './layers.css';

export function MapControlButtons(): JSX.Element {
    const [helpIsOpen, setHelpIsOpen] = useState(false);

    return (
        <>
            <RControl.RCustom className="example-control">
                <button onClick={() => setHelpIsOpen(true)}>?</button>
            </RControl.RCustom>
            {helpIsOpen && <HelpDialog isOpen={helpIsOpen} setIsOpen={setHelpIsOpen} />}
        </>
    );
}