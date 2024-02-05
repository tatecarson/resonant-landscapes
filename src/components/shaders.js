const vertexShader = `
    varying vec2 vUv;
    varying float v_depth;

    void main() {
        vUv = uv;
        v_depth = (mat3(modelViewMatrix) * position).z;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0) ;
    }
`

const fragmentShader = `
    #ifdef GL_ES
    precision mediump float;
    #endif
    
    #extension GL_OES_standard_derivatives : enable

    uniform vec2 u_resolution;
    uniform vec2 u_mouse;
    uniform float u_time;
    uniform float my_r;
    uniform float my_g;
    uniform float my_b;
    varying vec2 vUv;
    varying float v_depth;
    
    vec2 brickTile(vec2 _st, float _zoom){
        _st *= _zoom;
        return fract(_st);
    }
    
    float box(vec2 _st){
        float _size = 0.05;
        vec2 uv = smoothstep(_size, _size, _st);
        uv *= smoothstep(_size, _size, vec2(1.0) - _st);
        return uv.x * uv.y;
    }
    
    void main(void){
        vec2 st = vUv;

        float depth = 1.5 * smoothstep(-1.0, 1.0, v_depth);

        st = brickTile(st, 16.0);
    
        vec4 color = vec4(box(st));
    
        gl_FragColor = (1.0 - color) * depth;
    }
`

export { vertexShader, fragmentShader }
