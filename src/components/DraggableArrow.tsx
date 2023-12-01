import React, { useEffect, useState } from 'react';

const Draggable = () => {
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [rotation, setRotation] = useState(0);
    const [isDragging, setIsDragging] = useState(false);

    const handleMouseDown = (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
        setIsDragging(true);
    };

    const handleMouseMove = (e: MouseEvent) => {
        if (isDragging) {
            setRotation(rotation + e.movementX);
        }
    };

    const handleMouseUp = () => {
        setIsDragging(false);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
        switch (e.key) {
            case 'ArrowUp':
                setPosition(prev => ({ ...prev, y: prev.y - 10 }));
                break;
            case 'ArrowDown':
                setPosition(prev => ({ ...prev, y: prev.y + 10 }));
                break;
            case 'ArrowLeft':
                setPosition(prev => ({ ...prev, x: prev.x - 10 }));
                break;
            case 'ArrowRight':
                setPosition(prev => ({ ...prev, x: prev.x + 10 }));
                break;
            default:
                break;
        }
    };

    useEffect(() => {
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        window.addEventListener('keydown', handleKeyDown);

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [isDragging, position, rotation]);

    return (
        <div
            style={{
                position: 'absolute',
                left: `${position.x}px`,
                top: `${position.y}px`,
                cursor: isDragging ? 'grabbing' : 'grab',
                userSelect: 'none',
                transform: `rotate(${rotation}deg)`,
            }}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
        >
            <span style={{ fontSize: '6em' }}>➡️</span>
        </div>
    );
};

export default Draggable;