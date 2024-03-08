import React, { useRef, useEffect, useState } from 'react';

// Define the colors as in the original example
const colors = [
    { r: 200, g: 41, b: 66 },
    { r: 157, g: 206, b: 160 },
    { r: 210, g: 180, b: 140 },
    { r: 160, g: 82, b: 45 },
    { r: 155, g: 135, b: 140 },
];

// Leaf class (converted to use plain JS syntax suitable for React)
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

    update() {
        this.ty += this.speed * 0.1;
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

// The React component
function LeavesCanvas() {
    const canvasRef = useRef(null);
    const [leaves, setLeaves] = useState([]);

    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;

        const update = () => {
            ctx.fillStyle = 'rgba(140, 180, 255, 1)';
            ctx.fillRect(0, 0, width, height);

            if (leaves.length < 25 && Math.random() > 0.8) {
                setLeaves([...leaves, new Leaf(ctx, width, height)]);
            }

            leaves.forEach(leaf => {
                leaf.update();
                leaf.show();
            });

            requestAnimationFrame(update);
        };

        update();
    }, [leaves]);

    return <canvas ref={canvasRef} width={300} height={200} />;
}

export default LeavesCanvas;
