import React, { useRef, useEffect, useState } from 'react';

const colors = [
    { r: 200, g: 41, b: 66 },
    { r: 157, g: 206, b: 160 },
    { r: 210, g: 180, b: 140 },
    { r: 160, g: 82, b: 45 },
    { r: 155, g: 135, b: 140 },
];

class Leaf {
    constructor(ctx, width, height) {
        this.ctx = ctx;
        this.width = width;
        this.height = height;
        this.reset();
    }

    reset() {
        this.x1 = Math.random() * 20;
        this.y1 = Math.random() * 10 + 10;
        this.x2 = Math.random() * 20 + 20;
        this.y2 = Math.random() * 10;
        this.x3 = Math.random() * 20 + 40;
        this.y3 = Math.random() * 10 + 10;
        this.x4 = Math.random() * 20 + 20;
        this.y4 = Math.random() * 10 + 20;
        this.ty = Math.random() * -30 - 20;
        this.tx = Math.random() * this.width;
        this.speed = Math.random() * 1.5 + 0.5;
        this.randomColor = colors[Math.floor(Math.random() * colors.length)];
    }

    update(leafSpeed) {
        this.ty += this.speed * leafSpeed;
        if (this.ty > this.height + this.y4) {
            this.reset();
        }
    }

    show() {
        const { ctx } = this;
        ctx.fillStyle = `rgb(${this.randomColor.r}, ${this.randomColor.g}, ${this.randomColor.b})`;
        ctx.beginPath();
        ctx.moveTo(this.tx + this.x1, this.ty + this.y1);
        ctx.lineTo(this.tx + this.x2, this.ty + this.y2);
        ctx.lineTo(this.tx + this.x3, this.ty + this.y3);
        ctx.lineTo(this.tx + this.x4, this.ty + this.y4);
        ctx.closePath();
        ctx.fill();
    }
}

function map(value, start1, stop1, start2, stop2, withinBounds = false) {
    const newValue = ((value - start1) / (stop1 - start1)) * (stop2 - start2) + start2;
    const invertedValue = stop2 + start2 - newValue;
    if (!withinBounds) {
        return invertedValue;
    }
    if (start2 < stop2) {
        return Math.min(Math.max(invertedValue, start2), stop2);
    } else {
        return Math.max(Math.min(invertedValue, start2), stop2);
    }
}

// The React component
function LeavesCanvas({ parkDistance }) {
    const canvasRef = useRef(null);
    const leavesRef = useRef([]);
    const leafSpeedRef = useRef(0);

    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;

        leafSpeedRef.current = map(parkDistance, 2, 10, 0.5, 8, true);

        const updateLeaves = () => {
            if (leavesRef.current.length < 10 && Math.random() > 0.8) {
                leavesRef.current.push(new Leaf(ctx, width, height));
            }

            leavesRef.current.forEach(leaf => {
                leaf.update(leafSpeedRef.current);
                leaf.show();
            });

        };

        const update = () => {
            ctx.fillStyle = 'rgba(140, 180, 255, 1)';
            ctx.fillRect(0, 0, width, height);

            updateLeaves();

            requestAnimationFrame(update);
        };

        update();

        // Cleanup function to potentially clear the animation frame request
        return () => {
            cancelAnimationFrame(update);
        };
    }, [parkDistance]); // Depend on parkDistance to recreate the effect when it changes

    return <canvas ref={canvasRef} width={300} height={200} />;
}

export default LeavesCanvas;
