import React from 'react'
import { MeshWobbleMaterial } from '@react-three/drei'

const VERTICES_NUM = 64

function Ball(props) {
  const { color, factor, ...allTheRest } = props

  return (
    <group {...allTheRest}>
      <mesh>
        <torusGeometry attach="geometry" args={[1, 0.4, VERTICES_NUM, VERTICES_NUM]} />
        <MeshWobbleMaterial attach="material" factor={factor} speed={factor} metalness={0.1} roughness={0.9} color={color} />
      </mesh>
    </group>
  )
}

export default Ball
